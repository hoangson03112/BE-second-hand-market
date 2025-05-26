const Product = require("../models/Product");

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
  
  // New optimized search endpoint
  async searchProducts(req, res) {
    try {
      const startTime = Date.now(); // For performance tracking
      
      // Get parameters from request
      const { 
        query = '', 
        category = '', 
        subcategory = '', 
        brand = '', 
        color = '',
        minPrice, 
        maxPrice,
        status = 'active',
        sort = 'popular', // popular, newest, priceAsc, priceDesc
        page = 1,
        limit = 10
      } = req.query;
      
      // Build enhanced MongoDB query
      const mongoQuery = { status };
      const exactMatchConditions = [];
      
      // 1. Handle text search for product name, brand, keywords
      if (query && query.trim() !== '') {
        // Add text search capability
        mongoQuery.$text = { $search: query };
        
        // Also add regex search for more precise matching on name
        exactMatchConditions.push({ 
          name: { $regex: query, $options: 'i' } 
        });
      }
      
      // 2. Add category filters - search by both ID and name matching
      if (category) {
        try {
          // Check if it's a valid ObjectId (direct categoryId)
          const mongoose = require('mongoose');
          const isValidObjectId = mongoose.Types.ObjectId.isValid(category);
          
          if (isValidObjectId) {
            // Use as direct categoryId
            mongoQuery.categoryId = category;
          } else {
            // First try to find category by name
            const Category = require("../models/Category");
            const foundCategory = await Category.findOne({
              name: { $regex: category, $options: 'i' }
            }).select('_id');
            
            if (foundCategory) {
              // If found, search by categoryId
              mongoQuery.categoryId = foundCategory._id;
            } else {
              // If not found, search for category name in product name
              exactMatchConditions.push({ 
                name: { $regex: category, $options: 'i' } 
              });
            }
          }
        } catch (err) {
          console.error("Error processing category:", err);
          // Fallback: search in product name
          exactMatchConditions.push({ 
            name: { $regex: category, $options: 'i' } 
          });
        }
      }
      
      // 3. Add subcategory filter
      if (subcategory) {
        try {
          const mongoose = require('mongoose');
          const isValidObjectId = mongoose.Types.ObjectId.isValid(subcategory);
          
          if (isValidObjectId) {
            mongoQuery.subcategoryId = subcategory;
          } else {
            // Try to find subcategory by name
            const SubCategory = require("../models/SubCategory");
            const foundSubCategory = await SubCategory.findOne({
              name: { $regex: subcategory, $options: 'i' }
            }).select('_id');
            
            if (foundSubCategory) {
              mongoQuery.subcategoryId = foundSubCategory._id;
            } else {
              // Search in product name as fallback
              exactMatchConditions.push({ 
                name: { $regex: subcategory, $options: 'i' } 
              });
            }
          }
        } catch (err) {
          console.error("Error processing subcategory:", err);
          // Fallback to name search
          exactMatchConditions.push({ 
            name: { $regex: subcategory, $options: 'i' } 
          });
        }
      }
      
      // 4. Add brand filter with case-insensitive matching
      if (brand) {
        mongoQuery.brand = { $regex: brand, $options: 'i' };
      }
      
      // 5. Add color filter
      if (color) {
        mongoQuery.color = { $in: Array.isArray(color) ? color : [color] };
      }
      
      // 6. Add price range filter
      if (minPrice !== undefined || maxPrice !== undefined) {
        mongoQuery.price = {};
        if (minPrice !== undefined) mongoQuery.price.$gte = Number(minPrice);
        if (maxPrice !== undefined) mongoQuery.price.$lte = Number(maxPrice);
      }
      
      // 7. Add exact match conditions if any
      if (exactMatchConditions.length > 0) {
        if (!mongoQuery.$or) mongoQuery.$or = [];
        mongoQuery.$or = [...mongoQuery.$or, ...exactMatchConditions];
      }
      
      // Set up options for sorting and pagination
      const options = {
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit)
      };
      
      // Set up sort options
      const sortOptions = {};
      switch(sort) {
        case 'newest':
          sortOptions.createdAt = -1;
          break;
        case 'priceAsc':
          sortOptions.price = 1;
          break;
        case 'priceDesc':
          sortOptions.price = -1;
          break;
        case 'popular':
        default:
          sortOptions.isPopular = -1;
          sortOptions.viewCount = -1;
          break;
      }
      
      // If using text search, add text score to sort criteria
      if (mongoQuery.$text) {
        sortOptions.score = { $meta: 'textScore' };
      }
      
      console.log('Enhanced search query:', JSON.stringify(mongoQuery));
      console.log('Sort options:', JSON.stringify(sortOptions));
      
      // Execute query with projection, sort, and pagination
      const projection = mongoQuery.$text ? 
        { score: { $meta: 'textScore' } } : 
        {};
      
      // Get total count for pagination
      const totalCount = await Product.countDocuments(mongoQuery);
      
      // Execute search query
      const products = await Product.find(mongoQuery, projection)
        .sort(sortOptions)
        .skip(options.skip)
        .limit(options.limit)
        .select('name price description avatar images slug brand color categoryId subcategoryId status createdAt');
      
      const endTime = Date.now();
      console.log(`Search completed in ${endTime - startTime}ms with ${products.length} results`);
      
      res.json({
        success: true,
        data: products,
        pagination: {
          total: totalCount,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(totalCount / Number(limit))
        },
        meta: {
          executionTime: endTime - startTime,
          query: mongoQuery
        }
      });
    } catch (error) {
      console.error('Error searching products:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
  
  async addProduct(req, res) {
    try {
      const product = req.body;
      const newProduct = new Product({ ...product, sellerId: req.accountID });
      await newProduct.save();
      res
        .status(201)
        .json({ message: "Thêm sản phẩm thành công.", product: newProduct });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Lỗi khi thêm sản phẩm.", error: error.message });
    }
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
