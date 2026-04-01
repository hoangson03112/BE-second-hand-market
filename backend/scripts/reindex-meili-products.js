"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { MeiliSearch } = require("meilisearch");
const Product = require("../src/models/Product");

const MEILI_HOST = process.env.MEILI_HOST;
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILI_API_KEY;
const MEILI_PRODUCT_INDEX = process.env.MEILI_PRODUCT_INDEX || "products";
const MONGODB_URI = process.env.MONGODB_URI;

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

async function main() {
  if (!MEILI_HOST) throw new Error("MEILI_HOST missing");
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");

  const meiliClient = new MeiliSearch({
    host: MEILI_HOST,
    apiKey: MEILI_MASTER_KEY,
  });
  const index = meiliClient.index(MEILI_PRODUCT_INDEX);

  await mongoose.connect(MONGODB_URI);

  const pageSize = 100;

  // Upsert searchable docs (approved/active & stock > 0)
  let page = 0;
  while (true) {
    const docs = await Product.find({
      status: { $in: ["approved", "active"] },
      stock: { $gt: 0 },
    })
      .select(
        "_id name description slug price status stock condition sellerId categoryId subcategoryId createdAt updatedAt",
      )
      .sort({ updatedAt: -1 })
      .skip(page * pageSize)
      .limit(pageSize)
      .lean();

    if (!docs.length) break;

    const payload = docs.map(toIndexDocument);
    await index.addDocuments(payload, { primaryKey: "id" });
    page += 1;
    console.log(`[Meili] Upserted page ${page}`);
  }

  // Delete stock=0 docs from Meili to match your rule
  const stockZeroIds = await Product.find({
    status: { $in: ["approved", "active"] },
    stock: { $lte: 0 },
  })
    .select("_id")
    .lean();

  if (stockZeroIds.length > 0) {
    const ids = stockZeroIds.map((p) => p._id.toString());
    await index.deleteDocuments(ids);
    console.log(`[Meili] Deleted ${ids.length} products because stock=0`);
  }

  await mongoose.connection.close();
  console.log("✓ Meili reindex completed");
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ Meili reindex failed:", e?.message || e);
  process.exit(1);
});

