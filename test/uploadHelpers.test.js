"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatFileForDB,
  formatFilesForDB,
  validateRequiredFiles,
  validateFileTypes,
  validateFileSizes
} = require("../src/utils/uploadHelpers");


test("formatFileForDB đổ đúng shape mà FileSchema yêu cầu", () => {
  const formatted = formatFileForDB({
    url: "https://res.cloudinary.com/demo/bank-proofs/abc.png",
    publicId: "bank-proofs/abc",
    name: "bien-lai.png",
    type: "image/png",
    size: 12345
  });

  // `url` và `publicId` là required trong models/File.js — sai tên khoá ở đây
  // là văng ValidationError tận lúc save.
  assert.equal(formatted.url, "https://res.cloudinary.com/demo/bank-proofs/abc.png");
  assert.equal(formatted.publicId, "bank-proofs/abc");
  assert.equal(formatted.originalName, "bien-lai.png");
  assert.equal(formatted.type, "image/png");
  assert.equal(formatted.size, 12345);
  assert.ok(formatted.uploadedAt instanceof Date);
});


test("formatFileForDB trả null khi không có file", () => {
  assert.equal(formatFileForDB(null), null);
  assert.equal(formatFileForDB(undefined), null);
});


test("formatFilesForDB giữ nguyên mảng là mảng, đơn lẻ là đơn lẻ", () => {
  const formatted = formatFilesForDB({
    avatar: { url: "u1", publicId: "p1", name: "a.png" },
    images: [
    { url: "u2", publicId: "p2", name: "b.png" },
    { url: "u3", publicId: "p3", name: "c.png" }]

  });

  assert.ok(!Array.isArray(formatted.avatar));
  assert.equal(formatted.avatar.url, "u1");
  assert.equal(formatted.images.length, 2);
  assert.equal(formatted.images[1].originalName, "c.png");
});


test("validateRequiredFiles chỉ ra đúng field còn thiếu", () => {
  const errors = validateRequiredFiles(
    { idCardFront: [{}], idCardBack: [] },
    ["idCardFront", "idCardBack"]
  );

  assert.deepEqual(errors, ["idCardBack is required"]);
});


test("validateFileTypes chặn file không phải ảnh", () => {
  const errors = validateFileTypes({
    proof: [
    { mimetype: "image/png", originalname: "ok.png" },
    { mimetype: "application/pdf", originalname: "bien-lai.pdf" }]

  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /bien-lai\.pdf/);
});


test("validateFileTypes cho qua khi allowedTypes mở rộng cho video", () => {
  const errors = validateFileTypes(
    { media: [{ mimetype: "video/mp4", originalname: "clip.mp4" }] },
    ["image/", "video/"]
  );

  assert.deepEqual(errors, []);
});


test("validateFileSizes so đúng ngưỡng", () => {
  const maxSize = 10 * 1024 * 1024;
  const errors = validateFileSizes(
    {
      proof: [
      { size: maxSize, originalname: "vua-du.png" },
      { size: maxSize + 1, originalname: "qua-lon.png" }]

    },
    maxSize
  );

  // Đúng bằng ngưỡng thì không bị chặn, chỉ vượt mới bị.
  assert.equal(errors.length, 1);
  assert.match(errors[0], /qua-lon\.png/);
});
