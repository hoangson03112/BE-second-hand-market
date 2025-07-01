const axios = require("axios");
const Product = require("../models/Product");
require("dotenv").config();

// Cập nhật API Keys - đã loại bỏ HF_TOKEN và DEEPAI_KEY
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_LLAVA_VERSION = process.env.REPLICATE_MODEL_VERSION;


function validateAPIKeys() {
  const validKeys = {
    google: !!GOOGLE_AI_KEY && GOOGLE_AI_KEY.length > 10,
    openai: !!OPENAI_KEY && OPENAI_KEY.length > 10,
    // Cập nhật để kiểm tra biến mới
    replicate: !!REPLICATE_API_TOKEN && REPLICATE_API_TOKEN.length > 10 && !!REPLICATE_LLAVA_VERSION,
  };

  console.log("🔑 API Keys Status:", validKeys);
  return validKeys;
}
// ⭐ QUEUE SYSTEM FOR MODERATION
const moderationQueue = [];
let isProcessingQueue = false;

// ⭐ RETRY CONFIGURATION
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000,
  backoffMultiplier: 1.5,
};

// ⭐ RATE LIMITING
const rateLimiter = {
  requests: new Map(),
  maxRequestsPerMinute: 20, // Tăng limit vì đã tối ưu API calls

  canMakeRequest(service) {
    const now = Date.now();
    const requests = this.requests.get(service) || [];
    const recentRequests = requests.filter((time) => now - time < 60000);
    this.requests.set(service, recentRequests);
    return recentRequests.length < this.maxRequestsPerMinute;
  },

  recordRequest(service) {
    const requests = this.requests.get(service) || [];
    requests.push(Date.now());
    this.requests.set(service, requests);
  },
};

// ⭐ ENHANCED TEXT MODERATION (Vietnamese optimized)
async function moderateTextEnhanced(text) {
  const prohibited_keywords = [
    "lừa đảo", "scam", "fake", "hàng giả", "hàng nhái", "hàng nhập lậu",
    "bán rẻ", "giảm giá sốc", "khuyến mãi giả", "mua ngay", "cơ hội vàng",
    "ma túy", "thuốc lá", "rượu", "vũ khí", "chất nổ", "tài liệu bị cấm",
    "người lớn", "sex", "porn", "18+", "nude",
  ];
  const spam_patterns = [
    /liên hệ ngay|gọi ngay|inbox ngay/gi, /số điện thoại|sđt|phone|tel/gi,
    /zalo|viber|telegram|whatsapp/gi, /link|website|www\.|http/gi,
    /bán rẻ.*giá gốc/gi, /khuyến mãi.*\d+%/gi,
  ];

  try {
    const textLower = text.toLowerCase();
    const foundProhibited = prohibited_keywords.filter((keyword) => textLower.includes(keyword));
    const spamMatches = spam_patterns.filter((pattern) => pattern.test(text));
    const hasValidContent = text.length >= 10 && text.split(" ").length >= 3;
    const hasExcessiveCaps = (text.match(/[A-Z]/g) || []).length / text.length > 0.5;
    const hasExcessiveNumbers = (text.match(/\d/g) || []).length / text.length > 0.3;

    let aiScore = 0.5; // default neutral
    const apiKeys = validateAPIKeys();

    if (
      foundProhibited.length === 0 && spamMatches.length === 0 &&
      rateLimiter.canMakeRequest("text") && (apiKeys.google || apiKeys.openai)
    ) {
      try {
        rateLimiter.recordRequest("text");
        if (apiKeys.google) {
          aiScore = await analyzeTextWithGemini(text);
        } else if (apiKeys.openai) {
          aiScore = await analyzeTextWithOpenAI(text);
        }
      } catch (err) {
        console.warn("AI text analysis failed, using rule-based result:", err.message);
      }
    }

    const qualityScore = hasValidContent ? 1 : 0;
    const formatScore = hasExcessiveCaps || hasExcessiveNumbers ? 0 : 1;
    const prohibitedScore = foundProhibited.length > 0 ? 0 : 1;
    const spamScore = spamMatches.length > 0 ? 0 : 1;
    const finalScore = 0.3 * aiScore + 0.25 * qualityScore + 0.2 * formatScore + 0.15 * prohibitedScore + 0.1 * spamScore;

    const reasons = [];
    if (foundProhibited.length > 0) reasons.push(`Từ cấm: ${foundProhibited.join(", ")}`);
    if (spamMatches.length > 0) reasons.push(`Nghi vấn spam: ${spamMatches.length} pattern`);
    if (!hasValidContent) reasons.push("Nội dung quá ngắn hoặc không rõ ràng");
    if (hasExcessiveCaps) reasons.push("Quá nhiều chữ in hoa");
    if (hasExcessiveNumbers) reasons.push("Quá nhiều số");

    return {
      score: Math.min(Math.max(finalScore, 0), 1),
      approved: finalScore >= 0.6,
      reasons,
      aiUsed: aiScore !== 0.5,
    };
  } catch (error) {
    console.error("❌ Enhanced text moderation failed:", error.message);
    return { score: 0.5, approved: false, reasons: ["Lỗi kiểm duyệt văn bản"], aiUsed: false };
  }
}

// ⭐ GOOGLE GEMINI TEXT ANALYSIS
async function analyzeTextWithGemini(text) {
  return await retryWithBackoff(async () => {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Phân tích mô tả sản phẩm tiếng Việt sau đây và cho điểm từ 0.0 đến 1.0 về mức độ an toàn và phù hợp trên sàn thương mại điện tử. 0.0 là spam/lừa đảo/cấm. 1.0 là mô tả sản phẩm bình thường. Chỉ trả về một số thập phân duy nhất. Văn bản: "${text}"`
          }],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const score = parseFloat(result?.trim());
    return isNaN(score) ? 0.5 : Math.min(Math.max(score, 0), 1);
  }, "Gemini Analysis");
}

// ⭐ OPENAI TEXT ANALYSIS (Fallback)
async function analyzeTextWithOpenAI(text) {
    return await retryWithBackoff(async () => {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user",
          content: `Rate this Vietnamese product description from 0.0 to 1.0 for marketplace safety. 0.0=spam/scam/inappropriate. 1.0=normal product description. Return only a single decimal number. Text: "${text}"`,
        }],
        max_tokens: 10,
        temperature: 0.1,
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );
    const result = response.data?.choices?.[0]?.message?.content;
    const score = parseFloat(result?.trim());
    return isNaN(score) ? 0.5 : Math.min(Math.max(score, 0), 1);
  }, "OpenAI Analysis");
}

// ⭐ [NEW] REPLICATE API POLLING HELPER
async function callReplicateWithPolling(input, version) {
  const startResponse = await axios.post(
    "https://api.replicate.com/v1/predictions",
    { version, input },
    {
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  let prediction = startResponse.data;
  const endpoint = prediction.urls.get;

  while (prediction.status !== "succeeded" && prediction.status !== "failed") {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const pollResponse = await axios.get(endpoint, {
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    prediction = pollResponse.data;
  }

  return prediction;
}

// ⭐ [NEW & UNIFIED] IMAGE ANALYSIS WITH FLORENCE-2
async function analyzeImageWithLlava(imageUrl) {
  if (!REPLICATE_API_TOKEN || !REPLICATE_LLAVA_VERSION) {
      return { caption: "no_api_key", nsfwScore: 0 };
  }

  return await retryWithBackoff(async () => {
      // Tạo một prompt thông minh để yêu cầu cả 2 thông tin cùng lúc
      const LLAva_PROMPT = `Describe the image in one detailed sentence. Then, on a new line, answer the question: Is this image Not Safe For Work (NSFW)? Respond with only "Yes" or "No".`;

      const input = {
          image: imageUrl,
          prompt: LLAva_PROMPT,
          max_new_tokens: 100, // Giới hạn độ dài output
          temperature: 0.2,   // Giúp output ổn định, ít sáng tạo
      };
      
      // Gọi hàm polling và truyền vào version ID của LLaVA
      const prediction = await callReplicateWithPolling(input, REPLICATE_LLAVA_VERSION);

      if (prediction.status === "succeeded" && Array.isArray(prediction.output)) {
          const resultText = prediction.output.join("").trim();
          const lines = resultText.split('\n');
          
          // Dòng đầu tiên là caption
          const caption = lines[0] || "unknown";
          let nsfwScore = 0; // Mặc định là an toàn

          // Dòng thứ hai chứa câu trả lời Yes/No
          if (lines.length > 1 && lines[1].toLowerCase().includes("yes")) {
              nsfwScore = 0.95; // Điểm NSFW rất cao nếu câu trả lời là "Yes"
          }
          
          return { caption: caption.toLowerCase(), nsfwScore };
      } else {
          const errorDetails = prediction.error || "Unknown LLaVA prediction failure";
          console.error(`LLaVA prediction failed: ${errorDetails}`);
          throw new Error(`LLaVA prediction failed: ${errorDetails}`);
      }
  }, `LLaVA Analysis for ${imageUrl}`);
}


// ⭐ [UPDATED FOR RATE LIMITING] ENHANCED IMAGE MODERATION
// Hàm này được sửa đổi để xử lý ảnh TUẦN TỰ thay vì SONG SONG
async function moderateImagesEnhanced(images = []) {
  if (images.length === 0) {
    return { score: 1.0, approved: true, reasons: ["Không có hình ảnh"], details: [] };
  }

  try {
    const apiKeys = validateAPIKeys();
    if (!apiKeys.replicate) {
      console.warn("⚠️ Replicate API not available. Approving with caution.");
      return {
        score: 0.8,
        approved: true,
        reasons: ["Rule-based (Replicate API không khả dụng)"],
        details: images.map((img) => ({ url: img.url, caption: 'no_api', nsfwScore: 0 })),
      };
    }

    // --- BẮT ĐẦU THAY ĐỔI LOGIC ---
    // Thay vì dùng Promise.allSettled, chúng ta sẽ dùng vòng lặp for...of
    // để đảm bảo các yêu cầu được gửi đi lần lượt (tuần tự).
    const successfulResults = [];
    const failedReasons = [];
    
    console.log(`🔄 Processing ${images.length} image(s) sequentially to respect rate limits...`);

    for (const img of images) {
      try {
        if (!rateLimiter.canMakeRequest("image")) {
          console.warn("Rate limit buffer reached, pausing for a moment...");
          // Đợi một chút để buffer của rate limiter được làm mới
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        rateLimiter.recordRequest("image");
        
        // Gọi hàm phân tích cho từng ảnh và đợi nó hoàn thành
        const analysis = await analyzeImageWithLlava(img.url);
        successfulResults.push({ ...analysis, url: img.url });
        console.log(`  ✅ Successfully analyzed image: ${img.url.slice(-20)}`);

      } catch (error) {
        // Nếu một ảnh bị lỗi, ghi nhận lý do và tiếp tục với ảnh tiếp theo
        const reason = error.message || "Unknown analysis failure";
        failedReasons.push(reason);
        console.warn(`  ❌ Failed to analyze image: ${img.url.slice(-20)}. Reason: ${reason}`);
      }
      
      // Thêm một khoảng nghỉ nhỏ giữa các lần gọi để đảm bảo an toàn
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // --- KẾT THÚC THAY ĐỔI LOGIC ---

    if (successfulResults.length === 0) {
      throw new Error(`All image analyses failed. Reasons: [${failedReasons.join(", ")}]`);
    }

    if (failedReasons.length > 0) {
      console.warn(`${failedReasons.length}/${images.length} image(s) could not be analyzed.`);
    }

    const maxNSFW = Math.max(0, ...successfulResults.map((res) => res.nsfwScore));
    const nsfwScore = 1 - maxNSFW;

    const reasons = [];
    if (maxNSFW > 0.5) {
      reasons.push(`Hình ảnh có thể chứa nội dung nhạy cảm (NSFW Score: ${maxNSFW.toFixed(2)})`);
    }

    return {
      score: nsfwScore,
      approved: maxNSFW < 0.5,
      reasons,
      details: successfulResults,
    };
  } catch (error) {
    console.error("❌ Enhanced image moderation failed:", error.message);
    return {
      score: 0.3,
      approved: false,
      reasons: ["Lỗi kiểm duyệt hình ảnh"],
      details: [],
    };
  }
}


// ⭐ ENHANCED IMAGE-TEXT MATCHING
function calculateImageTextMatch(captions, productTitle, productDescription = "") {
  if (!captions.length || !productTitle) return 0.5;

  const validCaptions = captions.filter(c => typeof c === 'string' && c.length > 5 && c !== 'unknown' && c !== 'no_api_key');
  if (validCaptions.length === 0) return 0.6; // Không có caption AI, cho điểm trung bình khá

  const productText = `${productTitle} ${productDescription}`.toLowerCase();
  const productKeywords = new Set(productText.split(" ").filter(word => word.length > 2));

  let totalScore = 0;
  validCaptions.forEach((caption) => {
    const captionWords = new Set(caption.split(" ").filter(word => word.length > 2));
    const intersection = new Set([...productKeywords].filter(word => captionWords.has(word)));
    // Jaccard similarity
    const score = intersection.size / (productKeywords.size + captionWords.size - intersection.size);
    totalScore += score;
  });

  const finalScore = totalScore / validCaptions.length;
  return Math.max(finalScore, 0.2); // Đảm bảo score tối thiểu
}

// ⭐ RETRY MECHANISM WITH EXPONENTIAL BACKOFF
// ⭐ [UPGRADED] RETRY MECHANISM WITH SMARTER 429 HANDLING
async function retryWithBackoff(fn, operation, retries = RETRY_CONFIG.maxRetries) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      // --- BẮT ĐẦU PHẦN NÂNG CẤP ---
      // KIỂM TRA XEM ĐÂY CÓ PHẢI LÀ LỖI RATE LIMIT (429) KHÔNG
      if (error.response?.status === 429) {
        if (i === retries) {
          // Nếu đã thử hết số lần mà vẫn bị 429 -> Bỏ cuộc
          console.error(`❌ ${operation} failed after ${retries} retries due to persistent 429 errors.`);
          throw error;
        }

        // Nếu là lỗi 429, chúng ta cần chờ lâu hơn RẤT NHIỀU
        const specialDelay = 5000 * (i + 1); // Chờ 5 giây, rồi 10 giây, rồi 15 giây...
        console.warn(
          `⚠️ Received 429 (Too Many Requests) from ${operation}. Backing off for a longer period: ${specialDelay}ms. Attempt ${i + 1}.`
        );
        
        await new Promise((resolve) => setTimeout(resolve, specialDelay));
        continue; // Bỏ qua phần còn lại của vòng lặp và thử lại
      }
      // --- KẾT THÚC PHẦN NÂNG CẤP ---


      // Logic cũ cho các lỗi khác (ví dụ: 500 - lỗi server)
      const isAuthError = error.response?.status === 401 || error.response?.status === 403;
      const isInvalidKeyError = error.message.includes("API key not available");
      if (isAuthError || isInvalidKeyError) {
        console.error(`❌ ${operation} failed - authentication error (no retry):`, error.message);
        throw error;
      }

      if (i === retries) {
        console.error(`❌ ${operation} failed after ${retries} retries:`, error.message);
        throw error;
      }
      
      // Giữ nguyên logic chờ ngắn hơn cho các lỗi không phải 429
      const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, i);
      console.warn(`⚠️ ${operation} failed (attempt ${i + 1}), retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ⭐ MAIN ENHANCED MODERATION FUNCTION
async function processEnhancedAIModerationBackground(productId, productData) {
  const startTime = Date.now();
  try {
    console.log(`🔍 Starting enhanced AI moderation for product ${productId}`);
    await Product.findByIdAndUpdate(productId, {
      "aiModerationResult.processingStarted": new Date(),
      "aiModerationResult.retryCount": 0,
    });

    const { name: title, description, images = [] } = productData;
    const fullText = `${title} ${description || ""}`;

    const [textResult, imageResult] = await Promise.allSettled([
      moderateTextEnhanced(fullText),
      moderateImagesEnhanced(images),
    ]);

    const textMod = textResult.status === "fulfilled"
      ? textResult.value
      : { score: 0.3, approved: false, reasons: ["Lỗi kiểm duyệt văn bản"] };
    const imageMod = imageResult.status === "fulfilled"
      ? imageResult.value
      : { score: 0.3, approved: false, reasons: ["Lỗi kiểm duyệt hình ảnh"] };

    const captions = imageMod.details?.map((img) => img.caption) || [];
    const imageTextMatchScore = calculateImageTextMatch(captions, title, description);

    const weights = { text: 0.4, image: 0.3, imageTextMatch: 0.3 };
    const finalConfidence = weights.text * textMod.score + weights.image * imageMod.score + weights.imageTextMatch * imageTextMatchScore;
    const approved = textMod.approved && imageMod.approved && imageTextMatchScore >= 0.15 && finalConfidence >= 0.55;

    const status = approved ? "approved" : "rejected";
    const processingTime = Date.now() - startTime;
    const allReasons = [...textMod.reasons, ...imageMod.reasons];
    if (imageTextMatchScore < 0.15 && !approved) {
      allReasons.push(`Hình ảnh không khớp với mô tả (Score: ${imageTextMatchScore.toFixed(2)})`);
    }

    await Product.findByIdAndUpdate(productId, {
      status,
      "aiModerationResult.approved": approved,
      "aiModerationResult.confidence": Number(finalConfidence.toFixed(3)),
      "aiModerationResult.reasons": allReasons,
      "aiModerationResult.reviewedAt": new Date(),
      "aiModerationResult.processingTime": processingTime,
      "aiModerationResult.textModerationScore": textMod.score,
      "aiModerationResult.imageModerationScore": imageMod.score,
      "aiModerationResult.imageTextMatchScore": imageTextMatchScore,
    });

    console.log(`✅ Enhanced moderation complete: ${status.toUpperCase()} | Product: ${productId} | Time: ${processingTime}ms | Confidence: ${finalConfidence.toFixed(3)}`);
    return { approved, confidence: finalConfidence };
  } catch (error) {
    console.error(`❌ Enhanced AI moderation failed for product ${productId}:`, error.message);
    await Product.findByIdAndUpdate(productId, {
      status: "under_review",
      "aiModerationResult.approved": false,
      "aiModerationResult.reasons": [`Lỗi hệ thống AI: ${error.message}`],
      "aiModerationResult.reviewedAt": new Date(),
    });
    throw error;
  }
}

// ⭐ QUEUE PROCESSING SYSTEM
async function addToModerationQueue(productId, productData, priority = "normal") {
  moderationQueue.push({ productId, productData, priority, addedAt: new Date(), attempts: 0 });
  moderationQueue.sort((a, b) => {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
  if (!isProcessingQueue) processQueue();
}

async function processQueue() {
  if (isProcessingQueue || moderationQueue.length === 0) return;
  isProcessingQueue = true;
  console.log(`🔄 Processing moderation queue: ${moderationQueue.length} items`);
  while (moderationQueue.length > 0) {
    const item = moderationQueue.shift();
    try {
      await processEnhancedAIModerationBackground(item.productId, item.productData);
    } catch (error) {
      item.attempts++;
      if (item.attempts < 3) {
        moderationQueue.push({ ...item, priority: "low" });
        console.log(`🔄 Retry queued for product ${item.productId} (attempt ${item.attempts + 1})`);
      } else {
        console.error(`❌ Final failure for product ${item.productId} after 3 attempts`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay
  }
  isProcessingQueue = false;
  console.log("✅ Moderation queue processing complete");
}

// ⭐ API KEY TESTING
async function testAPIKeys() {
  const keys = validateAPIKeys();
  const results = { google: false, openai: false, replicate: false };

  // Test Google Gemini
  if (keys.google) {
    try {
      await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
        { contents: [{ parts: [{ text: "test" }] }], generationConfig: { maxOutputTokens: 5 } },
        { timeout: 10000 }
      );
      results.google = true;
    } catch (error) { console.warn("Google Gemini API test failed:", error.message); }
  }

  // Test OpenAI
  if (keys.openai) {
    try {
      await axios.post(
        "https://api.openai.com/v1/chat/completions",
        { model: "gpt-3.5-turbo", messages: [{ role: "user", content: "test" }], max_tokens: 5 },
        { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 10000 }
      );
      results.openai = true;
    } catch (error) { console.warn("OpenAI API test failed:", error.message); }
  }
  
  // Test Replicate
  if (keys.replicate) {
    try {
        // We test by trying to get info about a prediction that doesn't exist.
        // A 404 response means the API key is valid. A 401 means it's not.
        await axios.get('https://api.replicate.com/v1/predictions/this-will-404', {
            headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
            timeout: 10000
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            results.replicate = true; // Correct! 404 is an expected outcome for a valid key.
        } else {
            console.warn("Replicate API test failed:", error.message);
        }
    }
  }

  console.log("🧪 API Keys Test Results:", results);
  return results;
}

// ⭐ HEALTH CHECK FUNCTION
function getModerationSystemHealth() {
  return {
    queueLength: moderationQueue.length,
    isProcessing: isProcessingQueue,
    rateLimiterStatus: {
      text: rateLimiter.requests.get("text")?.length || 0,
      image: rateLimiter.requests.get("image")?.length || 0,
    },
    availableServices: validateAPIKeys(),
  };
}
module.exports = {
  processEnhancedAIModerationBackground,
  addToModerationQueue,
  getModerationSystemHealth,
  validateAPIKeys,
  testAPIKeys,
  // For testing individual components
  moderateTextEnhanced,
  moderateImagesEnhanced,
  calculateImageTextMatch,
};