// Cấu hình AI Moderation - Linh hoạt switch giữa các service
module.exports = {
  // Chọn AI service chính
  primaryService: process.env.AI_PRIMARY_SERVICE || "openrouter", // 'openrouter' | 'free' | 'basic'

  // OpenRouter settings (KHUYẾN NGHỊ)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    useFreeTier: process.env.OPENROUTER_USE_FREE === "true",
    defaultTextModel:
      process.env.OPENROUTER_USE_FREE === "true"
        ? "google/gemma-2-9b-it:free"
        : "google/gemini-flash-1.5",
    defaultImageModel: "openai/gpt-4o-mini",
    maxCostPerProduct: parseFloat(process.env.MAX_COST_PER_PRODUCT) || 0.01, // $0.01 max
  },

  // Free alternatives
  alternatives: {
    perspective: {
      apiKey: process.env.GOOGLE_PERSPECTIVE_API_KEY,
      enabled: !!process.env.GOOGLE_PERSPECTIVE_API_KEY,
    },
    huggingface: {
      apiKey: process.env.HUGGINGFACE_API_KEY,
      enabled: !!process.env.HUGGINGFACE_API_KEY,
    },
  },

  // Moderation thresholds
  thresholds: {
    confidence: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.8,
    autoApprove: parseFloat(process.env.AUTO_APPROVE_THRESHOLD) || 0.9,
    autoReject: parseFloat(process.env.AUTO_REJECT_THRESHOLD) || 0.9,
  },

  // Feature toggles
  features: {
    textModeration: true,
    imageModeration: process.env.OPENROUTER_USE_FREE !== "true", // Tắt image nếu dùng free
    priceAnalysis: true,
    spamDetection: true,
    costTracking: true,
  },

  // Các model available và giá
  models: {
    free: [
      "google/gemma-2-9b-it:free",
      "meta-llama/llama-3.1-8b-instruct:free",
      "microsoft/phi-3-mini-128k-instruct:free",
    ],
    cheap: [
      "google/gemini-flash-1.5", // $0.075/1M tokens
      "anthropic/claude-3-haiku", // $0.25/1M tokens
      "openai/gpt-4o-mini", // $0.15/1M tokens
    ],
    premium: [
      "openai/gpt-4o", // $15/1M tokens (OpenRouter) vs $20 (Direct)
      "anthropic/claude-3-opus", // $15/1M tokens
      "google/gemini-pro", // $0.5/1M tokens
    ],
  },
};
