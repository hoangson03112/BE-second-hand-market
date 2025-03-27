const express = require("express");
const CategoryController = require("../controllers/CategoryController");
const ProductController = require("../controllers/ProductController");
const AccountController = require("../controllers/AccountController");
const SubCategoryController = require("../controllers/SubCategoryController");
const CartController = require("../controllers/CartController");
const verifyToken = require("../middlewave/verifyToken");
const ChatController = require("../controllers/ChatController");
const OrderController = require("../controllers/OrderController");

const router = express.Router();

router.get("/categories", CategoryController.getAllCategories);
router.get("/product-list", ProductController.getProductListByCategory);
router.get("/subcategory", SubCategoryController.getSubCategory);
router.get("/category", CategoryController.getCategory);
router.get("/product", ProductController.getProduct);
router.get("/products", ProductController.getProducts);

router.post("/register", AccountController.Register);
router.post("/verify", AccountController.Verify);
router.post("/login", AccountController.Login);

router.get("/authentication", verifyToken, AccountController.Authentication);
router.get("/messages", verifyToken, ChatController.getAllChat);
router.post("/orders", verifyToken, OrderController.createOrder);
router.get("/orders/my-orders", verifyToken, OrderController.getOrderByAccount);
router.get("/orders", verifyToken, OrderController.getOrdersByAdmin);

router.patch("/orders/update-order", verifyToken, OrderController.updateOrder);

router.post("/add-to-cart", verifyToken, CartController.addToCart);
router.post("/purchase-now", verifyToken, CartController.purchaseNow);
router.delete("/delete-item", verifyToken, CartController.deleteItem);
router.put("/update-item-quantity", verifyToken, CartController.updateQuantity);
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

router.post("/product/create", verifyToken, ProductController.addProduct);
router.patch(
  "/product/updateStatus",
  verifyToken,
  ProductController.updateStatusProduct
);
router.put("/category/update", CategoryController.updateCategory);
router.put("/subcategory/update", SubCategoryController.updateSubCategory);
router.post(
  "/subcategory/:parentCategoryId",
  SubCategoryController.createSubCategory
);
router.delete(
  "/category/:categoryId/subcategory/:subcategoryId",
  SubCategoryController.deleteSubCategory
);
router.delete(
  "/product/:productId",
  verifyToken,
  ProductController.deleteProduct
);
router.put("/account/update", verifyToken, AccountController.updateAccountInfo);


module.exports = router;
