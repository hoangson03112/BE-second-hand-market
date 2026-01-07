const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/Account");

exports.getDashboardStats = async (req, res) => {
  try {
    // Tổng doanh thu và sản phẩm đã bán (theo đơn đã giao)
    const deliveredOrders = await Order.find({ status: "delivered" }).populate(
      "products.productId"
    );
    const totalRevenue = deliveredOrders.reduce(
      (sum, o) => sum + o.totalAmount,
      0
    );
    const soldProducts = deliveredOrders.reduce(
      (sum, o) => sum + o.products.reduce((s, p) => s + p.quantity, 0),
      0
    );

    // Người dùng mới trong tháng này
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
    });

    // Tỷ lệ hoàn thành giao dịch
    const totalOrders = await Order.countDocuments();
    const completionRate = totalOrders
      ? Math.round((deliveredOrders.length / totalOrders) * 100)
      : 0;

    // Doanh số theo tháng (6 tháng gần nhất)
    const salesDataAgg = await Order.aggregate([
      { $match: { status: "delivered" } },
      {
        $group: {
          _id: { $month: "$createdAt" },
          clothing: {
            $sum: {
              $sum: {
                $map: {
                  input: "$products",
                  as: "p",
                  in: {
                    $cond: [
                      {
                        $eq: [
                          "$$p.productId.categoryId",
                          /* id danh mục quần áo */ null,
                        ],
                      },
                      "$$p.quantity",
                      0,
                    ],
                  },
                },
              },
            },
          },
          electronics: {
            $sum: {
              $sum: {
                $map: {
                  input: "$products",
                  as: "p",
                  in: {
                    $cond: [
                      {
                        $eq: [
                          "$$p.productId.categoryId",
                          /* id danh mục điện tử */ null,
                        ],
                      },
                      "$$p.quantity",
                      0,
                    ],
                  },
                },
              },
            },
          },
          furniture: {
            $sum: {
              $sum: {
                $map: {
                  input: "$products",
                  as: "p",
                  in: {
                    $cond: [
                      {
                        $eq: [
                          "$$p.productId.categoryId",
                          /* id danh mục nội thất */ null,
                        ],
                      },
                      "$$p.quantity",
                      0,
                    ],
                  },
                },
              },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    // Bạn cần truyền đúng id danh mục cho từng loại

    // Tỷ lệ sản phẩm theo danh mục
    const categoryAgg = await Product.aggregate([
      { $group: { _id: "$categoryId", value: { $sum: 1 } } },
    ]);
    // Lấy tên danh mục nếu cần populate thêm

    // Hoạt động người dùng 7 ngày qua
    const days = [
      "Chủ nhật",
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
    ];
    const userActivityData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      const visits = 0; // Nếu có bảng log truy cập thì đếm ở đây
      const listings = await Product.countDocuments({
        createdAt: { $gte: start, $lte: end },
      });
      const purchases = await Order.countDocuments({
        createdAt: { $gte: start, $lte: end },
        status: "delivered",
      });
      userActivityData.push({
        day: days[d.getDay()],
        visits,
        listings,
        purchases,
      });
    }

    res.json({
      salesData: salesDataAgg, // cần xử lý lại nếu muốn đúng format
      categoryData: categoryAgg, // cần join tên danh mục nếu muốn
      userActivityData,
      totalRevenue,
      soldProducts,
      newUsers,
      completionRate,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
