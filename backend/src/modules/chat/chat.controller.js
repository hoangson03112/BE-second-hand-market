const Message = require("../../models/Message");
const Account = require("../../models/Account");
const Conversation = require("../../models/Conversation");
const Product = require("../../models/Product");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { uploadMultipleToCloudinary } = require("../../utils/CloudinaryUpload");
const {
  generateEmbeddingFromText,
  EMBEDDING_DIMENSION,
  VECTOR_INDEX_NAME,
} = require("../../services/productEmbedding.service");
const { searchProductsInMeili } = require("../../services/productSearchIndex.service");
const { MESSAGES } = require("../../utils/messages");

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";
const PRODUCT_SUGGESTION_SYSTEM_PROMPT =
  "Bạn là chuyên gia tư vấn đồ cũ. Hãy dựa vào danh sách sản phẩm được cung cấp để gợi ý cho khách. Nếu không thấy đồ phù hợp, hãy lịch sự đề nghị khách thử từ khóa khác. Trả lời ngắn gọn, thân thiện.";
const SEARCH_QUERY_PARSER_PROMPT = `
Bạn là bộ chuyển đổi truy vấn mua sắm thành JSON.
Phân tích câu người dùng và trả về JSON hợp lệ duy nhất theo schema:
{
  "keyword": string,
  "filters": {
    "minPrice": number|null,
    "maxPrice": number|null,
    "condition": "new"|"like_new"|"good"|"fair"|"poor"|null
  },
  "mustKeywords": string[]
}
Rules:
- keyword: ngắn gọn, loại bỏ từ thừa, giữ ý định chính.
- keyword & mustKeywords: chuyển về dạng không dấu (no-accent), chữ thường.
- mustKeywords: tập hợp các từ khóa “cốt lõi” (entity chính) bắt buộc sản phẩm phải có trong name/description.
  - Nếu không chắc -> [].
  - Ví dụ: "tủ lạnh" -> ["tủ lạnh"], "xe đạp" -> ["xe đạp","bánh xe"] (nếu phù hợp).
- Nếu không rõ giá => null.
- Chuẩn hóa tình trạng:
  - mới/new -> "new"
  - như mới/99% -> "like_new"
  - tốt/good -> "good"
  - trung bình/fair -> "fair"
  - kém/poor -> "poor"
- Chỉ trả JSON, không markdown.
`.trim();

let chatGenAI;
let chatModel;
let parserModel;

// Prevent spamming Gemini when free-tier quota/rate-limit bị 429.
const aiThrottleState = {
  intentCooldownUntilMs: 0,
  chatCooldownUntilMs: 0,
  intentCache: new Map(), // key -> { value, expiresAtMs }
};

const INTENT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 1000;

function getErrorStatusCode(err) {
  return (
    err?.statusCode ||
    err?.status ||
    err?.response?.status ||
    err?.response?.data?.error?.status ||
    null
  );
}

function isQuotaError(err) {
  const code = getErrorStatusCode(err);
  if (code === 429) return true;
  const msg = String(err?.message || "");
  return msg.toLowerCase().includes("quota") || msg.includes("Too Many Requests");
}

function getChatModel() {
  const chatKey = process.env.GOOGLE_AI_CHAT_KEY || process.env.GOOGLE_AI_KEY;
  if (!chatKey) {
    const err = new Error("GOOGLE_AI_CHAT_KEY is missing");
    err.statusCode = 500;
    throw err;
  }

  if (!chatGenAI) {
    chatGenAI = new GoogleGenerativeAI(chatKey);
  }
  if (!chatModel) {
    chatModel = chatGenAI.getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction: PRODUCT_SUGGESTION_SYSTEM_PROMPT,
    });
  }

  return chatModel;
}

function getParserModel() {
  const chatKey = process.env.GOOGLE_AI_CHAT_KEY;
  if (!chatKey) {
    const err = new Error("GOOGLE_AI_CHAT_KEY is missing");
    err.statusCode = 500;
    throw err;
  }
  if (!chatGenAI) {
    chatGenAI = new GoogleGenerativeAI(chatKey);
  }
  if (!parserModel) {
    parserModel = chatGenAI.getGenerativeModel({ model: CHAT_MODEL });
  }
  return parserModel;
}

function parseJsonFromText(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function normalizeCondition(condition) {
  const c = typeof condition === "string" ? condition.trim().toLowerCase() : "";
  if (!c) return null;
  const map = {
    new: "new",
    like_new: "like_new",
    likenew: "like_new",
    good: "good",
    fair: "fair",
    poor: "poor",
  };
  return map[c] || null;
}

function extractKeywordTokens(keyword) {
  const stopwords = new Set([
    "cho",
    "em",
    "bé",
    "be",
    "toi",
    "tôi",
    "minh",
    "mình",
    "can",
    "cần",
    "tim",
    "tìm",
    "mua",
    "loai",
    "loại",
    "cai",
    "cái",
    "di",
    "đi",
    "duoi",
    "dưới",
    "tren",
    "trên",
  ]);
  if (typeof keyword !== "string") return [];
  const normalized = normalizeForMatch(keyword);
  return normalized
    .split(/[\s,.;:!?/\\|()[\]{}"'+\-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !stopwords.has(s));
}

function stripVietnameseDiacritics(input) {
  if (typeof input !== "string") return "";
  // NFD + remove diacritic marks.
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(input) {
  return stripVietnameseDiacritics(String(input || ""))
    .toLowerCase()
    .normalize("NFC")
    .trim();
}

function lexicalScoreFromTokens(product, tokens) {
  if (!tokens.length) return 0;
  const nameText = normalizeForMatch(`${product?.name || ""}`);
  const descText = normalizeForMatch(`${product?.description || ""}`);
  let matched = 0;
  for (const token of tokens) {
    const t = normalizeForMatch(token);
    const inName = nameText.includes(t);
    const inDesc = descText.includes(t);
    if (inName) matched += 1;
    else if (inDesc) matched += 0.6; // Name match mạnh hơn description.
  }
  return matched / tokens.length;
}

function isProductRelevantByTokens(product, tokens) {
  if (!tokens.length) return true;
  const score = lexicalScoreFromTokens(product, tokens);
  if (tokens.length === 1) return score >= 1;
  if (tokens.length === 2) return score >= 1;
  if (tokens.length === 3) return score >= 0.67;
  return score >= 0.5;
}

function phraseAnyMatch(product, phrases) {
  if (!Array.isArray(phrases) || phrases.length === 0) return true;
  const haystack = normalizeForMatch(
    `${product?.name || ""} ${product?.description || ""}`,
  );
  return phrases.some((p) => haystack.includes(normalizeForMatch(p)));
}

function isProductRelevantByIntent(product, tokens, mustPhrases) {
  if (Array.isArray(mustPhrases) && mustPhrases.length > 0) {
    if (!phraseAnyMatch(product, mustPhrases)) return false;
  }
  return isProductRelevantByTokens(product, tokens);
}

// === New search-intent helpers based on sample flow ===

function normalizeUserInputForSearch(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    // Giữ lại chữ, số, khoảng trắng và dải ký tự tiếng Việt cơ bản.
    .replace(/[^\w\sà-ỹ]/gi, "")
    .trim();
}

const SLANG_MAP = {
  "re vl": "cheap",
  "rẻ vl": "cheap",
  re: "cheap",
  "xịn": "premium",
  xin: "premium",
  chill: "casual",
};

function mapSlang(text) {
  let result = String(text || "");
  Object.keys(SLANG_MAP).forEach((key) => {
    const pattern = new RegExp(`\\b${key}\\b`, "gi");
    result = result.replace(pattern, SLANG_MAP[key]);
  });
  return result.trim();
}

async function parseShoppingIntentWithGemini(model, userInput) {
  const prompt = [
    "Extract shopping intent from user query.",
    "",
    "Return ONLY JSON:",
    "{",
    '  "category": "",',
    '  "keywords": [],',
    '  "price_range": "",',
    '  "attributes": []',
    "}",
    "",
    `User: "${userInput}"`,
  ].join("\n");

  try {
    const res = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);

    const text = res?.response?.text?.() || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function validateShoppingIntent(intent) {
  if (!intent || typeof intent !== "object") return null;
  return {
    category: typeof intent.category === "string" ? intent.category.trim() : "",
    keywords: Array.isArray(intent.keywords) ? intent.keywords : [],
    price_range: typeof intent.price_range === "string" ? intent.price_range.trim() : "",
    attributes: Array.isArray(intent.attributes) ? intent.attributes : [],
  };
}

function buildQueryFromIntent(intent, fallbackText) {
  if (!intent) return fallbackText;
  if (!intent.category && (!intent.keywords || intent.keywords.length === 0)) {
    return fallbackText;
  }

  const parts = [];
  if (intent.category) parts.push(intent.category);
  if (Array.isArray(intent.keywords)) parts.push(...intent.keywords);
  if (Array.isArray(intent.attributes)) parts.push(...intent.attributes);
  const joined = parts.join(" ").trim();
  return joined || fallbackText;
}

function mapPriceRangeToFilters(priceRange) {
  if (typeof priceRange !== "string") {
    return { minPrice: null, maxPrice: null };
  }
  const pr = priceRange.toLowerCase();
  // Có thể tinh chỉnh thêm theo domain của bạn.
  if (pr === "cheap") {
    return { minPrice: null, maxPrice: 500000 };
  }
  if (pr === "mid" || pr === "medium") {
    return { minPrice: 500000, maxPrice: 2000000 };
  }
  if (pr === "premium" || pr === "expensive") {
    return { minPrice: 2000000, maxPrice: null };
  }
  return { minPrice: null, maxPrice: null };
}

function buildSearchQueryVariants(primaryKeyword, userMessage) {
  const variants = new Set();
  const primary = normalizeForMatch(primaryKeyword);
  const fromUser = normalizeForMatch(userMessage);
  if (primary) variants.add(primary);
  if (fromUser) variants.add(fromUser);

  const compactPrimary = primary.replace(/\s+/g, "");
  const compactUser = fromUser.replace(/\s+/g, "");
  if (compactPrimary && compactPrimary.length >= 4) variants.add(compactPrimary);
  if (compactUser && compactUser.length >= 4) variants.add(compactUser);

  return [...variants].slice(0, 4);
}

function parseBudgetFromQuery(normalizedText) {
  const text = normalizeForMatch(normalizedText);
  if (!text) return { minPrice: null, maxPrice: null };

  const parseAmount = (numStr, unit) => {
    const n = Number(String(numStr || "").replace(",", "."));
    if (!Number.isFinite(n)) return null;
    const u = String(unit || "").toLowerCase();
    if (u.startsWith("tr")) return Math.round(n * 1_000_000);
    if (u === "k" || u.includes("nghin")) return Math.round(n * 1_000);
    return Math.round(n);
  };

  const under = text.match(/\b(duoi|toi da|max)\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\b/);
  if (under) return { minPrice: null, maxPrice: parseAmount(under[2], under[3]) };

  const over = text.match(/\b(tren|toi thieu|min)\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\b/);
  if (over) return { minPrice: parseAmount(over[2], over[3]), maxPrice: null };

  const range = text.match(
    /\b(tu)\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\s+(den)\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\b/,
  );
  if (range) {
    return {
      minPrice: parseAmount(range[2], range[3]),
      maxPrice: parseAmount(range[5], range[6]),
    };
  }

  return { minPrice: null, maxPrice: null };
}

function stripBudgetTerms(normalizedText) {
  const text = normalizeForMatch(normalizedText);
  return text
    .replace(/\b(duoi|toi da|max)\s+\d+(?:[.,]\d+)?\s*(tr|trieu|k|nghin)?\b/g, " ")
    .replace(/\b(tren|toi thieu|min)\s+\d+(?:[.,]\d+)?\s*(tr|trieu|k|nghin)?\b/g, " ")
    .replace(
      /\btu\s+\d+(?:[.,]\d+)?\s*(tr|trieu|k|nghin)?\s+den\s+\d+(?:[.,]\d+)?\s*(tr|trieu|k|nghin)?\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// Helper function to create ObjectId safely
const createObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.createFromHexString(id);
};

class ChatController {
  async searchProductsByAI(req, res) {
    try {
      const userMessage = String(
        req.body?.userMessage || req.body?.query || "",
      ).trim();
      // 1) Normalize input (no-accent, lowercase)
      const normalized = normalizeForMatch(userMessage);
      // 2) Map slang/abbreviation trên chuỗi đã normalize
      const mappedQuery = mapSlang(normalized);
      const limit = Math.min(
        10,
        Math.max(1, Number.parseInt(String(req.body?.limit ?? 3), 10) || 3),
      );
      if (!userMessage) {
        return res.status(400).json({
          answer: "Vui lòng nhập nội dung tìm kiếm.",
          products: [],
          data: [],
        });
      }

      let parsedIntent = {
        keyword: mappedQuery || normalized || userMessage,
        filters: { minPrice: null, maxPrice: null, condition: null },
        mustKeywords: [],
      };
      let skipGeminiChatResponse = false;
      try {
        // 3) Gọi Gemini parse intent trên query đã normalize + map slang
        parsedIntent = {
          keyword: mappedQuery || normalized || userMessage,
          filters: { minPrice: null, maxPrice: null, condition: null },
          mustKeywords: [],
        };
      } catch (intentError) {
        if (isQuotaError(intentError)) {
          skipGeminiChatResponse = true;
        } else {
          console.error(
            "[AI Product Search] Parse intent failed:",
            intentError.message,
          );
        }

// === New search-intent helpers based on sample flow ===

function normalizeUserInputForSearch(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    // Giữ lại chữ, số, khoảng trắng và dải ký tự tiếng Việt cơ bản.
    .replace(/[^\w\sà-ỹ]/gi, "")
    .trim();
}

const SLANG_MAP = {
  "re vl": "cheap",
  "rẻ vl": "cheap",
  re: "cheap",
  "xịn": "premium",
  xin: "premium",
  chill: "casual",
};

function mapSlang(text) {
  let result = String(text || "");
  Object.keys(SLANG_MAP).forEach((key) => {
    const pattern = new RegExp(`\\b${key}\\b`, "gi");
    result = result.replace(pattern, SLANG_MAP[key]);
  });
  return result.trim();
}

async function parseShoppingIntentWithGemini(model, userInput) {
  const prompt = [
    "Extract shopping intent from user query.",
    "",
    "Return ONLY JSON:",
    "{",
    '  "category": "",',
    '  "keywords": [],',
    '  "price_range": "",',
    '  "attributes": []',
    "}",
    "",
    `User: "${userInput}"`,
  ].join("\n");

  try {
    const res = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);

    const text = res?.response?.text?.() || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function validateShoppingIntent(intent) {
  if (!intent || typeof intent !== "object") return null;
  return {
    category: typeof intent.category === "string" ? intent.category.trim() : "",
    keywords: Array.isArray(intent.keywords) ? intent.keywords : [],
    price_range: typeof intent.price_range === "string" ? intent.price_range.trim() : "",
    attributes: Array.isArray(intent.attributes) ? intent.attributes : [],
  };
}

function buildQueryFromIntent(intent, fallbackText) {
  if (!intent) return fallbackText;
  if (!intent.category && (!intent.keywords || intent.keywords.length === 0)) {
    return fallbackText;
  }

  const parts = [];
  if (intent.category) parts.push(intent.category);
  if (Array.isArray(intent.keywords)) parts.push(...intent.keywords);
  if (Array.isArray(intent.attributes)) parts.push(...intent.attributes);
  const joined = parts.join(" ").trim();
  return joined || fallbackText;
}

function mapPriceRangeToFilters(priceRange) {
  if (typeof priceRange !== "string") {
    return { minPrice: null, maxPrice: null };
  }
  const pr = priceRange.toLowerCase();
  // Có thể tinh chỉnh thêm theo domain của bạn.
  if (pr === "cheap") {
    return { minPrice: null, maxPrice: 500000 };
  }
  if (pr === "mid" || pr === "medium") {
    return { minPrice: 500000, maxPrice: 2000000 };
  }
  if (pr === "premium" || pr === "expensive") {
    return { minPrice: 2000000, maxPrice: null };
  }
  return { minPrice: null, maxPrice: null };
}

      }

      // 4) Validate + fallback intent (keyword/filters/mustKeywords)
      if (!parsedIntent || typeof parsedIntent !== "object") {
        parsedIntent = {
          keyword: mappedQuery || normalized || userMessage,
          filters: { minPrice: null, maxPrice: null, condition: null },
          mustKeywords: [],
        };
      }
      if (typeof parsedIntent.keyword !== "string" || !parsedIntent.keyword.trim()) {
        parsedIntent.keyword = mappedQuery || normalized || userMessage;
      }
      parsedIntent.keyword = normalizeForMatch(parsedIntent.keyword);
      const budget = parseBudgetFromQuery(parsedIntent.keyword);
      const keywordWithoutBudget = stripBudgetTerms(parsedIntent.keyword);
      if (keywordWithoutBudget) {
        parsedIntent.keyword = keywordWithoutBudget;
      }
      parsedIntent.filters = parsedIntent.filters || {};
      if (!Number.isFinite(parsedIntent.filters.minPrice)) parsedIntent.filters.minPrice = null;
      if (!Number.isFinite(parsedIntent.filters.maxPrice)) parsedIntent.filters.maxPrice = null;
      if (Number.isFinite(budget.minPrice)) parsedIntent.filters.minPrice = budget.minPrice;
      if (Number.isFinite(budget.maxPrice)) parsedIntent.filters.maxPrice = budget.maxPrice;
      parsedIntent.filters.condition = normalizeCondition(parsedIntent.filters.condition);
      if (!Array.isArray(parsedIntent.mustKeywords)) {
        parsedIntent.mustKeywords = [];
      }

      const productProjection = {
        _id: 1,
        name: 1,
        slug: 1,
        price: 1,
        avatar: 1,
        images: 1,
        condition: 1,
        description: 1,
        stock: 1,
      };
      const mongoFilter = {
        status: { $in: ["approved", "active"] },
        stock: { $gt: 0 },
      };
      if (parsedIntent.filters.condition) {
        mongoFilter.condition = parsedIntent.filters.condition;
      }
      if (
        Number.isFinite(parsedIntent.filters.minPrice) ||
        Number.isFinite(parsedIntent.filters.maxPrice)
      ) {
        mongoFilter.price = {};
        if (Number.isFinite(parsedIntent.filters.minPrice)) {
          mongoFilter.price.$gte = parsedIntent.filters.minPrice;
        }
        if (Number.isFinite(parsedIntent.filters.maxPrice)) {
          mongoFilter.price.$lte = parsedIntent.filters.maxPrice;
        }
      }

      const queryVariants = buildSearchQueryVariants(parsedIntent.keyword, userMessage);
      const meiliMerged = new Map();
      for (const [vIdx, variant] of queryVariants.entries()) {
        const variantHits = await searchProductsInMeili({
          keyword: variant,
          filters: parsedIntent.filters,
          limit: Math.max(limit * 2, 10),
        }).catch((error) => {
          console.error("[AI Product Search] Meili search failed:", error.message);
          return [];
        });
        variantHits.forEach((hit) => {
          const id = String(hit.id);
          const prev = meiliMerged.get(id);
          const variantBoost = vIdx === 0 ? 0.15 : 0;
          const score = Number(hit.score || 0) + variantBoost;
          if (!prev || score > prev.score) {
            meiliMerged.set(id, { ...hit, score });
          }
        });
      }
      let meiliHits = [...meiliMerged.values()]
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .slice(0, Math.max(limit * 2, 10));

      // 7) Fallback nếu Meilisearch rỗng: thử lại chỉ với keyword (không filter)
      if (meiliHits.length === 0) {
        const fallbackKeyword = normalizeForMatch(
          mappedQuery || normalized || userMessage,
        );
        meiliHits = await searchProductsInMeili({
          keyword: fallbackKeyword,
          filters: {},
          limit,
        }).catch(() => []);
      }

      // 6) Flow mới ưu tiên Meilisearch (tắt vector search để giảm phụ thuộc embedding/Gemini).
      let vectorHits = [];

      // Dùng mustKeywords (entity chính) để ép relevance tốt hơn.
      // Nếu AI không parse được mustKeywords => fallback sang token từ keyword.
      const mustKeywordTokens = extractKeywordTokens(
        (parsedIntent.mustKeywords || []).join(" "),
      );
      const keywordTokens = mustKeywordTokens.length
        ? mustKeywordTokens
        : extractKeywordTokens(parsedIntent.keyword);

      let mustPhrases = (parsedIntent.mustKeywords || [])
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length >= 3)
        .map((k) => normalizeForMatch(k));

      // Nếu AI không trả mustKeywords (hay bị 429), tạo cụm fallback từ keywordTokens
      // để ép match theo "phrase" (diacritics-free), giảm kết quả sai lệch.
      if (!Array.isArray(mustPhrases) || mustPhrases.length === 0) {
        const phrasesSet = new Set();
        const kwNorm = normalizeForMatch(parsedIntent.keyword);
        if (kwNorm && kwNorm.length >= 3) phrasesSet.add(kwNorm);

        for (let i = 0; i + 1 < keywordTokens.length; i++) {
          const p = keywordTokens.slice(i, i + 2).join(" ");
          if (p && p.length >= 3) phrasesSet.add(p);
        }
        for (let i = 0; i + 2 < keywordTokens.length; i++) {
          const p = keywordTokens.slice(i, i + 3).join(" ");
          if (p && p.length >= 3) phrasesSet.add(p);
        }

        mustPhrases = [...phrasesSet];
      }
      // Với query rất ngắn (1 token), bỏ ép phrase để tăng khả năng bắt đúng theo token.
      if (keywordTokens.length <= 1) {
        mustPhrases = [];
      }
      const scoreMap = new Map();
      const meiliCount = Math.max(meiliHits.length, 1);
      meiliHits.forEach((hit, index) => {
        const id = String(hit.id);
        if (!mongoose.Types.ObjectId.isValid(id)) return;
        const rankScore = (meiliCount - index) / meiliCount;
        const meiliScore = Number(hit.score || 0);
        scoreMap.set(
          id,
          (scoreMap.get(id) || 0) + rankScore * 0.65 + meiliScore * 0.35,
        );
      });
      // vectorHits đang cố định [], giữ block để tránh refactor nhiều.

      const sortedIds = [...scoreMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        // Lấy nhiều candidate hơn để tránh lọc relevance làm hụt kết quả tốt.
        .slice(0, Math.max(limit * 4, 12));

      let products = [];
      if (sortedIds.length > 0) {
        const mergedQuery = {
          _id: { $in: sortedIds },
          ...mongoFilter,
        };

        const docs = await Product.find(mergedQuery)
          .select(productProjection)
          .lean();
        const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));
        products = sortedIds
          .map((id) => docMap.get(id))
          .filter(Boolean)
          .filter((item) =>
            isProductRelevantByIntent(item, keywordTokens, mustPhrases),
          )
          .sort(
            (a, b) =>
              (phraseAnyMatch(b, mustPhrases) ? 1 : 0) -
                (phraseAnyMatch(a, mustPhrases) ? 1 : 0) ||
              lexicalScoreFromTokens(b, keywordTokens) -
                lexicalScoreFromTokens(a, keywordTokens),
          )
          .slice(0, limit);
      } else {
        const fallbackQuery = { ...mongoFilter };
        // Fallback dùng query gốc (có dấu) để regex trên Mongo khớp tốt hơn.
        const escapedQuery = userMessage.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        fallbackQuery.$or = [
          { name: { $regex: escapedQuery, $options: "i" } },
          { description: { $regex: escapedQuery, $options: "i" } },
        ];

        products = await Product.find(fallbackQuery)
          .select(productProjection)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        if (keywordTokens.length > 0 || mustPhrases.length > 0) {
          products = products.filter((p) =>
            isProductRelevantByIntent(p, keywordTokens, mustPhrases),
          );
        }
      }

      // Soft fallback: nếu Meili đã có hit nhưng bộ lọc relevance quá chặt làm rớt hết,
      // trả về top theo thứ hạng Meili để không bị "không tìm thấy" sai.
      if (products.length === 0 && meiliHits.length > 0) {
        const fallbackIds = meiliHits
          .map((hit) => String(hit.id))
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .slice(0, limit);

        if (fallbackIds.length > 0) {
          const fallbackDocs = await Product.find({
            _id: { $in: fallbackIds },
            ...mongoFilter,
          })
            .select(productProjection)
            .lean();
          const fallbackMap = new Map(
            fallbackDocs.map((doc) => [String(doc._id), doc]),
          );
          products = fallbackIds.map((id) => fallbackMap.get(id)).filter(Boolean);
        }
      }

      // Final safety gate: tránh trả sản phẩm lệch hoàn toàn intent user.
      const finalTokens = extractKeywordTokens(parsedIntent.keyword);
      const finalPhrase = normalizeForMatch(parsedIntent.keyword);
      if (products.length > 0 && finalTokens.length > 0) {
        products = products.filter((item) => {
          const text = normalizeForMatch(
            `${item?.name || ""} ${item?.description || ""}`,
          );
          const matched = finalTokens.filter((t) => text.includes(t)).length;

          if (finalTokens.length === 1) return matched >= 1;
          if (finalTokens.length === 2) {
            return matched === 2 || text.includes(finalPhrase);
          }
          return matched / finalTokens.length >= 0.6 || text.includes(finalPhrase);
        });
      }

      // 8) (optional) Rerank đã làm ở phần lọc/sort products phía trên.
      // Tắt Gemini chat response để tránh 429 quota và tập trung vào kết quả search.
      const answer =
        products.length > 0
          ? `Mình tìm thấy ${products.length} sản phẩm phù hợp. Bạn xem thử các gợi ý bên dưới nhé.`
          : "Mình chưa tìm thấy sản phẩm phù hợp. Bạn thử mô tả cụ thể hơn về tên hoặc mức giá sản phẩm.";

      return res.status(200).json({
        answer,
        products,
        data: products,
      });
    } catch (error) {
      console.error("[AI Product Search] Error:", error);

      const statusCode =
        error?.statusCode || error?.status || error?.response?.status || 500;
      if (statusCode === 403) {
        return res.status(500).json({
          answer: "Dịch vụ AI tạm thời chưa truy cập được (API key).",
          products: [],
        });
      }
      if (statusCode === 404) {
        return res.status(500).json({
          answer: "Model AI chưa sẵn sàng, vui lòng thử lại sau.",
          products: [],
        });
      }

      return res.status(500).json({
        answer: MESSAGES.SERVER_ERROR,
        products: [],
      });
    }
  }

  async uploadMedia(req, res) {
    try {
      const files = req.files || [];

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.CHAT.NO_MEDIA_UPLOADED,
        });
      }

      const uploadedMedia = await uploadMultipleToCloudinary(
        files,
        "chat/media",
      );

      const formattedMedia = uploadedMedia.map((item) => ({
        type: item.type?.startsWith("video/") ? "video" : "image",
        url: item.url,
        publicId: item.publicId,
        name: item.name,
        size: item.size,
      }));

      return res.status(200).json({
        success: true,
        data: formattedMedia,
      });
    } catch (error) {
      console.error("Error uploading chat media:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.CHAT.UPLOAD_FAILED,
        error: error.message,
      });
    }
  }

  async getConversationsList(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.accountID)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.INVALID_ID,
        });
      }

      const userId = createObjectId(req.accountID);

      // BÆ°á»›c 1: TÃ¬m táº¥t cáº£ cuá»™c trÃ² chuyá»‡n mÃ  ngÆ°á»i dÃ¹ng tham gia
      const conversations = await Conversation.aggregate([
        {
          $match: {
            participants: userId,
          },
        },
        // BÆ°á»›c 2: Lookup thÃ´ng tin ngÆ°á»i tham gia
        {
          $lookup: {
            from: "accounts",
            localField: "participants",
            foreignField: "_id",
            as: "participantDetails",
          },
        },
        // BÆ°á»›c 3: Äá»‹nh dáº¡ng thÃ´ng tin cuá»™c trÃ² chuyá»‡n
        {
          $project: {
            _id: 1,
            participants: "$participantDetails",
            updatedAt: 1,
            createdAt: 1,
          },
        },
      ]);

      // Láº¥y danh sÃ¡ch ID cuá»™c trÃ² chuyá»‡n
      const conversationIds = conversations.map((conv) => conv._id);

      // BÆ°á»›c 4: Láº¥y tin nháº¯n cuá»‘i cÃ¹ng cho má»—i cuá»™c trÃ² chuyá»‡n
      const lastMessages = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
          },
        },
        // NhÃ³m theo cuá»™c trÃ² chuyá»‡n vÃ  láº¥y tin nháº¯n má»›i nháº¥t
        {
          $sort: { createdAt: -1 },
        },
        {
          $group: {
            _id: "$conversationId",
            lastMessage: { $first: "$$ROOT" },
          },
        },
      ]);

      // BÆ°á»›c 5: Äáº¿m sá»‘ tin nháº¯n chÆ°a Ä‘á»c cho má»—i cuá»™c trÃ² chuyá»‡n
      const unreadCounts = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            isRead: false,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: "$conversationId",
            count: { $sum: 1 },
          },
        },
      ]);

      // Táº¡o báº£n Ä‘á»“ cho tin nháº¯n cuá»‘i cÃ¹ng vÃ  sá»‘ lÆ°á»£ng chÆ°a Ä‘á»c
      const lastMessageMap = {};
      lastMessages.forEach((item) => {
        lastMessageMap[item._id.toString()] = item.lastMessage;
      });

      const unreadCountMap = {};
      unreadCounts.forEach((item) => {
        unreadCountMap[item._id.toString()] = item.count;
      });

      // Äá»‹nh dáº¡ng láº¡i dá»¯ liá»‡u cho frontend
      const formattedConversations = conversations.map((conv) => {
        const convId = conv._id.toString();
        // TÃ¬m ngÆ°á»i trÃ² chuyá»‡n (khÃ´ng pháº£i ngÆ°á»i dÃ¹ng hiá»‡n táº¡i)
        const partner =
          conv.participants.find(
            (p) => p._id.toString() !== userId.toString(),
          ) || {};

        const lastMsg = lastMessageMap[convId] || {};

        // XÃ¡c Ä‘á»‹nh loáº¡i tin nháº¯n vÃ  ná»™i dung hiá»ƒn thá»‹
        let displayText = lastMsg.text || "";
        let messageType = lastMsg.type || "";

        // Chuáº©n bá»‹ mÃ´ táº£ tin nháº¯n dá»±a trÃªn loáº¡i
        if (lastMsg.type === "image") {
          displayText = displayText || "ÄÃ£ gá»­i má»™t hÃ¬nh áº£nh";
        } else if (lastMsg.type === "video") {
          displayText = displayText || "ÄÃ£ gá»­i má»™t video";
        } else if (lastMsg.type === "product") {
          displayText = displayText || "ÄÃ£ gá»­i thÃ´ng tin sáº£n pháº©m";
        } else if (lastMsg.type === "order") {
          displayText = displayText || "ÄÃ£ gá»­i thÃ´ng tin Ä‘Æ¡n hÃ ng";
        }

        return {
          _id: partner._id,
          name: partner.fullName || partner.name || "Unknown User",
          avatar: partner.avatar || null,
          lastMessage: displayText,
          lastMessageType: messageType,
          lastMessageSenderId: lastMsg.senderId || null,
          lastMessageAt: lastMsg.createdAt || conv.updatedAt,
          unread: unreadCountMap[convId] || 0,
          conversationId: conv._id,
        };
      });

      // Lá»c bá» cÃ¡c cuá»™c trÃ² chuyá»‡n khÃ´ng cÃ³ Ä‘á»‘i tÃ¡c há»£p lá»‡
      const validConversations = formattedConversations.filter(
        (conv) => conv._id,
      );

      validConversations.sort((a, b) => {
        const timeA = new Date(a.lastMessageAt || 0);
        const timeB = new Date(b.lastMessageAt || 0);
        return timeB - timeA;
      });

      res.status(200).json({
        success: true,
        data: validConversations,
      });
    } catch (error) {
      console.error("Error getting chat conversations:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }

  async findOrCreateConversationWithProduct(req, res) {
    try {
      const { productId, sellerId } = req.body;
      const userId = req.accountID;

      // Validate ObjectId format
      if (
        !mongoose.Types.ObjectId.isValid(userId) ||
        !mongoose.Types.ObjectId.isValid(sellerId) ||
        !mongoose.Types.ObjectId.isValid(productId)
      ) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.INVALID_ID,
        });
      }

      // Find existing conversation
      const userObjectId = createObjectId(userId);
      const sellerObjectId = createObjectId(sellerId);

      let conversation = await Conversation.findOne({
        participants: { $all: [userObjectId, sellerObjectId] },
      });

      // Create new conversation if it doesn't exist
      if (!conversation) {
        const newConversation = new Conversation({
          participants: [userObjectId, sellerObjectId],
        });
        conversation = await newConversation.save();
      } else {
        await Conversation.findByIdAndUpdate(conversation._id, {
          $currentDate: { updatedAt: true },
        });
      }

      const message = new Message({
        conversationId: conversation._id,
        senderId: userObjectId,
        type: "product",
        productId: createObjectId(productId),
      });
      await message.save();
      // Get partner (seller) information
      const partner = await Account.findById(sellerObjectId).select(
        "name fullName avatar",
      );

      res.status(200).json({
        success: true,
        message: MESSAGES.CHAT.CONVERSATION_CREATED,
        data: {
          conversationId: conversation._id,
        },
        partner: {
          _id: partner._id,
          name: partner.fullName || partner.name || "Unknown",
          avatar: partner.avatar || null,
        },
      });
    } catch (error) {
      console.error("Error creating product conversation:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }
  async getOptimizedConversation(req, res) {
    try {
      const { partnerId } = req.params;
      const userId = req.accountID;

      if (
        !mongoose.Types.ObjectId.isValid(partnerId) ||
        !mongoose.Types.ObjectId.isValid(userId)
      ) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.INVALID_ID,
        });
      }

      // Convert IDs to ObjectId
      const userObjectId = createObjectId(userId);
      const partnerObjectId = createObjectId(partnerId);

      // Find or create conversation between the two users
      let conversation = await Conversation.findOne({
        participants: { $all: [userObjectId, partnerObjectId] },
      });

      if (!conversation) {
        // Create new conversation if it doesn't exist
        conversation = new Conversation({
          participants: [userObjectId, partnerObjectId],
        });
        await conversation.save();

        return res.json({
          success: true,
          data: [],
          conversationId: conversation._id,
        });
      }

      // Get messages with pagination (50 messages per page)
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 50;

      // TÃ¬m tin nháº¯n vá»›i thÃ´ng tin Ä‘áº§y Ä‘á»§
      const messages = await Message.find({
        conversationId: conversation._id,
      })
        .sort({ createdAt: -1 }) // Newest first
        .skip(page * limit)
        .limit(limit)
        .populate("senderId", "name avatar") // ThÃ´ng tin ngÆ°á»i gá»­i
        .populate("productId") // ThÃ´ng tin sáº£n pháº©m
        .populate("orderId") // ThÃ´ng tin Ä‘Æ¡n hÃ ng
        .lean(); // Use lean() for better performance

      // Format and reverse messages to show in chronological order
      const formattedMessages = messages
        .map((message) => {
          let productData = null;
          if (message.type === "product" && message.productId) {
            productData = {
              id: message.productId._id,
              name: message.productId.name,
              price: message.productId.price,
              image:
                message.productId.images && message.productId.images.length > 0
                  ? message.productId.images[0]
                  : null,
              // CÃ¡c thÃ´ng tin khÃ¡c cá»§a sáº£n pháº©m
            };
          }

          // Chuáº©n bá»‹ dá»¯ liá»‡u Ä‘Æ¡n hÃ ng (náº¿u cÃ³)
          let orderData = null;
          if (message.type === "order" && message.orderId) {
            orderData = {
              id: message.orderId._id,
              orderNumber: message.orderId.orderNumber,
              total: message.orderId.total,
              status: message.orderId.status,
              // CÃ¡c thÃ´ng tin khÃ¡c cá»§a Ä‘Æ¡n hÃ ng
            };
          }

          return {
            _id: message._id,
            text: message.text || "",
            senderId: message.senderId._id,
            senderName: message.senderId.name,
            senderAvatar: message.senderId.avatar,
            type: message.type,
            media: message.media || [],
            // Removed status field
            createdAt: message.createdAt,
            product: productData,
            order: orderData,
          };
        })
        .reverse(); // Reverse to get chronological order

      // Removed mark-as-read functionality

      // Get total message count for pagination info
      const totalMessages = await Message.countDocuments({
        conversationId: conversation._id,
      });

      // Láº¥y thÃ´ng tin ngÆ°á»i chat
      const partner = await Account.findById(partnerObjectId).select(
        "name fullName avatar",
      );

      res.json({
        success: true,
        data: formattedMessages,
        pagination: {
          page,
          limit,
          totalMessages,
          hasMore: totalMessages > (page + 1) * limit,
        },
        conversationId: conversation._id,
        partner: {
          id: partner._id,
          name: partner.fullName || partner.name || "Unknown",
          avatar: partner.avatar,
        },
      });
    } catch (error) {
      console.error("Error getting conversation:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async sendMessage(req, res) {
    try {
      const {
        receiverId,
        text,
        type = "text",
        productId,
        orderId,
        media = [],
      } = req.body;
      const senderId = req.accountID;
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.MISSING_FIELDS,
        });
      }
      // Get sender info for response
      const sender = await Account.findById(senderId).select(
        "name avatar fullName",
      );
      let conversation = await Conversation.findOne({
        participants: {
          $all: [createObjectId(senderId), createObjectId(receiverId)],
        },
      });
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [createObjectId(senderId), createObjectId(receiverId)],
        });
      }
      // 1. Tạo mới message và lưu vào DB
      const message = new Message({
        conversationId: conversation._id,
        senderId,
        receiverId,
        text,
        type,
        productId: type === "product" ? productId : undefined,
        orderId: type === "order" ? orderId : undefined,
        media,
      });
      await message.save();

      // 2. Populate product/order nếu cần
      let populatedMessage = message.toObject();
      if (type === "product" && productId) {
        populatedMessage = await Message.findById(message._id)
          .populate("productId")
          .lean();
      } else if (type === "order" && orderId) {
        populatedMessage = await Message.findById(message._id)
          .populate("orderId")
          .lean();
      }

      // 3. Chuẩn bị dữ liệu trả về
      let productData = null;
      if (type === "product" && populatedMessage.productId) {
        const product = populatedMessage.productId;
        productData = {
          id: product._id,
          name: product.name,
          price: product.price,
          image:
            product.images && product.images.length > 0
              ? product.images[0]
              : null,
        };
      }

      let orderData = null;
      if (type === "order" && populatedMessage.orderId) {
        const order = populatedMessage.orderId;
        orderData = {
          id: order._id,
          orderNumber: order.orderNumber,
          total: order.total,
          status: order.status,
        };
      }

      const formattedMessage = {
        _id: message._id,
        conversationId: conversation._id,
        text: message.text,
        senderId: String(senderId),
        receiverId: String(receiverId),
        senderName: sender.fullName || sender.name,
        senderAvatar: sender.avatar,
        type: message.type,
        media: message.media || [],
        createdAt: message.createdAt,
        product: productData,
        order: orderData,
      };

      // 4. Emit socket event nếu có socket.io
      const io = req.app.get("io");
      if (io) {
        io.to(String(receiverId)).emit("receive-message", formattedMessage);
        io.to(String(senderId)).emit("message-sent", formattedMessage);
      }

      res.status(201).json({
        success: true,
        data: formattedMessage,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }


}

module.exports = new ChatController();
