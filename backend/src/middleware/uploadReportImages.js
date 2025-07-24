const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
module.exports = upload.array("images", 10); // tối đa 10 ảnh 