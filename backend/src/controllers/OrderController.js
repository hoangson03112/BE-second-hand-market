const BankInfo = require("../models/BankInfo");
const Order = require("../models/Order");
const Address = require("../models/Address");
const PersonalDiscount = require("../models/PersonalDiscount");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const SellerReview = require("../models/SellerReview");
const Account = require("../models/Account");
const ghnService = require("../services/ghn.service");
const { sendPaymentSuccessEmail, sendNewOrderToSellerEmail } = require("../services/email.service");
const mongoose = require("mongoose");

/** shippingMethod được coi là GHN nếu chứa "ghn" (không phân biệt hoa thường) */
function isGhnShipping(shippingMethod) {
  return (
    typeof shippingMethod === "string" &&
    shippingMethod.toLowerCase().includes("ghn")
  );
}

function getGhnCodAmount(order) {
  if (!order || order.paymentMethod !== "cod") return 0;

  // payment_type_id=2 ("Bên nhận trả phí") → GHN tự thu phí ship từ buyer khi giao hàng.
  // Nếu cod_amount gồm cả shippingFee thì buyer bị tính phí ship 2 lần:
  //   - lần 1: nằm trong cod_amount (seller đã tính vào tổng đơn)
  //   - lần 2: GHN cộng thêm vào "Tổng thu" khi thanh toán
  // → cod_amount chỉ cần là tiền hàng (productAmount); GHN thu thêm phí ship từ buyer riêng.
  const productAmount = Number(order.productAmount || 0);
  return Math.max(0, productAmount);
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

      // Kiểm tra: nếu seller có role "buyer" (chưa verify) thì chỉ cho phép COD
      const isBankTransfer = paymentMethod === "bank_transfer";
      if (sellerId && isBankTransfer) {
        const sellerAccount = await Account.findById(sellerId)
          .select("role")
          .lean();
        if (sellerAccount && sellerAccount.role !== "seller") {
          return res.status(400).json({
            message:
              "Người bán chưa xác minh tài khoản. Chỉ có thể thanh toán khi nhận hàng (COD).",
          });
        }
      }

      // 1) Kiểm tra stock trước (chưa trừ) và lấy giá sản phẩm (có thể là giá discount)
      const productsWithPrice = [];
      const usedDiscountIds = [];
      
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
        
        // Check for personal discount
        let finalPrice = productData.price;
        const personalDiscount = await PersonalDiscount.findOne({
          productId: product.productId,
          buyerId: req.accountID,
          sellerId,
          isUse: false,
          endDate: { $gt: new Date() },
        });
        
        if (personalDiscount) {
          finalPrice = personalDiscount.price;
          usedDiscountIds.push(personalDiscount._id);
        }
        
        // Lưu giá (có thể là giá discount) tại thời điểm mua
        productsWithPrice.push({
          productId: product.productId,
          quantity: product.quantity,
          price: finalPrice,
        });
      }

      // Mark used discounts
      if (usedDiscountIds.length > 0) {
        await PersonalDiscount.updateMany(
          { _id: { $in: usedDiscountIds } },
          { isUse: true }
        );
      }
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

      // Gửi email thông báo cho seller
      if (sellerId) {
        try {
          const [seller, buyer, populatedOrder] = await Promise.all([
            Account.findById(sellerId).select('email fullName').lean(),
            Account.findById(req.accountID).select('email fullName phoneNumber').lean(),
            Order.findById(newOrder._id)
              .populate('products.productId', 'name price avatar images')
              .lean()
          ]);
          
          if (seller?.email) {
            await sendNewOrderToSellerEmail(
              seller.email,
              seller.fullName,
              populatedOrder || newOrder,
              buyer
            );
          }
        } catch (emailError) {
          console.error("Lỗi gửi email thông báo đơn hàng mới:", emailError);
          // Không block response nếu email fail
        }
      }

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
        const shouldCreateGhn =
          !order.ghnOrderCode &&
          order.shippingAddress &&
          isGhnShipping(order.shippingMethod);
        
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
                accountId: order.sellerId,
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
              const ghnCodAmount = getGhnCodAmount(order);
              console.log("Creating GHN order on CONFIRMED:", {
                orderId: String(order._id),
                fromDistrictId: fromAddress.from_district_id,
                toDistrictId: address.districtId,
                paymentMethod: order.paymentMethod,
                codAmount: ghnCodAmount,
              });
              
              const ghnData = await ghnService.createShippingOrder({
                orderId: String(order._id),
                fromAddress,
                toAddress: address,
                codAmount: ghnCodAmount,
                weight: 500,
                paymentMethod: order.paymentMethod,
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
        
        // Hủy đơn trên GHN nếu có
        if (order.ghnOrderCode && isGhnShipping(order.shippingMethod)) {
          try {
            const cancelResult = await ghnService.cancelShippingOrder(order.ghnOrderCode);
            if (cancelResult.success) {
              console.log("GHN order cancelled:", order.ghnOrderCode);
              updateData.ghnStatus = "cancelled";
            } else {
              console.warn("Failed to cancel GHN order:", cancelResult.message);
            }
          } catch (ghnErr) {
            console.error("Error cancelling GHN order:", ghnErr.message);
          }
        }
        
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

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const requesterId = String(req.accountID);
      const buyerId = String(order.buyerId?._id || order.buyerId || "");
      const sellerId = String(order.sellerId?._id || order.sellerId || "");
      const isOwner = requesterId === buyerId || requesterId === sellerId;

      if (!isOwner) {
        const requester = await Account.findById(req.accountID)
          .select("role")
          .lean();
        if (requester?.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      return res.status(200).json({ order });
    } catch (error) {
      console.error("Error fetching order by id:", error);
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

      const order = await Order.findOne({ _id: orderId, sellerId: sellerId });

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found or you don't have permission to update this order",
        });
      }

      const updateData = { status, reason };

      if (status === "confirmed") {
        updateData.confirmedAt = new Date();

        const shouldCreateGhn =
          !order.ghnOrderCode &&
          order.shippingAddress &&
          isGhnShipping(order.shippingMethod);

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
              const pickupAddr = await Address.findOne({
                accountId: order.sellerId,
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
                  from_phone:
                    pickupAddr.phoneNumber || sellerAccount?.phoneNumber,
                };
              } else {
                const firstProductInOrder = await Product.findById(
                  order.products[0]?.productId
                )
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
                    from_name:
                      productAddr.fullName || sellerAccount?.fullName,
                    from_phone:
                      productAddr.phoneNumber || sellerAccount?.phoneNumber,
                  };
                }
              }
            }

            if (address && fromAddress) {
              const ghnCodAmount = getGhnCodAmount(order);
              console.log("Creating GHN order on seller CONFIRMED:", {
                orderId: String(order._id),
                fromDistrictId: fromAddress.from_district_id,
                toDistrictId: address.districtId,
                paymentMethod: order.paymentMethod,
                codAmount: ghnCodAmount,
              });

              const ghnData = await ghnService.createShippingOrder({
                orderId: String(order._id),
                fromAddress,
                toAddress: address,
                codAmount: ghnCodAmount,
                weight: 500,
                paymentMethod: order.paymentMethod,
              });

              console.log("GHN order created:", ghnData.ghnOrderCode);
              Object.assign(updateData, ghnData);
            } else {
              console.warn(
                "Cannot create GHN: Missing address information"
              );
            }
          } catch (ghnErr) {
            console.error("Error creating GHN order:", ghnErr.message);
          }
        }
      } else if (status === "cancelled") {
        updateData.cancelledAt = new Date();
        
        // Hủy đơn trên GHN nếu có
        if (order.ghnOrderCode && isGhnShipping(order.shippingMethod)) {
          try {
            const cancelResult = await ghnService.cancelShippingOrder(order.ghnOrderCode);
            if (cancelResult.success) {
              console.log("GHN order cancelled by seller:", order.ghnOrderCode);
              updateData.ghnStatus = "cancelled";
            } else {
              console.warn("Failed to cancel GHN order:", cancelResult.message);
            }
          } catch (ghnErr) {
            console.error("Error cancelling GHN order:", ghnErr.message);
          }
        }
        
        for (const product of order.products) {
          const productData = await Product.findById(product.productId);
          if (productData) {
            productData.stock += product.quantity;
            await productData.save();
          }
        }
      } else if (status === "delivered") {
        updateData.deliveredAt = new Date();
        updateData.statusPayment = true;
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        updateData,
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

      return res.status(200).json({
        order: updatedOrder,
        message: "Order updated successfully",
      });
    } catch (error) {
      console.error("Error updating order by seller:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async updatePaymentStatus(req, res) {
    try {
      const { orderId } = req.body;
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        {
          statusPayment: true,
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: req.accountID,
        },
        { new: true }
      ).populate('buyerId', 'email fullName');
      
      // Gửi email xác nhận thanh toán thành công
      if (updatedOrder && updatedOrder.buyerId) {
        try {
          await sendPaymentSuccessEmail(
            updatedOrder.buyerId.email,
            updatedOrder.buyerId.fullName,
            updatedOrder
          );
        } catch (emailError) {
          console.error("Lỗi gửi email payment success:", emailError);
          // Không block response nếu email fail
        }
      }
      
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
      // Xác thực token từ GHN (cấu hình GHN_WEBHOOK_TOKEN trong .env & trên GHN portal)
      const ghnToken = process.env.GHN_WEBHOOK_TOKEN;
      if (ghnToken) {
        const receivedToken =
          req.headers["token"] || req.headers["x-token"] || req.headers["authorization"];
        if (receivedToken !== ghnToken) {
          console.warn("GHN Webhook: invalid token");
          return res.status(401).json({ message: "Unauthorized" });
        }
      }

      const { OrderCode, ClientOrderCode, Status, Description, Time, Type } = req.body;
      
      console.log("GHN Webhook received:", { OrderCode, ClientOrderCode, Status, Type, Description, Time });

      if (!OrderCode || !Status) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Chỉ xử lý switch_status — create/Update_weight/Update_cod/Update_fee → trả 200 luôn
      if (Type && Type.toLowerCase() !== "switch_status") {
        console.log(`GHN Webhook: skipping type=${Type}`);
        return res.status(200).json({ message: "Webhook received, no action needed" });
      }

      // Tìm đơn hàng: ưu tiên ghnOrderCode, fallback về ClientOrderCode (= our _id)
      let order = await Order.findOne({ ghnOrderCode: OrderCode });
      if (!order && ClientOrderCode) {
        order = await Order.findById(ClientOrderCode).catch(() => null);
        // Gắn ghnOrderCode nếu tìm được qua ClientOrderCode
        if (order && !order.ghnOrderCode) {
          order.ghnOrderCode = OrderCode;
          await order.save();
        }
      }
      
      if (!order) {
        console.warn(`GHN Webhook: Order not found — OrderCode=${OrderCode}, ClientOrderCode=${ClientOrderCode}`);
        // Trả 200 để GHN không retry liên tục với đơn không tồn tại
        return res.status(200).json({ message: "Order not found, acknowledged" });
      }

      // Parse Time: GHN trả ISO string ("2021-11-11T03:52:50.158Z"), không phải Unix timestamp
      const eventTime = Time ? new Date(Time) : new Date();

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
          updateData[timestampField] = eventTime;
        }

        // Xử lý logic đặc biệt theo status
        if (newStatus === "cancelled" || newStatus === "returned") {
          // Hoàn lại stock khi đơn bị hủy/hoàn trả
          for (const product of order.products) {
            const productData = await Product.findById(product.productId);
            if (productData) {
              productData.stock += product.quantity;
              await productData.save();
            }
          }
          console.log(`Stock restored for order ${order._id} (${newStatus})`);
        } else if (newStatus === "delivered") {
          // Cập nhật payment status cho COD orders
          if (order.paymentMethod === "cod") {
            updateData.statusPayment = true;
          }
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

  // Buyer confirms they received the order (delivered → completed)
  async buyerConfirmReceived(req, res) {
    try {
      const { orderId } = req.params;
      const order = await Order.findOne({ _id: orderId, buyerId: req.accountID });
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.status !== "delivered") {
        return res.status(400).json({ message: "Order must be in delivered status" });
      }
      order.status = "completed";
      order.completedAt = new Date();
      await order.save();
      return res.status(200).json({ message: "Order confirmed successfully", order });
    } catch (error) {
      console.error("Error confirming received:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  // Buyer requests a refund
  async requestRefund(req, res) {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
      const order = await Order.findOne({ _id: orderId, buyerId: req.accountID });
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (!["delivered", "completed"].includes(order.status)) {
        return res.status(400).json({ message: "Refund only allowed after delivery" });
      }
      order.status = "returned";
      order.refundReason = reason;
      order.refundRequestedAt = new Date();
      await order.save();
      return res.status(200).json({ message: "Refund requested successfully", order });
    } catch (error) {
      console.error("Error requesting refund:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new OrderController();
