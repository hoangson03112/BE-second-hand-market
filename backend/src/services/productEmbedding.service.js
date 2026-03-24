"use strict";

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Product = require("../models/Product");

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
const EMBEDDING_DIMENSION = 768;
const MAX_EMBEDDING_INPUT_CHARS = 12000;
const VECTOR_INDEX_NAME = process.env.PRODUCT_VECTOR_INDEX || "vector_index";

let genAIClient;
let embeddingModel;

function getStatusCode(error) {
  return (
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.status ||
    null
  );
}

function toEmbeddingError(error) {
  const status = getStatusCode(error);
  if (status === 403) {
    const err = new Error("GOOGLE_AI_KEY không hợp lệ hoặc không đủ quyền (403)");
    err.statusCode = 403;
    return err;
  }

  if (status === 404) {
    const err = new Error(
      `Không tìm thấy model embedding "${EMBEDDING_MODEL}" (404). Kiểm tra lại model hoặc API version.`,
    );
    err.statusCode = 404;
    return err;
  }

  return error;
}

function getEmbeddingModel() {
  if (!GOOGLE_AI_KEY) {
    const err = new Error("GOOGLE_AI_KEY is missing");
    err.statusCode = 500;
    throw err;
  }

  if (!genAIClient) {
    genAIClient = new GoogleGenerativeAI(GOOGLE_AI_KEY);
  }

  if (!embeddingModel) {
    embeddingModel = genAIClient.getGenerativeModel({ model: EMBEDDING_MODEL });
  }

  return embeddingModel;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildProductEmbeddingText(productLike) {
  const name = normalizeText(productLike?.name);
  const description = normalizeText(productLike?.description);
  const condition = normalizeText(productLike?.condition);

  return [
    `Tên sản phẩm: ${name || "Không có"}`,
    `Mô tả: ${description || "Không có"}`,
    `Tình trạng: ${condition || "Không có"}`,
  ].join("\n");
}

async function getGeminiEmbedding(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Embedding input is empty");
  }

  if (input.length > MAX_EMBEDDING_INPUT_CHARS) {
    const err = new Error(
      `Nội dung quá dài (${input.length} ký tự). Tối đa ${MAX_EMBEDDING_INPUT_CHARS} ký tự để tạo embedding.`,
    );
    err.statusCode = 400;
    throw err;
  }

  try {
    const model = getEmbeddingModel();
    const response = await model.embedContent(input);
    const vector = response?.embedding?.values;

    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) {
      const err = new Error(
        `Embedding dimension không hợp lệ: nhận ${Array.isArray(vector) ? vector.length : 0}, cần ${EMBEDDING_DIMENSION}`,
      );
      err.statusCode = 500;
      throw err;
    }

    return vector;
  } catch (error) {
    throw toEmbeddingError(error);
  }
}

async function createEmbedding(input) {
  return getGeminiEmbedding(input);
}

async function generateEmbeddingFromText(inputText) {
  const text = normalizeText(inputText);
  if (!text) return [];
  try {
    return await createEmbedding(text);
  } catch (error) {
    console.error("[Embedding] generateEmbeddingFromText failed:", error.message);
    return [];
  }
}

async function generateAndSaveEmbedding(productId, content) {
  try {
    if (!productId) {
      throw new Error("productId is required");
    }

    let input = "";
    if (typeof content === "string") {
      input = normalizeText(content);
    } else {
      const source = content || (await Product.findById(productId).lean());
      if (!source) {
        throw new Error(`Product ${productId} not found`);
      }
      input = buildProductEmbeddingText(source);
    }
    if (!input) {
      throw new Error("Embedding content is empty");
    }

    const embedding = await createEmbedding(input);

    await Product.findByIdAndUpdate(productId, { $set: { embedding } });
    console.log(`[Embedding] Saved vector for product ${productId} (dim=${embedding.length})`);
    return embedding;
  } catch (error) {
    console.error("[Embedding] generateAndSaveEmbedding failed:", error.message);
    throw error;
  }
}

async function generateAndSaveProductEmbedding(productId, productLike) {
  return generateAndSaveEmbedding(productId, productLike);
}

module.exports = {
  buildProductEmbeddingText,
  generateEmbeddingFromText,
  generateAndSaveEmbedding,
  generateAndSaveProductEmbedding,
  EMBEDDING_DIMENSION,
  VECTOR_INDEX_NAME,
};
