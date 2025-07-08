const axios = require("axios");
const Product = require("../models/Product");
require("dotenv").config();

// Chỉ sử dụng Google Gemini API
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;

// ⭐ CONFIGURABLE MODERATION SETTINGS
const MODERATION_CONFIG = {
  // Relaxed thresholds for better user experience
  TEXT_APPROVAL_THRESHOLD: 0.5,        // Giảm từ 0.7 → 0.5
  FINAL_CONFIDENCE_THRESHOLD: 0.5,     // Giảm từ 0.65 → 0.5
  IMAGE_TEXT_MATCH_THRESHOLD: 0.15,    // Giảm từ 0.25 → 0.15
  INDIVIDUAL_SCORE_THRESHOLD: 0.5,     // Giảm từ 0.7 → 0.5
  
  // Strict mode (có thể bật để test)
  STRICT_MODE: false,
  
  // Get current thresholds based on mode
  getThresholds() {
    if (this.STRICT_MODE) {
      return {
        textApproval: 0.7,
        finalConfidence: 0.65,
        imageTextMatch: 0.25,
        individualScore: 0.7
      };
    }
    return {
      textApproval: this.TEXT_APPROVAL_THRESHOLD,
      finalConfidence: this.FINAL_CONFIDENCE_THRESHOLD,
      imageTextMatch: this.IMAGE_TEXT_MATCH_THRESHOLD,
      individualScore: this.INDIVIDUAL_SCORE_THRESHOLD
    };
  }
};

function validateAPIKeys() {
  const validKeys = {
    google: !!GOOGLE_AI_KEY && GOOGLE_AI_KEY.length > 10,
  };

  console.log("🔑 Google AI Key Status:", validKeys.google ? "✅ Available" : "❌ Missing");
  return validKeys;
}

// ⭐ QUEUE SYSTEM FOR MODERATION
const moderationQueue = [];
let isProcessingQueue = false;

// ⭐ ENHANCED RETRY CONFIGURATION (More aggressive)
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 2,
};

// ⭐ STRICTER RATE LIMITING
const rateLimiter = {
  requests: new Map(),
  maxRequestsPerMinute: 15, // Giảm để tránh rate limit

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

// ⭐ BALANCED TEXT MODERATION (More lenient)
async function moderateTextEnhanced(text) {
  const thresholds = MODERATION_CONFIG.getThresholds();
  
  const prohibited_keywords = [
    // Lừa đảo & scam nghiêm trọng
    "lừa đảo", "scam", "fake", "hàng giả", "hàng nhái", "rep 1:1",
    
    // Chất cấm
    "ma túy", "thuốc lá", "rượu", "bia", "vũ khí", "chất nổ", 
    "thuốc kích dục", "thuốc tránh thai", "thuốc điều trị",
    
    // Nội dung người lớn
    "người lớn", "sex", "porn", "18+", "nude", "xxx", "adult",
    "dụng cụ tình dục",
    
    // Tài chính
    "vay tiền", "cho vay", "forex", "bitcoin", "crypto", 
    "cược", "casino", "đánh bài", "lô đề", "xổ số",
  ];

  // Giảm bớt spam patterns - chỉ giữ những cái nghiêm trọng
  const spam_patterns = [
    /\b\d{10,11}\b|sđt|phone|tel|zalo|viber|telegram|whatsapp/gi,
    /link|website|www\.|http|\.com|\.vn|\.net/gi,
    // Xóa emoji spam pattern để không bị reject vì emoji thường
    /[A-Z]{5,}.*[A-Z]{5,}/g, // Tăng từ 3 lên 5 chữ cái liên tiếp
  ];

  try {
    const textLower = text.toLowerCase();
    const foundProhibited = prohibited_keywords.filter((keyword) => textLower.includes(keyword));
    const spamMatches = spam_patterns.filter((pattern) => pattern.test(text));
    
    // Các tiêu chí chất lượng LỎNG LẺO hơn
    const hasValidContent = text.length >= 15 && text.split(" ").length >= 3; // Giảm yêu cầu
    const hasExcessiveCaps = (text.match(/[A-Z]/g) || []).length / text.length > 0.5; // Tăng tolerance
    const hasExcessiveNumbers = (text.match(/\d/g) || []).length / text.length > 0.4; // Tăng tolerance
    const hasExcessiveSpecialChars = (text.match(/[!@#$%^&*()_+={}\[\]:";'<>?,./]/g) || []).length / text.length > 0.2;
    const hasContactInfo = /\b\d{9,11}\b/gi.test(text); // Chỉ phone numbers thôi

    let aiScore = 0.6; // Bắt đầu với điểm cao hơn (optimistic by default)
    const apiKeys = validateAPIKeys();

    // Chỉ dùng Google Gemini AI nếu text pass basic check và có API key
    if (foundProhibited.length === 0 && spamMatches.length === 0 && 
        rateLimiter.canMakeRequest("text") && apiKeys.google) {
      try {
        rateLimiter.recordRequest("text");
        aiScore = await analyzeTextWithGemini(text);
      } catch (err) {
        console.warn("Google Gemini text analysis failed, using default score:", err.message);
        aiScore = 0.6; // Điểm mặc định cao hơn
      }
    }

    // SCORING LỎNG LẺO HỨN
    const qualityScore = hasValidContent ? 1.0 : 0.3; // Tăng reward
    const formatScore = (hasExcessiveCaps || hasExcessiveNumbers || hasExcessiveSpecialChars) ? 0.3 : 1.0;
    const prohibitedScore = foundProhibited.length > 0 ? 0 : 1.0;
    const spamScore = spamMatches.length > 0 ? 0 : 1.0;
    const contactScore = hasContactInfo ? 0.2 : 1.0; // Ít penalty hơn
    
    // Weighted scoring với penalties nhẹ hơn
    const finalScore = 0.35 * aiScore + 0.2 * qualityScore + 0.15 * formatScore + 
                      0.15 * prohibitedScore + 0.1 * spamScore + 0.05 * contactScore;

    const reasons = [];
    if (foundProhibited.length > 0) reasons.push(`Từ khóa cấm: ${foundProhibited.slice(0, 3).join(", ")}`);
    if (spamMatches.length > 0) reasons.push(`Nghi vấn spam: ${spamMatches.length} mẫu`);
    if (!hasValidContent) reasons.push("Nội dung quá ngắn hoặc không rõ ràng");
    if (hasExcessiveCaps) reasons.push("Quá nhiều chữ in hoa");
    if (hasContactInfo) reasons.push("Chứa số điện thoại");

    return {
      score: Math.min(Math.max(finalScore, 0), 1),
      approved: finalScore >= thresholds.textApproval, // Sử dụng threshold động
      reasons,
      aiUsed: aiScore !== 0.6,
    };
  } catch (error) {
    console.error("❌ Enhanced text moderation failed:", error.message);
    return { score: 0.3, approved: false, reasons: ["Lỗi kiểm duyệt văn bản"], aiUsed: false };
  }
}

// ⭐ ENHANCED GOOGLE GEMINI TEXT ANALYSIS (More lenient)
async function analyzeTextWithGemini(text) {
  return await retryWithBackoff(async () => {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Bạn là một AI kiểm duyệt nội dung cho sàn thương mại điện tử tại Việt Nam. Hãy phân tích mô tả sản phẩm sau và cho điểm từ 0.0 đến 1.0:

TIÊU CHÍ ĐÁNH GIÁ CÂN BẰNG:
- 0.0-0.2: Spam rõ ràng, lừa đảo, nội dung cấm nghiêm trọng
- 0.3-0.4: Chất lượng kém, nghi ngờ spam
- 0.5-0.6: Bình thường, có thể chấp nhận
- 0.7-0.8: Mô tả tốt, rõ ràng
- 0.9-1.0: Mô tả xuất sắc

CHỈ TỪ CHỐI KHI:
- Chứa từ khóa lừa đảo nghiêm trọng
- Spam quảng cáo quá mức
- Nội dung không phù hợp, vi phạm pháp luật
- Chứa thông tin liên hệ trực tiếp

CHẤP NHẬN:
- Emoji thông thường (🌸, ✨, 💖, v.v.)
- Mô tả sản phẩm bình thường
- Thông tin bán hàng cơ bản

Văn bản cần phân tích: "${text}"

Chỉ trả về MỘT SỐ THẬP PHÂN duy nhất (ví dụ: 0.6).`
          }],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const score = parseFloat(result?.trim());
    return isNaN(score) ? 0.6 : Math.min(Math.max(score, 0), 1); // Default 0.6
  }, "Gemini Balanced Analysis");
}

// Đã xóa bỏ OpenAI và GPT-4 Vision - chỉ sử dụng Google Gemini

// ⭐ ENHANCED GOOGLE GEMINI VISION
async function analyzeImageWithGeminiVision(imageUrl) {
  if (!GOOGLE_AI_KEY) {
    return { caption: "no_api_key", nsfwScore: 0, inappropriateScore: 0 };
  }

  return await retryWithBackoff(async () => {
    const imageBase64 = await getImageAsBase64(imageUrl);
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        contents: [{
          parts: [
            {
              text: `PHÂN TÍCH HÌNH ẢNH NGHIÊM NGẶT cho sàn thương mại điện tử:

Hãy đánh giá hình ảnh này theo các tiêu chí:
1. Mô tả ngắn gọn (1 câu)
2. Điểm NSFW (0.0-1.0): Nội dung nhạy cảm/người lớn
3. Điểm Vi phạm (0.0-1.0): Lừa đảo, hàng giả, vi phạm chính sách
4. Điểm Chân thực (0.0-1.0): Ảnh thật hay photoshop/fake

Định dạng: Mô tả|NSFW:X.X|Vi phạm:X.X|Chân thực:X.X`
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64
              }
            }
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 20000 }
    );

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parts = result.split("|");
    
    const caption = parts[0] || "unknown";
    const nsfwMatch = result.match(/NSFW:(\d+\.?\d*)/i);
    const inappropriateMatch = result.match(/Vi phạm:(\d+\.?\d*)/i);
    const authenticMatch = result.match(/Chân thực:(\d+\.?\d*)/i);
    
    const nsfwScore = nsfwMatch ? parseFloat(nsfwMatch[1]) : 0;
    const inappropriateScore = inappropriateMatch ? parseFloat(inappropriateMatch[1]) : 0;
    const authenticityScore = authenticMatch ? parseFloat(authenticMatch[1]) : 0.5;

    return { 
      caption: caption.toLowerCase(), 
      nsfwScore, 
      inappropriateScore,
      authenticityScore
    };
  }, `Gemini Vision Analysis for ${imageUrl}`);
}

// Helper function to convert image URL to base64 for Gemini
async function getImageAsBase64(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    throw new Error(`Failed to fetch image: ${error.message}`);
  }
}

// Đã xóa bỏ Replicate/LLaVA - chỉ sử dụng Google Gemini

// ⭐ MUCH MORE STRICT IMAGE MODERATION
async function moderateImagesEnhanced(images = []) {
  if (images.length === 0) {
    return { score: 1.0, approved: true, reasons: ["Không có hình ảnh"], details: [] };
  }

  try {
    const apiKeys = validateAPIKeys();
    
    // Chỉ sử dụng Google Gemini API
    if (!apiKeys.google) {
      console.warn("⚠️ Google Gemini API not available. Using conservative approval.");
      return {
        score: 0.3,
        approved: false,
        reasons: ["Google Gemini API không khả dụng - yêu cầu review thủ công"],
        details: images.map((img) => ({ url: img.url, caption: 'no_api', nsfwScore: 0 })),
      };
    }
    
    console.log(`🔧 Using Google Gemini Vision API`);

    const successfulResults = [];
    const failedReasons = [];
    
    console.log(`🔄 Processing ${images.length} image(s) with enhanced AI models...`);

    for (const img of images) {
      try {
        if (!rateLimiter.canMakeRequest("image")) {
          console.warn("Rate limit reached, waiting...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        rateLimiter.recordRequest("image");
        
        // Sử dụng Google Gemini Vision API
        console.log(`  🔄 Analyzing image with Google Gemini: ${img.url.slice(-20)}`);
        
        const analysis = await analyzeImageWithGeminiVision(img.url);
        console.log(`  ✅ Successfully analyzed with Google Gemini Vision`);
        
        successfulResults.push({ ...analysis, url: img.url, apiUsed: 'Google Gemini Vision' });
        console.log(`  ✅ Image analyzed with Google Gemini Vision: ${img.url.slice(-20)}`);

      } catch (error) {
        const reason = error.message || "Unknown analysis failure";
        failedReasons.push(reason);
        console.warn(`  ❌ Failed: ${img.url.slice(-20)}. Reason: ${reason}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay between requests
    }

    if (successfulResults.length === 0) {
      console.warn(`❌ All image analyses failed. Using conservative fallback approach.`);
      console.warn(`Failed reasons: [${failedReasons.join(", ")}]`);
      
      // Conservative fallback: reject images when AI analysis completely fails
      return {
        score: 0.2,
        approved: false,
        reasons: [
          "Không thể phân tích hình ảnh bằng AI", 
          "Yêu cầu review thủ công",
          `Lỗi: ${failedReasons.slice(0, 2).join(", ")}`
        ],
        details: images.map((img) => ({ 
          url: img.url, 
          caption: 'analysis_failed', 
          nsfwScore: 0,
          inappropriateScore: 0,
          authenticityScore: 0,
          error: 'AI analysis failed'
        })),
      };
    }

    // MUCH MORE STRICT SCORING
    const maxNSFW = Math.max(0, ...successfulResults.map((res) => res.nsfwScore || 0));
    const maxInappropriate = Math.max(0, ...successfulResults.map((res) => res.inappropriateScore || 0));
    const minAuthenticity = Math.min(1, ...successfulResults.map((res) => res.authenticityScore || 0.5));
    
    // Combined safety score (more strict)
    const nsfwPenalty = maxNSFW > 0.3 ? maxNSFW : 0; // Lower threshold
    const inappropriatePenalty = maxInappropriate > 0.3 ? maxInappropriate : 0;
    const authenticityBonus = minAuthenticity > 0.7 ? minAuthenticity * 0.3 : 0;
    
    const finalScore = Math.max(0, 1 - nsfwPenalty - inappropriatePenalty + authenticityBonus);

    const reasons = [];
    if (maxNSFW > 0.3) {
      reasons.push(`Nghi ngờ NSFW (Score: ${maxNSFW.toFixed(2)})`);
    }
    if (maxInappropriate > 0.3) {
      reasons.push(`Nội dung không phù hợp (Score: ${maxInappropriate.toFixed(2)})`);
    }
    if (minAuthenticity < 0.5) {
      reasons.push(`Nghi ngờ ảnh giả/photoshop (Score: ${minAuthenticity.toFixed(2)})`);
    }

    return {
      score: finalScore,
      approved: finalScore >= 0.7 && maxNSFW < 0.3 && maxInappropriate < 0.3, // More strict
      reasons,
      details: successfulResults,
    };
  } catch (error) {
    console.error("❌ Enhanced image moderation failed:", error.message);
    return {
      score: 0.1, // Much lower score on failure
      approved: false,
      reasons: ["Lỗi phân tích hình ảnh - cần review thủ công"],
      details: [],
    };
  }
}

// ⭐ BALANCED IMAGE-TEXT MATCHING (More lenient)
function calculateImageTextMatch(captions, productTitle, productDescription = "") {
  if (!captions.length || !productTitle) return 0.5; // Higher default for better UX

  const validCaptions = captions.filter(c => 
    typeof c === 'string' && c.length > 5 && 
    c !== 'unknown' && c !== 'no_api_key' && c !== 'no_api'
  );
  
  if (validCaptions.length === 0) return 0.6; // Higher when no valid captions

  const productText = `${productTitle} ${productDescription}`.toLowerCase();
  const productKeywords = new Set(
    productText.split(" ")
      .filter(word => word.length > 2)
      .map(word => word.replace(/[^\w]/g, ''))
  );

  let totalScore = 0;
  let matchCount = 0;
  
  validCaptions.forEach((caption) => {
    const captionWords = new Set(
      caption.toLowerCase().split(" ")
        .filter(word => word.length > 2)
        .map(word => word.replace(/[^\w]/g, ''))
    );
    
    // Count direct keyword matches (more lenient)
    const matches = [...productKeywords].filter(word => captionWords.has(word));
    if (matches.length > 0) {
      matchCount += matches.length;
    }
    
    // Jaccard similarity (original method)
    const intersection = new Set([...productKeywords].filter(word => captionWords.has(word)));
    const union = new Set([...productKeywords, ...captionWords]);
    const jaccardScore = intersection.size / union.size;
    totalScore += jaccardScore;
  });

  // Boost score if we have direct matches
  const averageScore = totalScore / validCaptions.length;
  const matchBoost = Math.min(matchCount * 0.1, 0.3); // Up to 30% boost
  const finalScore = Math.min(averageScore + matchBoost, 1.0);
  
  return Math.max(finalScore, 0.2); // More generous minimum threshold
}

// ⭐ ENHANCED RETRY MECHANISM
async function retryWithBackoff(fn, operation, retries = RETRY_CONFIG.maxRetries) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        if (i === retries) {
          console.error(`❌ ${operation} failed after ${retries} retries due to persistent 429 errors.`);
          throw error;
        }
        const specialDelay = 8000 * (i + 1); // Longer delays for rate limits
        console.warn(`⚠️ Rate limited ${operation}. Backing off for ${specialDelay}ms. Attempt ${i + 1}.`);
        await new Promise((resolve) => setTimeout(resolve, specialDelay));
        continue;
      }

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
      
      const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, i);
      console.warn(`⚠️ ${operation} failed (attempt ${i + 1}), retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ⭐ CONFIGURABLE AI MODERATION FUNCTION (Balanced by default)
async function processEnhancedAIModerationBackground(productId, productData) {
  const startTime = Date.now();
  try {
    const currentMode = MODERATION_CONFIG.STRICT_MODE ? "STRICT" : "BALANCED";
    console.log(`🔍 Starting ${currentMode} Google Gemini moderation for product ${productId}`);
    await Product.findByIdAndUpdate(productId, {
      "aiModerationResult.processingStarted": new Date(),
      "aiModerationResult.retryCount": 0,
    });

    const { name: title, description, images = [] } = productData;
    const fullText = `${title} ${description || ""}`;

    // Run analysis in parallel but with more conservative scoring
    const [textResult, imageResult] = await Promise.allSettled([
      moderateTextEnhanced(fullText),
      moderateImagesEnhanced(images),
    ]);

    const textMod = textResult.status === "fulfilled"
      ? textResult.value
      : { score: 0.1, approved: false, reasons: ["Lỗi kiểm duyệt văn bản"] };
    const imageMod = imageResult.status === "fulfilled"
      ? imageResult.value
      : { score: 0.1, approved: false, reasons: ["Lỗi kiểm duyệt hình ảnh"] };

    const captions = imageMod.details?.map((img) => img.caption) || [];
    const imageTextMatchScore = calculateImageTextMatch(captions, title, description);

    // BALANCED WEIGHTS AND THRESHOLDS
    const thresholds = MODERATION_CONFIG.getThresholds();
    const weights = { text: 0.45, image: 0.35, imageTextMatch: 0.20 };
    const finalConfidence = weights.text * textMod.score + 
                           weights.image * imageMod.score + 
                           weights.imageTextMatch * imageTextMatchScore;

    // MORE LENIENT APPROVAL CRITERIA
    const approved = textMod.approved && 
                     imageMod.approved && 
                     imageTextMatchScore >= thresholds.imageTextMatch && 
                     finalConfidence >= thresholds.finalConfidence && 
                     textMod.score >= thresholds.individualScore && 
                     imageMod.score >= thresholds.individualScore;

    const status = approved ? "approved" : "rejected";
    const processingTime = Date.now() - startTime;
    const allReasons = [...textMod.reasons, ...imageMod.reasons];
    
    if (imageTextMatchScore < thresholds.imageTextMatch && !approved) {
      allReasons.push(`Hình ảnh không khớp với mô tả (Score: ${imageTextMatchScore.toFixed(2)})`);
    }
    if (finalConfidence < thresholds.finalConfidence && !approved) {
      allReasons.push(`Điểm tổng thể quá thấp (${finalConfidence.toFixed(2)}/1.0)`);
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
      "aiModerationResult.strictMode": MODERATION_CONFIG.STRICT_MODE, // Flag to indicate current mode
    });

    console.log(`${approved ? '✅' : '❌'} ${currentMode} Google Gemini moderation complete: ${status.toUpperCase()} | Product: ${productId} | Time: ${processingTime}ms | Confidence: ${finalConfidence.toFixed(3)}`);
    return { approved, confidence: finalConfidence };
  } catch (error) {
    console.error(`❌ ${currentMode} Google Gemini moderation failed for product ${productId}:`, error.message);
    await Product.findByIdAndUpdate(productId, {
      status: "under_review",
      "aiModerationResult.approved": false,
      "aiModerationResult.reasons": [`Lỗi hệ thống AI: ${error.message}`],
      "aiModerationResult.reviewedAt": new Date(),
    });
    throw error;
  }
}

// ⭐ QUEUE PROCESSING SYSTEM (Keep existing)
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
  const currentMode = MODERATION_CONFIG.STRICT_MODE ? "STRICT" : "BALANCED";
  console.log(`🔄 Processing ${currentMode} Google Gemini moderation queue: ${moderationQueue.length} items`);
  while (moderationQueue.length > 0) {
    const item = moderationQueue.shift();
    try {
      await processEnhancedAIModerationBackground(item.productId, item.productData);
    } catch (error) {
      item.attempts++;
      if (item.attempts < 2) { // Giảm retry attempts
        moderationQueue.push({ ...item, priority: "low" });
        console.log(`🔄 Retry queued for product ${item.productId} (attempt ${item.attempts + 1})`);
      } else {
        console.error(`❌ Final failure for product ${item.productId} after 2 attempts`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Longer delay
  }
  isProcessingQueue = false;
  console.log(`✅ ${currentMode} Google Gemini moderation queue processing complete`);
}

// ⭐ GOOGLE GEMINI API TESTING
async function testAPIKeys() {
  const keys = validateAPIKeys();
  const results = { google: false };

  // Test Google Gemini
  if (keys.google) {
    try {
      await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
        { contents: [{ parts: [{ text: "test" }] }], generationConfig: { maxOutputTokens: 5 } },
        { timeout: 15000 }
      );
      results.google = true;
      console.log("✅ Google Gemini API test successful");
    } catch (error) { 
      console.warn("❌ Google Gemini API test failed:", error.message);
      results.google = false;
    }
  } else {
    console.warn("❌ Google Gemini API key not found");
  }

  console.log("🧪 Google Gemini API Test Result:", results.google ? "✅ Working" : "❌ Failed");
  return results;
}

// ⭐ GOOGLE GEMINI HEALTH CHECK
function getModerationSystemHealth() {
  const apiKeys = validateAPIKeys();
  const thresholds = MODERATION_CONFIG.getThresholds();
  
  return {
    queueLength: moderationQueue.length,
    isProcessing: isProcessingQueue,
    apiProvider: "Google Gemini Only",
    strictMode: MODERATION_CONFIG.STRICT_MODE,
    currentMode: MODERATION_CONFIG.STRICT_MODE ? "STRICT" : "BALANCED",
    rateLimiterStatus: {
      text: rateLimiter.requests.get("text")?.length || 0,
      image: rateLimiter.requests.get("image")?.length || 0,
    },
    googleGeminiStatus: apiKeys.google,
    systemStatus: apiKeys.google ? "✅ Ready" : "❌ API Key Missing",
    thresholds: {
      textApproval: thresholds.textApproval,
      imageApproval: thresholds.individualScore,
      finalConfidence: thresholds.finalConfidence,
      imageTextMatch: thresholds.imageTextMatch,
    },
  };
}

module.exports = {
  processEnhancedAIModerationBackground,
  addToModerationQueue,
  getModerationSystemHealth,
  validateAPIKeys,
  testAPIKeys,
  // For testing individual components (Google Gemini only)
  moderateTextEnhanced,
  moderateImagesEnhanced,
  calculateImageTextMatch,
  // Google Gemini functions
  analyzeTextWithGemini,
  analyzeImageWithGeminiVision,
  getImageAsBase64,
  // Configuration access for admin
  MODERATION_CONFIG,
};