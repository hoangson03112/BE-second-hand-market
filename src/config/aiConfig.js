
module.exports = {

  primaryService: process.env.AI_PRIMARY_SERVICE || "openrouter",


  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    useFreeTier: process.env.OPENROUTER_USE_FREE === "true",
    defaultTextModel:
    process.env.OPENROUTER_USE_FREE === "true" ?
    "google/gemma-2-9b-it:free" :
    "google/gemini-flash-1.5",
    defaultImageModel: "openai/gpt-4o-mini",
    maxCostPerProduct: parseFloat(process.env.MAX_COST_PER_PRODUCT) || 0.01
  },


  alternatives: {
    perspective: {
      apiKey: process.env.GOOGLE_PERSPECTIVE_API_KEY,
      enabled: !!process.env.GOOGLE_PERSPECTIVE_API_KEY
    },
    huggingface: {
      apiKey: process.env.HUGGINGFACE_API_KEY,
      enabled: !!process.env.HUGGINGFACE_API_KEY
    }
  },


  thresholds: {
    confidence: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.8,
    autoApprove: parseFloat(process.env.AUTO_APPROVE_THRESHOLD) || 0.9,
    autoReject: parseFloat(process.env.AUTO_REJECT_THRESHOLD) || 0.9
  },


  features: {
    textModeration: true,
    imageModeration: process.env.OPENROUTER_USE_FREE !== "true",
    priceAnalysis: true,
    spamDetection: true,
    costTracking: true
  },


  models: {
    free: [
    "google/gemma-2-9b-it:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "microsoft/phi-3-mini-128k-instruct:free"],

    cheap: [
    "google/gemini-flash-1.5",
    "anthropic/claude-3-haiku",
    "openai/gpt-4o-mini"],

    premium: [
    "openai/gpt-4o",
    "anthropic/claude-3-opus",
    "google/gemini-pro"]

  }
};