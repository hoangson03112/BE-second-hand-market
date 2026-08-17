const { uploadFieldsToCloudinary } = require("./CloudinaryUpload");


const formatFileForDB = (fileData) => {
  if (!fileData) return null;
  return {
    url: fileData.url,
    publicId: fileData.publicId,
    originalName: fileData.name,
    type: fileData.type,
    size: fileData.size,
    uploadedAt: new Date()
  };
};


const formatFilesForDB = (uploadedFiles) => {
  const formatted = {};

  for (const [fieldName, fileData] of Object.entries(uploadedFiles)) {
    if (Array.isArray(fileData)) {

      formatted[fieldName] = fileData.map((file) => formatFileForDB(file));
    } else {

      formatted[fieldName] = formatFileForDB(fileData);
    }
  }

  return formatted;
};


const validateRequiredFiles = (files, requiredFields) => {
  const errors = [];

  for (const field of requiredFields) {
    if (!files[field] || files[field].length === 0) {
      errors.push(`${field} is required`);
    }
  }

  return errors;
};

const validateFileTypes = (files, allowedTypes = ['image/']) => {
  const errors = [];

  for (const [fieldName, fileArray] of Object.entries(files)) {
    for (const file of fileArray) {
      const isValid = allowedTypes.some((type) => file.mimetype.startsWith(type));
      if (!isValid) {
        errors.push(`${fieldName}: ${file.originalname} has invalid file type`);
      }
    }
  }

  return errors;
};

const validateFileSizes = (files, maxSize = 20 * 1024 * 1024) => {
  const errors = [];

  for (const [fieldName, fileArray] of Object.entries(files)) {
    for (const file of fileArray) {
      if (file.size > maxSize) {
        errors.push(`${fieldName}: ${file.originalname} exceeds max size of ${maxSize / (1024 * 1024)}MB`);
      }
    }
  }

  return errors;
};


const handleFileUpload = async (req, res, options = {}) => {
  const {
    folder = "uploads",
    fieldConfig = {},
    requiredFields = [],
    allowedTypes = ['image/'],
    maxSize = 20 * 1024 * 1024,
    onSuccess,
    onError
  } = options;

  try {

    if (requiredFields.length > 0) {
      const requiredErrors = validateRequiredFiles(req.files, requiredFields);
      if (requiredErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Missing required files",
          errors: requiredErrors
        });
      }
    }


    const typeErrors = validateFileTypes(req.files, allowedTypes);
    if (typeErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid file types",
        errors: typeErrors
      });
    }


    const sizeErrors = validateFileSizes(req.files, maxSize);
    if (sizeErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "File size exceeded",
        errors: sizeErrors
      });
    }


    const uploadedFiles = await uploadFieldsToCloudinary(
      req.files,
      folder,
      fieldConfig
    );


    const formattedFiles = formatFilesForDB(uploadedFiles);


    if (onSuccess) {
      return await onSuccess(formattedFiles, req, res);
    }

    return {
      success: true,
      data: formattedFiles
    };

  } catch (error) {
    console.error("Upload error:", error);


    if (onError) {
      return await onError(error, req, res);
    }

    return res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message
    });
  }
};


const uploadConfigs = {
  seller: {
    folder: "sellers",
    fieldConfig: {
      avatar: { folder: "sellers/avatars" },
      idCardFront: { folder: "sellers/idcards" },
      idCardBack: { folder: "sellers/idcards" }
    },
    requiredFields: ["idCardFront", "idCardBack"],
    allowedTypes: ['image/']
  },

  product: {
    folder: "products",
    fieldConfig: {
      images: { folder: "products/images" },
      video: { folder: "products/videos" }
    },
    requiredFields: ["images"],
    allowedTypes: ['image/', 'video/']
  },

  blog: {
    folder: "blogs",
    fieldConfig: {
      thumbnail: { folder: "blogs/thumbnails" },
      images: { folder: "blogs/images" }
    },
    requiredFields: ["thumbnail"],
    allowedTypes: ['image/']
  },

  account: {
    folder: "accounts",
    fieldConfig: {
      avatar: { folder: "accounts/avatars" }
    },
    requiredFields: [],
    allowedTypes: ['image/']
  }
};

module.exports = {
  formatFileForDB,
  formatFilesForDB,
  validateRequiredFiles,
  validateFileTypes,
  validateFileSizes,
  handleFileUpload,
  uploadConfigs
};