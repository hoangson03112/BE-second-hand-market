const Attribute = require("../models/Attribute");
const Product = require("../models/Product");
const { uploadMultipleToCloudinary } = require("../utils/CloudinaryUpload");

class ProductController {
  async getProductListByCategory(req, res) {
    try {
      const { categoryID, subcategoryID } = req.query;

      if (!categoryID && !subcategoryID) {
        return res.status(400).json({
          success: false,
          message: "At least one of Category ID or Subcategory ID is required",
        });
      }

      const query = {};
      if (categoryID) {
        query.categoryId = categoryID;
      }
      if (subcategoryID) {
        query.subcategoryId = subcategoryID;
      }
      const products = await Product.find(query);

      res.json({
        success: true,
        data: products.filter((product) => product.status === "approved"),
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  async getProduct(req, res) {
    try {
      const { productID } = req.query;

      const product = await Product.findById({ _id: productID });

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
  async getProducts(req, res) {
    try {
      const products = await Product.find({});
      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  async addProduct(req, res) {
    // console.log(req.body);
    // console.log(req.files);
    const formatAttributes = JSON.parse(req.body.attributes);

    const attributes = formatAttributes.map((attribute) => {
      // Destructuring để bỏ trường 'id', chỉ giữ lại key và value
      const { id, ...attributeWithoutId } = attribute;
      return attributeWithoutId;
    });
    const formatFileData = (fileData) => {
      if (!fileData) return null;
      return {
        url: fileData.url,
        publicId: fileData.publicId,
        originalName: fileData.name,
        type: fileData.type,
        size: fileData.size,
        uploadedAt: new Date(),
      };
    };
    try {
      const newAttributes = await Attribute.insertMany(attributes);
      console.log(newAttributes);
      const uploadedFiles = await uploadMultipleToCloudinary(
        req.files.images,
        "Product"
      );

      const newProduct = await Product.create({
        ...req.body,
        sellerId: req.accountID,
        images: uploadedFiles.map((file) => formatFileData(file)),
        avatar: formatFileData(uploadedFiles[0]),
        attributes: newAttributes,
      });
      res
        .status(201)
        .json({ message: "Thêm sản phẩm thành công.", product: newProduct });
    } catch (validationError) {
      console.error("Attribute validation error:", validationError.message);
      // Log chi tiết lỗi cho từng field
      if (validationError.errors) {
        Object.keys(validationError.errors).forEach((field) => {
          console.error(
            `Field ${field}:`,
            validationError.errors[field].message
          );
        });
      }
      throw validationError;
    }
    // await Attribute.insertMany(attributes);
    // res.status(200).json({ message: "Thêm sản phẩm thành công." });
    // try {
    //   const product = req.body;
    //   const newProduct = new Product({ ...product, sellerId: req.accountID });
    //   await newProduct.save();
    //   res
    //     .status(201)
    //     .json({ message: "Thêm sản phẩm thành công.", product: newProduct });
    // } catch (error) {
    //   console.error(error);
    //   res
    //     .status(500)
    //     .json({ message: "Lỗi khi thêm sản phẩm.", error: error.message });
    // }
  }
  async updateStatusProduct(req, res) {
    try {
      const { slug, status } = req.body;
      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { slug },
        { $set: { status: status } },
        { new: true }
      );

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.status(200).json(updatedProduct);
    } catch (error) {
      console.error("Error updating product status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
  async deleteProduct(req, res) {
    try {
      const { productId } = req.params;

      await Product.findByIdAndDelete(productId);
      res.status(200).json({ message: "Xóa sản phẩm thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi xóa sản phẩm." });
    }
  }
  async getProductOfUser(req, res) {
    try {
      const productData = await Product.find({ sellerId: req.accountID });

      if (!productData.length) {
        return res
          .status(404)
          .json({ message: "No products found for this user." });
      }

      res.status(200).json({ success: true, data: productData });
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  }
  async getProductsByUser(req, res) {
    try {
      const products = await Product.find({ sellerId: req.accountID });

      res.status(200).json({ success: true, data: products });
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  }
}

module.exports = new ProductController();
