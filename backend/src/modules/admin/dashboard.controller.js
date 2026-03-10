const Order = require("../../models/Order");
const Product = require("../../models/Product");
const User = require("../../models/Account");
const { MESSAGES } = require('../../utils/messages');

exports.getDashboardStats = async (req, res) => {
  try {
    // Tá»•ng doanh thu vÃ  sáº£n pháº©m Ä‘Ã£ bÃ¡n (theo Ä‘Æ¡n Ä‘Ã£ giao)
    const deliveredOrders = await Order.find({ status: "delivered" }).populate(
      "products.productId"
    );
    const totalRevenue = deliveredOrders.reduce(
      (sum, o) => sum + (o.productAmount || 0),
      0
    );
    const soldProducts = deliveredOrders.reduce(
      (sum, o) => sum + o.products.reduce((s, p) => s + p.quantity, 0),
      0
    );

    // NgÆ°á»i dÃ¹ng má»›i trong thÃ¡ng nÃ y
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
    });

    // Tá»· lá»‡ hoÃ n thÃ nh giao dá»‹ch
    const totalOrders = await Order.countDocuments();
    const completionRate = totalOrders
      ? Math.round((deliveredOrders.length / totalOrders) * 100)
      : 0;

    // Doanh sá»‘ theo thÃ¡ng (6 thÃ¡ng gáº§n nháº¥t)
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
                          /* id danh má»¥c quáº§n Ã¡o */ null,
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
                          /* id danh má»¥c Ä‘iá»‡n tá»­ */ null,
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
                          /* id danh má»¥c ná»™i tháº¥t */ null,
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
    // Báº¡n cáº§n truyá»n Ä‘Ãºng id danh má»¥c cho tá»«ng loáº¡i

    // Tá»· lá»‡ sáº£n pháº©m theo danh má»¥c
    const categoryAgg = await Product.aggregate([
      { $group: { _id: "$categoryId", value: { $sum: 1 } } },
    ]);
    // Láº¥y tÃªn danh má»¥c náº¿u cáº§n populate thÃªm

    // Hoáº¡t Ä‘á»™ng ngÆ°á»i dÃ¹ng 7 ngÃ y qua
    const days = [
      "Chá»§ nháº­t",
      "Thá»© 2",
      "Thá»© 3",
      "Thá»© 4",
      "Thá»© 5",
      "Thá»© 6",
      "Thá»© 7",
    ];
    const userActivityData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      const visits = 0; // Náº¿u cÃ³ báº£ng log truy cáº­p thÃ¬ Ä‘áº¿m á»Ÿ Ä‘Ã¢y
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
      salesData: salesDataAgg, // cáº§n xá»­ lÃ½ láº¡i náº¿u muá»‘n Ä‘Ãºng format
      categoryData: categoryAgg, // cáº§n join tÃªn danh má»¥c náº¿u muá»‘n
      userActivityData,
      totalRevenue,
      soldProducts,
      newUsers,
      completionRate,
    });
  } catch (err) {
    res.status(500).json({ message: MESSAGES.SERVER_ERROR });
  }
};

