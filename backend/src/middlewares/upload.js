const multer = require("multer");


const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file ảnh!"), false);
  }
};


const imageOrVideoFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận ảnh hoặc video!"), false);
  }
};


const allFileFilter = (req, file, cb) => {
  cb(null, true);
};


const createUpload = (options = {}) => {
  const {
    fileFilter = imageFileFilter,
    maxSize = 20 * 1024 * 1024,
    storage = multer.memoryStorage()
  } = options;

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSize
    }
  });
};


const imageUpload = createUpload();
const anyFileUpload = createUpload({ fileFilter: allFileFilter });


const uploadConfig = {

  single: (fieldName, options = {}) => {
    const upload = createUpload(options);
    return upload.single(fieldName);
  },


  array: (fieldName, maxCount = 10, options = {}) => {
    const upload = createUpload(options);
    return upload.array(fieldName, maxCount);
  },


  fields: (fields, options = {}) => {
    const upload = createUpload(options);
    return upload.fields(fields);
  },


  any: (options = {}) => {
    const upload = createUpload(options);
    return upload.any();
  },


  none: (options = {}) => {
    const upload = createUpload(options);
    return upload.none();
  }
};


const commonFields = {
  seller: [
  { name: "avatar", maxCount: 1 },
  { name: "idCardBack", maxCount: 1 },
  { name: "idCardFront", maxCount: 1 }],


  product: [
  { name: "images", maxCount: 10 },
  { name: "video", maxCount: 1 }],


  account: [{ name: "avatar", maxCount: 1 }]
};

module.exports = {
  imageUpload,
  anyFileUpload,
  uploadConfig,
  commonFields,
  createUpload,
  imageOrVideoFileFilter
};