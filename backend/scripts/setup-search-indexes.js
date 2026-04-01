"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { MeiliSearch } = require("meilisearch");

const {
  MONGODB_URI,
  MEILI_HOST,
  MEILI_MASTER_KEY,
  MEILI_API_KEY,
  MEILI_PRODUCT_INDEX = "products",
  PRODUCT_VECTOR_INDEX = "vector_index",
  EMBEDDING_DIMENSION = "768",
} = process.env;

async function setupMeili() {
  if (!MEILI_HOST) {
    console.warn("[Meili] MEILI_HOST missing. Skip Meili setup.");
    return;
  }

  const client = new MeiliSearch({
    host: MEILI_HOST,
    apiKey: MEILI_MASTER_KEY || MEILI_API_KEY,
  });
  const index = client.index(MEILI_PRODUCT_INDEX);

  await index.updateFilterableAttributes([
    "status",
    "stock",
    "price",
    "condition",
    "categoryId",
    "subcategoryId",
  ]);

  console.log(
    `[Meili] Updated filterableAttributes for index "${MEILI_PRODUCT_INDEX}"`,
  );

  // Search on diacritics-free fields for robust matching of no-accent user input.
  await index.updateSearchableAttributes([
    "name_normalized",
    "description_normalized",
    "name",
    "description",
  ]);

  console.log(
    `[Meili] Updated searchableAttributes for index "${MEILI_PRODUCT_INDEX}"`,
  );

  await index.updateTypoTolerance({
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 4,
      twoTypos: 8,
    },
    disableOnAttributes: ["categoryId", "subcategoryId", "sellerId"],
  });

  console.log(
    `[Meili] Updated typoTolerance for index "${MEILI_PRODUCT_INDEX}"`,
  );

  await index.updateSynonyms({
    "tu lanh": ["tulanh", "tu dong", "tu mat", "fridge"],
    tulanh: ["tu lanh", "tu dong", "tu mat", "fridge"],
    "may lanh": ["dieu hoa", "may dieu hoa", "air conditioner"],
    "dieu hoa": ["may lanh", "air conditioner"],
    "xe may": ["xe ga", "xe so", "motorbike"],
    "dien thoai": ["smartphone", "phone", "dt"],
    dt: ["dien thoai", "smartphone", "phone"],
    iphone: ["ip", "dien thoai iphone"],
    laptop: ["may tinh xach tay", "notebook", "lap"],
    "may tinh xach tay": ["laptop", "notebook"],
    tv: ["tivi", "television"],
    tivi: ["tv", "television"],
  });

  console.log(
    `[Meili] Updated synonyms for index "${MEILI_PRODUCT_INDEX}"`,
  );
}

async function setupMongoVectorIndex() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const definition = {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: Number(EMBEDDING_DIMENSION),
        similarity: "cosine",
      },
      {
        type: "filter",
        path: "status",
      },
      {
        type: "filter",
        path: "stock",
      },
    ],
  };

  try {
    await db.command({
      updateSearchIndex: "products",
      name: PRODUCT_VECTOR_INDEX,
      definition,
    });
    console.log(
      `[Mongo] Updated vector index "${PRODUCT_VECTOR_INDEX}" with filters status, stock`,
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("not found") ||
      message.includes("cannot be found") ||
      message.includes("does not exist")
    ) {
      await db.command({
        createSearchIndexes: "products",
        indexes: [
          {
            name: PRODUCT_VECTOR_INDEX,
            type: "vectorSearch",
            definition,
          },
        ],
      });
      console.log(
        `[Mongo] Created vector index "${PRODUCT_VECTOR_INDEX}" with filters status, stock`,
      );
    } else {
      throw error;
    }
  } finally {
    await mongoose.connection.close();
  }
}

async function main() {
  try {
    await setupMeili();
    await setupMongoVectorIndex();
    console.log("✓ Search indexes setup completed.");
    process.exit(0);
  } catch (error) {
    console.error("✗ Search index setup failed:", error?.message || error);
    process.exit(1);
  }
}

main();

