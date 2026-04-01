"use strict";

function stripVietnameseDiacritics(input) {
  if (typeof input !== "string") return "";
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(input) {
  return stripVietnameseDiacritics(String(input || ""))
    .toLowerCase()
    .normalize("NFC")
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

function extractKeywordTokens(keyword) {
  const stopwords = new Set([
    "cho",
    "em",
    "be",
    "toi",
    "minh",
    "co",
    "khong",
    "ko",
    "k",
    "kh",
    "nao",
    "gi",
    "nhe",
    "nha",
    "a",
    "ah",
    "oi",
    "voi",
    "can",
    "tim",
    "mua",
    "loai",
    "cai",
    "di",
    "duoi",
    "tren",
  ]);
  if (typeof keyword !== "string") return [];
  const normalized = normalizeForMatch(keyword);
  return normalized
    .split(/[\s,.;:!?/\\|()[\]{}"'+\-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !stopwords.has(s));
}

function parseBudgetFromQuery(normalizedText) {
  const text = normalizeForMatch(normalizedText);
  if (!text) return { minPrice: null, maxPrice: null };

  const parseAmount = (numStr, unit) => {
    const n = Number(String(numStr || "").replace(",", "."));
    if (!Number.isFinite(n)) return null;
    const u = String(unit || "").toLowerCase();
    if (u.startsWith("tr")) return Math.round(n * 1000000);
    if (u === "k" || u.includes("nghin")) return Math.round(n * 1000);
    return Math.round(n);
  };

  const under = text.match(/\b(duoi|toi da|max)\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\b/);
  if (under) return { minPrice: null, maxPrice: parseAmount(under[2], under[3]) };

  const over = text.match(/\b(tren|toi thieu|min)\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\b/);
  if (over) return { minPrice: parseAmount(over[2], over[3]), maxPrice: null };

  const range = text.match(
    /\btu\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\s+den\s+(\d+(?:[.,]\d+)?)\s*(tr|trieu|k|nghin)?\b/,
  );
  if (range) {
    return {
      minPrice: parseAmount(range[1], range[2]),
      maxPrice: parseAmount(range[3], range[4]),
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

function lexicalScoreFromTokens(product, tokens) {
  if (!tokens.length) return 0;
  const nameText = normalizeForMatch(`${product?.name || ""}`);
  const descText = normalizeForMatch(`${product?.description || ""}`);
  let matched = 0;
  for (const token of tokens) {
    const t = normalizeForMatch(token);
    if (nameText.includes(t)) matched += 1;
    else if (descText.includes(t)) matched += 0.6;
  }
  return matched / tokens.length;
}

function phraseAnyMatch(product, phrases) {
  if (!Array.isArray(phrases) || phrases.length === 0) return true;
  const haystack = normalizeForMatch(`${product?.name || ""} ${product?.description || ""}`);
  return phrases.some((p) => haystack.includes(normalizeForMatch(p)));
}

function isProductRelevantByIntent(product, tokens, phrases) {
  if (!tokens.length) return true;
  const score = lexicalScoreFromTokens(product, tokens);
  const phraseOk = phraseAnyMatch(product, phrases);
  if (!phraseOk) return false;
  if (tokens.length === 1) return score >= 1;
  if (tokens.length === 2) return score >= 1;
  if (tokens.length === 3) return score >= 0.67;
  return score >= 0.5;
}

module.exports = {
  normalizeForMatch,
  mapSlang,
  extractKeywordTokens,
  parseBudgetFromQuery,
  stripBudgetTerms,
  buildSearchQueryVariants,
  lexicalScoreFromTokens,
  isProductRelevantByIntent,
  phraseAnyMatch,
};

