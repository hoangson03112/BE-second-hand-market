const BankInfo = require("../models/BankInfo");
const Order = require("../models/Order");
const Address = require("../models/Address");
const PersonalDiscount = require("../models/PersonalDiscount");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const SellerReview = require("../models/SellerReview");
const Account = require("../models/Account");
const ghnService = require("../services/ghn.service");
const mongoose = require("mongoose");

/** shippingMethod được coi là GHN nếu chứa "ghn" (không phân biệt hoa thường) */
function isGhnShipping(shippingMethod) {
  return (
    typeof shippingMethod === "string" &&
    shippingMethod.toLowerCase().includes("ghn")
  );
}

const fetchSellerOrders = async (sellerId) => {
  return Order.find({ sellerId })
    .sort({ createdAt: -1 })
    .populate({
      path: "buyerId",
      select: "fullName email phoneNumber",
    })
    .populate({
      path: "products.productId",
      select: "name price images",
    })
    .populate({
      path: "shippingAddress",
      select: "fullName phoneNumber province district ward specificAddress",
    });
};

class OrderController {
  async confirmRefund(req, res) {
    try {
      const { orderId } = req.params;
      const order = await Order.findById(orderId);
      order.status = "refunded";
      order.ghnStatus = "refunded";
      order.refundDecision = "approved";

      order.refundCompletedAt = new Date();
      await order.save();
      return res.status(200).json({
        message: "Refund confirmed successfully",
        order: order,
      });
    } catch (error) {
      console.error("Error confirming refund:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async getOrderRefund(req, res) {
    try {
      const matchingOrders = await Order.find({
        $or: [
          { status: "refund", refundDecision: { $in: ["approved"] } },

          {
            status: "cancelled",
            shippingMethod: "ship-cod",
            statusPayment: true,
            paymentMethod: "bank_transfer",
          },
        ],
      }).select("_id");

      const orderIds = matchingOrders.map((order) => order._id);

      const bankInfos = await BankInfo.find({
        orderId: { $in: orderIds },
      })
        .populate({
          path: "orderId",
          populate: [
            {
              path: "products.productId",
              model: "Product",
              populate: [
                { path: "categoryId", model: "Category" },
                { path: "subcategoryId", model: "SubCategory" },
              ],
            },
            {
              path: "shippingAddress",
              model: "Address",
            },
            {
              path: "sellerId",
              model: "Account",
              select: "email fullName phoneNumber",
            },
            {
              path: "buyerId",
              model: "Account",
              select: "email fullName phoneNumber",
            },
          ],
        })
        .populate({
          path: "userId",
          select: "email fullName phoneNumber",
        });

      return res.status(200).json({ bankInfos });
    } catch (error) {
      console.error("Error fetching order refund:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async updateRefund(req, res) {
    try {
      const { orderId } = req.params;
      const { refundDecision, refundDecisionReason } = req.body;
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.status !== "refund") {
        return res
          .status(400)
          .json({ message: "Order is not in refund status" });
      }
      order.refundDecision = refundDecision;
      order.refundDecisionReason = refundDecisionReason;
      await order.save();
      return res.status(200).json({
        message: "Refund updated successfully",
        order: order,
      });
    } catch (error) {
      console.error("Error updating refund:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async createOrder(req, res) {
    try {
      const {
        products,
        totalAmount,
        shippingAddress,
        shippingMethod,
        sellerId,
        paymentMethod,
        productAmount: bodyProductAmount,
        shippingFee: bodyShippingFee,
        totalShippingFee,
        expectedDeliveryTime,
      } = req.body;

      if (!products || !totalAmount || !shippingAddress || !shippingMethod) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ!" });
      }

      // 1) Kiểm tra stock trước (chưa trừ) và lấy giá sản phẩm
      const productsWithPrice = [];
      for (const product of products) {
        const productData = await Product.findById(product.productId);
        if (!productData) {
          return res.status(404).json({ message: "Sản phẩm không tồn tại!" });
        }
        if (productData.stock < product.quantity) {
          return res
            .status(400)
            .json({
              message: `Sản phẩm "${productData.name}" không đủ số lượng! Chỉ còn ${productData.stock}.`,
            });
        }
        // Lưu giá sản phẩm tại thời điểm mua
        productsWithPrice.push({
          productId: product.productId,
          quantity: product.quantity,
          price: productData.price,
        });
      }

      await PersonalDiscount.findOneAndUpdate(
        {
          buyerId: req.accountID,
          sellerId,
          productId: { $in: products.map((p) => p.productId) },
        },
        { isUse: true }
      );
      const shippingFee = Number(bodyShippingFee ?? totalShippingFee ?? 0) || 0;
      const productAmount =
        typeof bodyProductAmount === "number"
          ? bodyProductAmount
          : Math.max(0, Number(totalAmount) - shippingFee);

      const newOrder = new Order({
        buyerId: req.accountID,
        sellerId,
        products: productsWithPrice,
        productAmount,
        shippingFee,
        totalAmount,
        shippingAddress,
        shippingMethod,
        paymentMethod,
        expectedDeliveryTime: expectedDeliveryTime
          ? new Date(expectedDeliveryTime)
          : undefined,
      });

      await newOrder.save();

      // 2) Trừ stock SAU KHI order lưu thành công trong DB
      for (const product of products) {
        const productData = await Product.findById(product.productId);
        if (productData) {
          productData.stock -= product.quantity;
          await productData.save();
        }
      }

      // KHÔNG tạo đơn GHN ngay khi buyer đặt hàng
      // GHN chỉ được tạo khi seller xác nhận đơn (status = confirmed)
      // Xem logic tại updateOrder() method

      res.status(201).json({ order: newOrder });
    } catch (error) {
      console.error("Error processing order:", error);

      // Trả về phản hồi lỗi
      res.status(500).json({ message: "Có lỗi xảy ra khi xử lý đơn hàng." });
    }
  }
  async getOrderByAccount(req, res) {
    try {
      const orders = await Order.find({ buyerId: req.accountID })
        .sort({ createdAt: -1 })
        .populate({
          path: "buyerId",
          select: "fullName email phoneNumber",
        })
        .populate({
          path: "sellerId",
          select: "fullName email phoneNumber",
        })
        .populate({
          path: "products.productId",
          select: "name price avatar images condition stock",
        })
        .populate({
          path: "shippingAddress",
          select: "fullName phoneNumber province district ward specificAddress",
        });

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this account" });
      }

      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Error fetching orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async updateOrder(req, res) {
    try {
      const { reason, orderId, status } = req.body;
      
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng!" });
      }

      // Xử lý logic theo từng status
      const updateData = { status, reason };
      
      if (status === "confirmed") {
        // Seller xác nhận đơn hàng → Tạo đơn GHN
        updateData.confirmedAt = new Date();
        
        // Tạo đơn GHN nếu shipping method là GHN
        const shouldCreateGhn = order.shippingAddress && isGhnShipping(order.shippingMethod);
        
        if (shouldCreateGhn) {
          try {
            const [address, seller, sellerAccount] = await Promise.all([
              Address.findById(order.shippingAddress).lean(),
              Seller.findOne({ accountId: order.sellerId })
                .populate("accountId", "fullName phoneNumber")
                .lean(),
              Account.findById(order.sellerId)
                .select("fullName phoneNumber")
                .lean(),
            ]);

            let fromAddress = null;

            if (seller?.from_district_id && seller?.from_ward_code) {
              // Verified seller (data cũ) → dùng địa chỉ trong Seller profile
              fromAddress = {
                from_province_id: seller.from_province_id,
                from_district_id: seller.from_district_id,
                from_ward_code: seller.from_ward_code,
                businessAddress: seller.businessAddress,
                province: seller.province,
                district: seller.district,
                ward: seller.ward,
                from_name: seller.accountId?.fullName,
                from_phone: seller.accountId?.phoneNumber,
              };
            } else {
              // Seller mới → lookup Address pickup mặc định
              const pickupAddr = await Address.findOne({
                accountID: order.sellerId,
                type: "pickup",
              }).lean();

              if (pickupAddr?.districtId && pickupAddr?.wardCode) {
                fromAddress = {
                  from_province_id: pickupAddr.provinceId,
                  from_district_id: pickupAddr.districtId,
                  from_ward_code: pickupAddr.wardCode,
                  businessAddress: pickupAddr.specificAddress || "",
                  from_address: pickupAddr.specificAddress || "",
                  from_name: pickupAddr.fullName || sellerAccount?.fullName,
                  from_phone: pickupAddr.phoneNumber || sellerAccount?.phoneNumber,
                };
              } else {
                // Buyer/unverified seller → lấy address từ Address ref trên product
                const firstProductInOrder = await Product.findById(order.products[0]?.productId)
                  .populate("address")
                  .lean();
                const productAddr = firstProductInOrder?.address;

                if (productAddr?.districtId && productAddr?.wardCode) {
                  fromAddress = {
                    from_province_id: productAddr.provinceId,
                    from_district_id: productAddr.districtId,
                    from_ward_code: productAddr.wardCode,
                    from_address: productAddr.specificAddress || "",
                    businessAddress: productAddr.specificAddress || "",
                    from_name: productAddr.fullName || sellerAccount?.fullName,
                    from_phone: productAddr.phoneNumber || sellerAccount?.phoneNumber,
                  };
                }
              }
            }

            if (address && fromAddress) {
              const isCOD = order.paymentMethod?.toLowerCase().includes("cod");
              console.log("Creating GHN order on CONFIRMED:", {
                orderId: String(order._id),
                fromDistrictId: fromAddress.from_district_id,
                toDistrictId: address.districtId,
              });
              
              const ghnData = await ghnService.createShippingOrder({
                orderId: String(order._id),
                fromAddress,
                toAddress: address,
                codAmount: isCOD ? order.productAmount : 0,
                weight: 500,
              });
              
              console.log("GHN order created:", ghnData.ghnOrderCode);
              Object.assign(updateData, ghnData);
            } else {
              console.warn("Cannot create GHN: Missing address information");
            }
          } catch (ghnErr) {
            console.error("Error creating GHN order:", ghnErr.message);
            // Vẫn cho phép xác nhận đơn dù GHN fail
          }
        }
        
      } else if (status === "picked_up") {
        updateData.pickedUpAt = new Date();
        
      } else if (status === "shipping") {
        updateData.shippingAt = new Date();
        
      } else if (status === "out_for_delivery") {
        updateData.outForDeliveryAt = new Date();
        
      } else if (status === "delivered") {
        updateData.deliveredAt = new Date();
        
      } else if (status === "completed") {
        updateData.completedAt = new Date();
        updateData.statusPayment = true;
        
        // Cập nhật số lượng đã bán
        const productIds = order.products.map((product) => product.productId);
        const productsData = await Product.find({ _id: { $in: productIds } });

        for (const product of productsData) {
          const productQuantity = order.products.find(
            (p) => p.productId.toString() === product._id.toString()
          );
          product.soldCount += productQuantity.quantity;
          await product.save();
        }
        
      } else if (status === "cancelled") {
        updateData.cancelledAt = new Date();
        
        // Hoàn lại số lượng sản phẩm vào kho
        const products = order.products;
        for (const product of products) {
          const productData = await Product.findById(product.productId);
          if (productData) {
            productData.stock += product.quantity;
            await productData.save();
          }
        }
        
      } else if (status === "failed") {
        updateData.failedAt = new Date();
        
      } else if (status === "returned") {
        updateData.returnedAt = new Date();
        
        // Hoàn lại số lượng sản phẩm
        const products = order.products;
        for (const product of products) {
          const productData = await Product.findById(product.productId);
          if (productData) {
            productData.stock += product.quantity;
            await productData.save();
          }
        }
      }

      // Cập nhật ghnStatus nếu cần
      if (["confirmed", "picked_up", "shipping", "out_for_delivery", "delivered"].includes(status)) {
        updateData.ghnStatus = status;
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true }
      );

      return res.status(200).json({ 
        order: updatedOrder, 
        message: "Cập nhật đơn hàng thành công" 
      });
    } catch (error) {
      console.error("Error updating order:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getOrdersByAdmin(req, res) {
    try {
      const orders = await Order.find()
        .sort({ createdAt: -1 })
        .populate("buyerId", "fullName email phoneNumber")
        .populate("sellerId", "fullName email phoneNumber createdAt")
        .populate({
          path: "products.productId",
          select: "name price images avatar createdAt",
          populate: [
            {
              path: "categoryId",
              select: "name",
            },
            {
              path: "subcategoryId",
              select: "name",
            },
            {
              path: "attributes",
              select: "key value",
            },
          ],
        })
        .populate("shippingAddress");

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this account" });
      }
      const sellerIds = [
        ...new Set(
          orders
            .filter((order) => order.sellerId && order.sellerId._id)
            .map((order) => order.sellerId._id)
        ),
      ];

      const sellers = await Seller.find({ accountId: { $in: sellerIds } });

      const sellerMap = new Map();
      sellers.forEach((seller) => {
        sellerMap.set(seller.accountId.toString(), seller);
      });

      const ordersWithSeller = orders.map((order) => {
        const seller =
          order.sellerId && order.sellerId._id
            ? sellerMap.get(order.sellerId._id.toString())
            : null;

        return {
          ...order.toObject(),
          sellerId: {
            ...(order.sellerId?.toObject() || {}),
            seller: seller
              ? {
                  _id: seller._id,
                  businessAddress: seller.businessAddress,
                  province: seller.province,
                  district: seller.district,
                  ward: seller.ward,
                  verificationStatus: seller.verificationStatus,
                }
              : null,
          },
        };
      });

      return res.status(200).json({ orders: ordersWithSeller });
    } catch (error) {
      console.error("Error fetching orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getTotalAmountOfOrder(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findById(id);
      return res.status(200).json({ totalAmount: order.totalAmount });
    } catch (error) {
      console.error("Error fetching total amount of order:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getOrderById(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findOne({ _id: id })
        .populate({
          path: "products.productId",
          model: "Product",
        })
        .populate("shippingAddress")
        .populate("sellerId");

      return res.status(200).json({ order });
    } catch (error) {
      console.error("Error fetching order by id:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getOrderToFeedBack(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findOne({ _id: id, buyerId: req.accountID })
        .populate({
          path: "products.productId",
          model: "Product",
        })
        .populate("sellerId")
        .populate("buyerId");
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      // Lấy thông tin đánh giá của seller
      const sellerId = order.sellerId._id;
      const sellerData = await Seller.findOne({ accountId: sellerId });
      const productCount = await Product.countDocuments({ sellerId: sellerId });
      const reviews = await SellerReview.find({ sellerId });
      const totalReviews = reviews.length;
      const avgRating =
        totalReviews > 0
          ? (
              reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            ).toFixed(1)
          : 0;
      // Gộp thông tin seller với đánh giá
      const sellerInfo = {
        ...order.sellerId._doc,
        totalReviews,
        avgRating,
        createdAt: sellerData.createdAt,
        productCount,
      };
      return res.status(200).json({
        order: {
          ...order._doc,
          sellerId: sellerInfo,
        },
      });
    } catch (error) {
      console.error("Error fetching order by id:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getOrdersBySeller(req, res) {
    try {
      const sellerId = req.params.sellerId || req.accountID;

      const orders = await fetchSellerOrders(sellerId);

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this seller" });
      }

      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Error fetching seller orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async getOrdersOfSeller(req, res) {
    try {
      const orders = await fetchSellerOrders(req.accountID);

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this seller" });
      }

      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Error fetching my seller orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async updateOrderBySeller(req, res) {
    try {
      const { orderId } = req.params;
      const { status, reason } = req.body;
      const sellerId = req.accountID;

      // Verify that the order belongs to this seller
      const order = await Order.findOne({ _id: orderId, sellerId: sellerId });

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found or you don't have permission to update this order",
        });
      }

      // Khi seller hủy đơn → cộng lại stock
      if (status === "cancelled") {
        for (const product of order.products) {
          const productData = await Product.findById(product.productId);
          if (productData) {
            productData.stock += product.quantity;
            await productData.save();
          }
        }
      }

      let updatedOrder;
      if (status === "delivered") {
        updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          { status, statusPayment: true, deliveredAt: new Date() },
          { new: true }
        )
          .populate({
            path: "buyerId",
            select: "fullName email phoneNumber",
          })
          .populate({
            path: "products.productId",
            select: "name price images",
          })
          .populate({
            path: "shippingAddress",
            select:
              "fullName phoneNumber province district ward specificAddress",
          });
      } else {
        updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          { status, reason },
          { new: true }
        )
          .populate({
            path: "buyerId",
            select: "fullName email phoneNumber",
          })
          .populate({
            path: "products.productId",
            select: "name price images",
          })
          .populate({
            path: "shippingAddress",
            select:
              "fullName phoneNumber province district ward specificAddress",
          });
      }

      return res.status(200).json({
        order: updatedOrder,
        message: "Order updated successfully",
      });
    } catch (error) {
      console.error("Error updating order by seller:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async getSellerOrderStats(req, res) {
    try {
      const sellerId = req.accountID;

      const stats = await Order.aggregate([
        { $match: { sellerId: mongoose.Types.ObjectId(sellerId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]);

      const totalOrders = await Order.countDocuments({ sellerId: sellerId });
      const totalRevenue = await Order.aggregate([
        {
          $match: {
            sellerId: mongoose.Types.ObjectId(sellerId),
            status: "delivered",
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);

      return res.status(200).json({
        stats,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      });
    } catch (error) {
      console.error("Error fetching seller order stats:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async updateGHNOrder(req, res) {
    try {
      const { id } = req.params;
      const {
        ghnOrderCode,
        ghnSortCode,
        expectedDeliveryTime,
        transType,
        shippingFee,
        totalShippingFee,
        ghnOrderInfo,
      } = req.body;

      const updateData = {
        ghnOrderCode,
        ghnSortCode,
        expectedDeliveryTime: expectedDeliveryTime ? new Date(expectedDeliveryTime) : undefined,
        transType,
        shippingFee: Number(shippingFee ?? totalShippingFee ?? 0) || undefined,
        ghnTrackingUrl: ghnOrderCode
          ? `https://dev-online.ghn.vn/tracking?order_code=${ghnOrderCode}`
          : undefined,
        ghnStatus: "pending",
        ghnOrderInfo,
      };

      const updatedOrder = await Order.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      res.status(200).json({
        message: "GHN order information updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Error updating GHN order:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
  async updatePaymentStatus(req, res) {
    try {
      const { orderId } = req.body;
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { statusPayment: true },
        { new: true }
      );
      res.status(200).json({
        message: "Payment status updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  async getSellerBankInfoForOrder(req, res) {
    try {
      const { orderId } = req.params;

      // Find order and verify it exists
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Find seller by accountId (sellerId in Order is Account._id)
      const seller = await Seller.findOne({ accountId: order.sellerId });
      if (!seller) {
        return res.status(404).json({ message: "Seller not found" });
      }

      // Check if seller has bank info
      if (!seller.bankInfo || !seller.bankInfo.accountNumber) {
        return res.status(400).json({
          message: "Seller has not provided bank information",
        });
      }

      // Return bank info with payment details
      return res.status(200).json({
        bankName: seller.bankInfo.bankName,
        accountNumber: seller.bankInfo.accountNumber,
        accountHolder: seller.bankInfo.accountHolder,
        amount: order.totalAmount,
        content: `THANH TOAN DON HANG ${orderId}`,
        orderId: order._id.toString(),
      });
    } catch (error) {
      console.error("Error fetching seller bank info:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  /**
   * GHN Webhook Handler
   * Tự động cập nhật trạng thái đơn hàng dựa trên callback từ GHN
   * 
   * GHN Status mapping:
   * - ready_to_pick: Chờ lấy hàng → picked_up (khi lấy thành công)
   * - picking: Đang lấy hàng
   * - storing: Đang lưu kho
   * - transporting: Đang vận chuyển → shipping
   * - delivering: Đang giao hàng → out_for_delivery
   * - delivered: Đã giao hàng → delivered
   * - delivery_fail: Giao thất bại → failed
   * - return: Hoàn hàng → returned
   * - returned: Đã hoàn về → returned
   */
  async handleGHNWebhook(req, res) {
    try {
      const { OrderCode, Status, Description, Time } = req.body;
      
      console.log("GHN Webhook received:", { OrderCode, Status, Description, Time });

      if (!OrderCode || !Status) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Tìm đơn hàng theo GHN order code
      const order = await Order.findOne({ ghnOrderCode: OrderCode });
      
      if (!order) {
        console.warn(`Order not found for GHN code: ${OrderCode}`);
        return res.status(404).json({ message: "Order not found" });
      }

      // Map GHN status to internal status
      let newStatus = null;
      let timestampField = null;

      switch (Status) {
        case "ready_to_pick":
        case "picking":
          // Chờ lấy hoặc đang lấy - không cập nhật status
          break;
          
        case "picked":
          newStatus = "picked_up";
          timestampField = "pickedUpAt";
          break;
          
        case "storing":
        case "transporting":
          newStatus = "shipping";
          timestampField = "shippingAt";
          break;
          
        case "delivering":
          newStatus = "out_for_delivery";
          timestampField = "outForDeliveryAt";
          break;
          
        case "delivered":
          newStatus = "delivered";
          timestampField = "deliveredAt";
          break;
          
        case "delivery_fail":
          newStatus = "failed";
          timestampField = "failedAt";
          break;
          
        case "return":
        case "returned":
          newStatus = "returned";
          timestampField = "returnedAt";
          break;
          
        case "cancel":
          newStatus = "cancelled";
          timestampField = "cancelledAt";
          break;
          
        default:
          console.log(`Unhandled GHN status: ${Status}`);
      }

      if (newStatus) {
        const updateData = {
          status: newStatus,
          ghnStatus: Status,
        };
        
        if (timestampField) {
          updateData[timestampField] = Time ? new Date(Time * 1000) : new Date();
        }

        await Order.findByIdAndUpdate(order._id, updateData);
        
        console.log(`Order ${order._id} updated to ${newStatus} via GHN webhook`);
        
        return res.status(200).json({ 
          message: "Webhook processed successfully",
          orderId: order._id,
          newStatus 
        });
      }

      // Không cần cập nhật status
      return res.status(200).json({ message: "Webhook received, no action needed" });
      
    } catch (error) {
      console.error("Error handling GHN webhook:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new OrderController();
