"use strict";

const { MeiliSearch } = require("meilisearch");
const Product = require("../models/Product");

const MEILI_HOST = process.env.MEILI_HOST;
const MEILI_API_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILI_API_KEY;
const MEILI_PRODUCT_INDEX = process.env.MEILI_PRODUCT_INDEX || "products";

let meiliClient = null;

function getMeiliIndex() {
  if (!MEILI_HOST) return null;
  if (!meiliClient) {
    meiliClient = new MeiliSearch({
      host: MEILI_HOST,
      apiKey: MEILI_API_KEY,
    });
  }
  return meiliClient.index(MEILI_PRODUCT_INDEX);
}

function stripVietnameseDiacritics(input) {
  if (typeof input !== "string") return "";
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMeiliMatch(input) {
  return stripVietnameseDiacritics(String(input || ""))
    .toLowerCase()
    .normalize("NFC")
    .trim();
}

function toIndexDocument(product) {
  return {
    id: product._id.toString(),
    name: product.name || "",
    name_normalized: normalizeForMeiliMatch(product.name || ""),
    description: product.description || "",
    description_normalized: normalizeForMeiliMatch(product.description || ""),
    slug: product.slug || "",
    price: Number(product.price || 0),
    status: product.status,
    stock: Number(product.stock || 0),
    condition: product.condition || "good",
    sellerId: product.sellerId ? product.sellerId.toString() : null,
    categoryId: product.categoryId ? product.categoryId.toString() : null,
    subcategoryId: product.subcategoryId ? product.subcategoryId.toString() : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

async function upsertApprovedProductToMeili(productId) {
  const index = getMeiliIndex();
  if (!index) {
    console.warn("[Meili] MEILI_HOST missing. Skip product indexing.");
    return;
  }

  const product = await Product.findById(productId)
    .select(
      "_id name description slug price status stock condition sellerId categoryId subcategoryId createdAt updatedAt"
    )
    .lean();

  if (!product) {
    console.warn(`[Meili] Product not found: ${productId}`);
    return;
  }

  if (Number(product.stock || 0) <= 0) {
    await index.deleteDocument(product._id.toString());
    console.log(`[Meili] Removed product ${productId} because stock=0`);
    return;
  }

  if (!["approved", "active"].includes(product.status)) {
    console.warn(
      `[Meili] Skip indexing product ${productId} because status=${product.status}`
    );
    return;
  }

  await index.addDocuments([toIndexDocument(product)], { primaryKey: "id" });
  console.log(`[Meili] Indexed product ${productId}`);
}

module.exports = {
  upsertApprovedProductToMeili,
  searchProductsInMeili,
};

function buildMeiliFilter(filters = {}) {
  const clauses = ['status IN ["approved", "active"]', "stock > 0"];
  if (Number.isFinite(filters.minPrice)) clauses.push(`price >= ${filters.minPrice}`);
  if (Number.isFinite(filters.maxPrice)) clauses.push(`price <= ${filters.maxPrice}`);
  if (typeof filters.condition === "string" && filters.condition.trim()) {
    clauses.push(`condition = "${filters.condition.trim()}"`);
  }
  return clauses.join(" AND ");
}

async function searchProductsInMeili({ keyword, filters = {}, limit = 10 }) {
  const index = getMeiliIndex();
  if (!index) return [];

  const q = typeof keyword === "string" ? keyword.trim() : "";
  if (!q) return [];

  const response = await index.search(q, {
    limit: Math.min(Math.max(limit, 1), 20),
    filter: buildMeiliFilter(filters),
    showRankingScore: true,
    attributesToSearchOn: ["name_normalized", "description_normalized"],
  });

  return (response?.hits || []).map((hit, idx) => ({
    id: String(hit.id),
    rank: idx,
    score: Number(hit._rankingScore ?? 0),
    hit,
  }));
}

