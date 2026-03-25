"use strict";

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Product = require("../models/Product");

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION || 768);
const MAX_EMBEDDING_INPUT_CHARS = 12000;
const VECTOR_INDEX_NAME = process.env.PRODUCT_VECTOR_INDEX || "vector_index";

let genAIClient;
const embeddingModelCache = new Map();

function normalizeEmbeddingModelName(modelName) {
  if (typeof modelName !== "string") return "";
  return modelName.trim().replace(/^models\//, "");
}

const EMBEDDING_MODEL_CANDIDATES = Array.from(
  new Set(
    [
      normalizeEmbeddingModelName(EMBEDDING_MODEL),
      "gemini-embedding-001",
      "text-embedding-004",
      "embedding-001",
    ].filter(Boolean),
  ),
);

function adaptEmbeddingDimension(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    const err = new Error("Embedding vector is empty");
    err.statusCode = 500;
    throw err;
  }

  if (!Number.isInteger(EMBEDDING_DIMENSION) || EMBEDDING_DIMENSION <= 0) {
    const err = new Error(`EMBEDDING_DIMENSION không hợp lệ: ${EMBEDDING_DIMENSION}`);
    err.statusCode = 500;
    throw err;
  }

  if (vector.length === EMBEDDING_DIMENSION) {
    return vector;
  }

  if (vector.length > EMBEDDING_DIMENSION) {
    console.warn(
      `[Embedding] Vector dim ${vector.length} > ${EMBEDDING_DIMENSION}, truncating for index compatibility.`,
    );
    return vector.slice(0, EMBEDDING_DIMENSION);
  }

  const padded = [...vector];
  while (padded.length < EMBEDDING_DIMENSION) {
    padded.push(0);
  }
  console.warn(
    `[Embedding] Vector dim ${vector.length} < ${EMBEDDING_DIMENSION}, zero-padding for index compatibility.`,
  );
  return padded;
}

function getStatusCode(error) {
  return (
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.status ||
    null
  );
}

function toEmbeddingError(error, modelName) {
  const status = getStatusCode(error);
  if (status === 403) {
    const err = new Error("GOOGLE_AI_KEY không hợp lệ hoặc không đủ quyền (403)");
    err.statusCode = 403;
    return err;
  }

  if (status === 404) {
    const err = new Error(
      `Không tìm thấy model embedding "${modelName}" (404). Kiểm tra lại GEMINI_EMBEDDING_MODEL hoặc API version.`,
    );
    err.statusCode = 404;
    return err;
  }

  return error;
}

function getEmbeddingModel(modelName) {
  if (!GOOGLE_AI_KEY) {
    const err = new Error("GOOGLE_AI_KEY is missing");
    err.statusCode = 500;
    throw err;
  }

  if (!genAIClient) {
    genAIClient = new GoogleGenerativeAI(GOOGLE_AI_KEY);
  }

  const normalizedModelName = normalizeEmbeddingModelName(modelName);
  if (!normalizedModelName) {
    const err = new Error("Embedding model name is empty");
    err.statusCode = 500;
    throw err;
  }

  if (!embeddingModelCache.has(normalizedModelName)) {
    embeddingModelCache.set(
      normalizedModelName,
      genAIClient.getGenerativeModel({ model: normalizedModelName }),
    );
  }

  return embeddingModelCache.get(normalizedModelName);
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
    let lastError = null;

    for (const modelName of EMBEDDING_MODEL_CANDIDATES) {
      try {
        const model = getEmbeddingModel(modelName);
        const response = await model.embedContent(input);
        const rawVector = response?.embedding?.values;
        const vector = adaptEmbeddingDimension(rawVector);

        if (modelName !== EMBEDDING_MODEL_CANDIDATES[0]) {
          console.warn(
            `[Embedding] Fallback model in use: "${modelName}" (configured="${EMBEDDING_MODEL}")`,
          );
        }
        return vector;
      } catch (error) {
        const mappedError = toEmbeddingError(error, modelName);
        const isModelNotFound = mappedError?.statusCode === 404;
        lastError = mappedError;

        if (isModelNotFound) {
          console.warn(
            `[Embedding] Model "${modelName}" unavailable, trying next candidate...`,
          );
          continue;
        }

        throw mappedError;
      }
    }

    throw lastError || new Error("No embedding model available");
  } catch (error) {
    throw error?.statusCode ? error : toEmbeddingError(error, EMBEDDING_MODEL);
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
