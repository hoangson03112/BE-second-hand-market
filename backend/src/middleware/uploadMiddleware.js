const multer = require("multer");

// File filter for images only
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file ảnh!"), false);
  }
};

// File filter for images or video (product media)
const imageOrVideoFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận ảnh hoặc video!"), false);
  }
};

// File filter for all files
const allFileFilter = (req, file, cb) => {
  cb(null, true);
};

// Base multer configuration
const createUpload = (options = {}) => {
  const {
    fileFilter = imageFileFilter,
    maxSize = 20 * 1024 * 1024, // Default 20MB
    storage = multer.memoryStorage(),
  } = options;

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSize,
    },
  });
};

// Pre-configured upload instances
const imageUpload = createUpload();
const anyFileUpload = createUpload({ fileFilter: allFileFilter });

// Helper functions for different upload scenarios
const uploadConfig = {
  // Single file upload
  single: (fieldName, options = {}) => {
    const upload = createUpload(options);
    return upload.single(fieldName);
  },

  // Multiple files with same field name
  array: (fieldName, maxCount = 10, options = {}) => {
    const upload = createUpload(options);
    return upload.array(fieldName, maxCount);
  },

  // Multiple files with different field names
  fields: (fields, options = {}) => {
    const upload = createUpload(options);
    return upload.fields(fields);
  },

  // Any files
  any: (options = {}) => {
    const upload = createUpload(options);
    return upload.any();
  },

  // No files (for form data only)
  none: (options = {}) => {
    const upload = createUpload(options);
    return upload.none();
  },
};

// Common field configurations
const commonFields = {
  seller: [
    { name: "avatar", maxCount: 1 },
    { name: "idCardBack", maxCount: 1 },
    { name: "idCardFront", maxCount: 1 },
  ],

  product: [
    { name: "images", maxCount: 10 },
    { name: "video", maxCount: 1 },
  ],

  account: [{ name: "avatar", maxCount: 1 }],
};

module.exports = {
  imageUpload,
  anyFileUpload,
  uploadConfig,
  commonFields,
  createUpload,
  imageOrVideoFileFilter,
};
