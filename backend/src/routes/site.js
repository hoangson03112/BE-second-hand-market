const express = require("express");
const CategoryController = require("../controllers/CategoryController");
const ProductController = require("../controllers/ProductController");
const AccountController = require("../controllers/AccountController");
const SubCategoryController = require("../controllers/SubCategoryController");
const CartController = require("../controllers/CartController");
const verifyToken = require("../middlewave/verifyToken");
const OrderController = require("../controllers/OrderController");
const chatRoutes = require("./chat");

const router = express.Router();

// Category routes
router.get("/categories", CategoryController.getAllCategories);
router.get("/category", CategoryController.getCategory);
router.put("/category/update", CategoryController.updateCategory);

// Product routes
router.get("/product-list", ProductController.getProductListByCategory);
router.get("/product", ProductController.getProduct);
router.get("/products", ProductController.getProducts);
router.get("/user/products", verifyToken, ProductController.getProductOfUser);
router.post("/product/create", verifyToken, ProductController.addProduct);
router.patch(
  "/product/updateStatus",
  verifyToken,
  ProductController.updateStatusProduct
);
router.delete(
  "/product/:productId",
  verifyToken,
  ProductController.deleteProduct
);

// Account routes
router.post("/register", AccountController.Register);
router.post("/verify", AccountController.Verify);
router.post("/login", AccountController.Login);
router.get("/authentication", verifyToken, AccountController.Authentication);
router.post(
  "/admin/account/create",
  verifyToken,
  AccountController.createAccountByAdmin
);
router.put(
  "/admin/update-account/:userId",
  AccountController.updateAccountByAdmin
);
router.get("/accounts", AccountController.getAccountsByAdmin);
router.get("/account/:id", AccountController.getAccountById);
router.put(
  "/admin/account/update/:accountId",
  AccountController.updateAccountByAdmin
);
router.put("/account/update", verifyToken, AccountController.updateAccountInfo);

// SubCategory routes
router.get("/subcategory", SubCategoryController.getSubCategory);
router.put("/subcategory/update", SubCategoryController.updateSubCategory);
router.post(
  "/subcategory/:parentCategoryId",
  SubCategoryController.createSubCategory
);
router.delete(
  "/category/:categoryId/subcategory/:subcategoryId",
  SubCategoryController.deleteSubCategory
);

// Cart routes
router.post("/add-to-cart", verifyToken, CartController.addToCart);
router.post("/purchase-now", verifyToken, CartController.purchaseNow);
router.delete("/delete-item", verifyToken, CartController.deleteItem);
router.put("/update-item-quantity", verifyToken, CartController.updateQuantity);

// Order routes
router.post("/orders", verifyToken, OrderController.createOrder);
router.get("/orders/my-orders", verifyToken, OrderController.getOrderByAccount);
router.get("/orders", verifyToken, OrderController.getOrdersByAdmin);
router.patch("/orders/update-order", verifyToken, OrderController.updateOrder);

// Chat routes
router.use("/chat", chatRoutes);

// Add near other routes
router.get("/debug/socket-status", (req, res) => {
  const io = req.app.get("io"); // Get io instance from app
  if (!io) {
    return res.status(500).json({
      success: false,
      message: "Socket.io instance not available",
    });
  }

  // Get server-side info about sockets
  const activeUsers = req.app.get("activeUsers");

  res.json({
    success: true,
    data: {
      connections: {
        numberOfConnections: io.engine.clientsCount,
        numberOfRooms: Object.keys(io.sockets.adapter.rooms).length,
      },
      activeUsers: activeUsers ? Array.from(activeUsers.entries()) : [],
    },
  });
});

module.exports = router;
