const express = require("express");
const ProductController = require("../controllers/ProductController");

const router = express.Router();

router.get("/list", ProductController.getProductListByCategory);
router.get("/", ProductController.getProducts);
router.get("/:id", ProductController.getProduct);
router.post("/", ProductController.addProduct);
router.put("/:id", ProductController.updateStatusProduct);
// router.delete("/:id", ProductController.deleteProduct);

module.exports = router;
