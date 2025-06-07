const Blog = require("../models/Blog");

class BlogController {
  // Get all published blogs (public)
  async getAllBlogs(req, res) {
    try {
      const { page = 1, limit = 6, tag } = req.query;
      const skip = (page - 1) * limit;
      
      let query = { status: "published" };
      if (tag) {
        query.tags = { $in: [tag] };
      }

      const blogs = await Blog.find(query)
        .populate("author", "fullName avatar")
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Blog.countDocuments(query);

      return res.status(200).json({
        blogs,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      });
    } catch (error) {
      console.error("Error fetching blogs:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }


// Get blog by ID (public)
// Trong BlogController.getBlogById
async getBlogById(req, res) {
  try {
    const { id } = req.params;
    
    // Tăng view ngay khi fetch blog
    await Blog.findByIdAndUpdate(id, { $inc: { views: 1 } });
    
    const blog = await Blog.findById(id)
      .populate("author", "fullName avatar")
      .populate("likes", "fullName");

    if (!blog) {
      return res.status(404).json({ message: "Không tìm thấy blog" });
    }

    return res.status(200).json({ blog });
  } catch (error) {
    console.error("Error fetching blog:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

  // Create new blog (admin only)
  async createBlog(req, res) {
    try {
      const { title, content, excerpt, image, tags, status } = req.body;

      if (!title || !content || !excerpt || !image) {
        return res.status(400).json({ 
          message: "Vui lòng điền đầy đủ thông tin" 
        });
      }

      const newBlog = new Blog({
        title,
        content,
        excerpt,
        image,
        author: req.accountID,
        tags: tags || [],
        status: status || "draft",
        publishedAt: status === "published" ? new Date() : null,
      });

      await newBlog.save();
      
      return res.status(201).json({ 
        message: "Tạo blog thành công!",
        blog: newBlog 
      });
    } catch (error) {
      console.error("Error creating blog:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Update blog (admin only)
  async updateBlog(req, res) {
    try {
      const { id } = req.params;
      const { title, content, excerpt, image, tags, status } = req.body;

      const blog = await Blog.findById(id);
      if (!blog) {
        return res.status(404).json({ message: "Không tìm thấy blog" });
      }

      const updateData = {
        title: title || blog.title,
        content: content || blog.content,
        excerpt: excerpt || blog.excerpt,
        image: image || blog.image,
        tags: tags || blog.tags,
        status: status || blog.status,
      };

      // Set publishedAt when status changes to published
      if (status === "published" && blog.status !== "published") {
        updateData.publishedAt = new Date();
      }

      const updatedBlog = await Blog.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      ).populate("author", "fullName avatar");

      return res.status(200).json({ 
        message: "Cập nhật blog thành công!",
        blog: updatedBlog 
      });
    } catch (error) {
      console.error("Error updating blog:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Delete blog (admin only)
  async deleteBlog(req, res) {
    try {
      const { id } = req.params;

      const blog = await Blog.findById(id);
      if (!blog) {
        return res.status(404).json({ message: "Không tìm thấy blog" });
      }

      await Blog.findByIdAndDelete(id);

      return res.status(200).json({ message: "Xóa blog thành công!" });
    } catch (error) {
      console.error("Error deleting blog:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Get all blogs for admin
  async getBlogsByAdmin(req, res) {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const skip = (page - 1) * limit;
      
      let query = {};
      if (status && status !== "all") {
        query.status = status;
      }

      const blogs = await Blog.find(query)
        .populate("author", "fullName avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Blog.countDocuments(query);

      return res.status(200).json({
        blogs,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      });
    } catch (error) {
      console.error("Error fetching blogs for admin:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Update blog status
  async updateBlogStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["draft", "published", "archived"].includes(status)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }

      const updateData = { status };
      if (status === "published") {
        updateData.publishedAt = new Date();
      }

      const blog = await Blog.findByIdAndUpdate(id, updateData, { new: true });

      if (!blog) {
        return res.status(404).json({ message: "Không tìm thấy blog" });
      }

      return res.status(200).json({ 
        message: "Cập nhật trạng thái thành công!",
        blog 
      });
    } catch (error) {
      console.error("Error updating blog status:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Like/Unlike blog
  async likeBlog(req, res) {
    try {
      const { id } = req.params;
      const userId = req.accountID;

      const blog = await Blog.findById(id);
      if (!blog) {
        return res.status(404).json({ message: "Không tìm thấy blog" });
      }

      const likeIndex = blog.likes.indexOf(userId);
      
      if (likeIndex > -1) {
        // Unlike
        blog.likes.splice(likeIndex, 1);
      } else {
        // Like
        blog.likes.push(userId);
      }

      await blog.save();

      return res.status(200).json({ 
        message: likeIndex > -1 ? "Đã bỏ thích" : "Đã thích",
        likesCount: blog.likes.length,
        isLiked: likeIndex === -1
      });
    } catch (error) {
      console.error("Error liking blog:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
  // Increment view count
async incrementView(req, res) {
  try {
    const { id } = req.params;
    
    await Blog.findByIdAndUpdate(id, { $inc: { views: 1 } });
    
    return res.status(200).json({ message: "View incremented" });
  } catch (error) {
    console.error("Error incrementing view:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

  // Search blogs
  async searchBlogs(req, res) {
    try {
      const { keyword } = req.params;
      const { page = 1, limit = 6 } = req.query;
      const skip = (page - 1) * limit;

      const blogs = await Blog.find({
        $and: [
          { status: "published" },
          {
            $or: [
              { title: { $regex: keyword, $options: "i" } },
              { content: { $regex: keyword, $options: "i" } },
              { tags: { $in: [new RegExp(keyword, "i")] } }
            ]
          }
        ]
      })
        .populate("author", "fullName avatar")
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Blog.countDocuments({
        $and: [
          { status: "published" },
          {
            $or: [
              { title: { $regex: keyword, $options: "i" } },
              { content: { $regex: keyword, $options: "i" } },
              { tags: { $in: [new RegExp(keyword, "i")] } }
            ]
          }
        ]
      });

      return res.status(200).json({
        blogs,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        keyword
      });
    } catch (error) {
      console.error("Error searching blogs:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = new BlogController();