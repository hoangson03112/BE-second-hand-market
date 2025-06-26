const axios = require("axios");

class OpenRouterModerationService {
  constructor() {
    this.apiKey = process.env.OPEN_ROUTER_KEY;
    this.baseUrl = "https://openrouter.ai/api/v1";
    this.appName = process.env.APP_NAME || "EcoMarket";
    this.appUrl = process.env.APP_URL || "http://localhost:3000";

    // Simplified model configuration
    this.models = {
      text: "google/gemma-2-9b-it:free",
      vision: "openai/gpt-4o-mini",
    };
  }

  /**
   * Main method: Moderate product with scoring system (1-10)
   * - Score 0-5: Reject
   * - Score 6-10: Approve
   * User có thể request admin review nếu bị reject
   */
  async moderateProduct(productData) {
    try {
      const hasImages = productData.images && productData.images.length > 0;
      const scoreResult = await this.scoreProduct(productData, hasImages);

      const result = {
        score: scoreResult.score,
        approved: scoreResult.score >= 6,
        reasons: scoreResult.score < 6 ? scoreResult.reasons : [], // Chỉ lưu lý do khi reject
        confidence: this.calculateConfidence(scoreResult.score),
        totalCost: scoreResult.cost || 0,
        consistency_check: scoreResult.consistency_check || {
          name_description_match: true,
          price_reasonable: true,
          image_product_match: true
        }
      };

      return result;
    } catch (error) {
      console.error("AI moderation error:", error);
      return this.fallbackModeration(productData);
    }
  }

  /**
   * Core scoring method - handles both text and vision
   */
  async scoreProduct(productData, hasImages) {
    if (!this.apiKey) {
      console.log("No API key, using fallback scoring");
      return this.fallbackScoring(productData);
    }

    const prompt = this.buildScoringPrompt(productData, hasImages);
    const model = hasImages ? this.models.vision : this.models.text;

    try {
      const messages = hasImages
        ? this.buildVisionMessages(prompt, productData.images[0])
        : [{ role: "user", content: prompt }];

      const response = await this.makeAPICall(model, messages, 300);
      const result = this.parseAIResponse(response);

      if (result) {
        return {
          score: Math.max(0, Math.min(10, result.score || 0)),
          reasons: result.reasons || [],
          consistency_check: result.consistency_check || {
            name_description_match: true,
            price_reasonable: true,
            image_product_match: true
          },
          cost: hasImages ? this.estimateImageCost() : this.estimateTextCost(prompt)
        };
      }
    } catch (error) {
      console.error("AI scoring failed:", error);
    }

    return this.fallbackScoring(productData);
  }

  /**
   * Build optimized scoring prompt with STRICT consistency checks
   */
  buildScoringPrompt(productData, hasImages) {
    return `🎯 CHẤM ĐIỂM SẢN PHẨM KHẮT KHE (1-10):

📋 THÔNG TIN SẢN PHẨM:
- Tên: "${productData.name}"
- Giá: ${productData.price} VNĐ  
- Mô tả: "${productData.description || "Không có"}"
- Danh mục: ${productData.categoryId || "Không có"}
${hasImages ? "- Có hình ảnh: Có (sẽ phân tích chi tiết)" : "- Hình ảnh: Không có"}

🚨 TIÊU CHÍ KHẮT KHE - KIỂM TRA NHẤT QUÁN:

1️⃣ **TÍNH NHẤT QUÁN THÔNG TIN (3 điểm):**
   - Tên, mô tả, giá có logic với nhau không?
   - Thông tin có mâu thuẫn không? (VD: tên iPhone mà mô tả Samsung)
   - Giá có phù hợp với sản phẩm trong tên/mô tả?
   ${hasImages ? "- Hình ảnh có CHÍNH XÁC thể hiện sản phẩm trong tên không?" : ""}

2️⃣ **CHẤT LƯỢNG TÊN SẢN PHẨM (2 điểm):**
   - Tên cụ thể, rõ ràng (≥10 ký tự có nghĩa)
   - Có thương hiệu/model/loại sản phẩm rõ ràng
   - KHÔNG mơ hồ: "đồ", "thứ", "máy" mà không rõ cụ thể

3️⃣ **CHẤT LƯỢNG MÔ TẢ (2 điểm):**
   - Mô tả chi tiết, đầy đủ thông tin
   - PHẢI phù hợp với tên sản phẩm
   - Không copy-paste, không spam

4️⃣ **GIÁ CẢ HỢP LÝ (2 điểm):**
   - Giá phù hợp với loại sản phẩm và tình trạng
   - Không nghi ngờ lừa đảo (quá rẻ bất thường)
   - Logic với thương hiệu trong tên

5️⃣ **TUÂN THỦ QUY ĐỊNH (1 điểm):**
   - Không nội dung cấm (khiêu dâm, bạo lực, ma túy, vũ khí)
   - Không spam keywords ("rẻ nhất", "cực hot", "sale sốc")

${hasImages ? `
🖼️ **KIỂM TRA HÌNH ẢNH KHẮT KHE:**
- Hình ảnh PHẢI chính xác 100% với tên sản phẩm
- Nếu tên "iPhone 12" → hình PHẢI là iPhone 12 (không phải iPhone khác)
- Nếu tên "Áo Nike" → hình PHẢI thấy rõ logo Nike
- Nếu tên "Laptop Dell" → hình PHẢI là laptop Dell (thấy logo/model)
- Hình không được mờ, tối, stock photo, hoặc không liên quan
- Màu sắc trong ảnh phải khớp với mô tả (nếu có)
` : ""}

⚠️ **TỰ ĐỘNG ĐIỂM THẤP NẾU:**
- Tên và hình ảnh KHÔNG KHỚP (VD: tên iPhone mà hình Samsung)
- Giá bất hợp lý (iPhone 12 giá 2 triệu, Laptop gaming giá 3 triệu)
- Thông tin mâu thuẫn (tên A mô tả B)
- Hình ảnh không rõ ràng hoặc không phải sản phẩm thật
- Tên quá mơ hồ không thể xác định sản phẩm

⚡ **QUY TẮC CHẤM ĐIỂM:**
- 0-5 điểm: BỊ TỪ CHỐI (thông tin không nhất quán hoặc vi phạm)
- 6-10 điểm: ĐƯỢC DUYỆT (thông tin rõ ràng, nhất quán)

💡 **LƯU Ý**: Nếu bị từ chối, người dùng có thể yêu cầu admin review lại

Trả lời JSON với phân tích chi tiết:
{
  "score": 7,
  "reasons": ["lý do cụ thể nếu score < 6"],
  "consistency_check": {
    "name_description_match": true/false,
    "price_reasonable": true/false,
    "image_product_match": true/false
  }
}`;
  }

  /**
   * Build vision messages for image analysis
   */
  buildVisionMessages(prompt, imageData) {
    const imageUrl = imageData?.url || imageData;
    return [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ];
  }

  /**
   * Make API call with proper error handling
   */
  async makeAPICall(model, messages, maxTokens = 200) {
    return await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.appUrl,
          "X-Title": this.appName,
        },
        timeout: 25000,
      }
    );
  }

  /**
   * Parse AI response and extract JSON with consistency analysis
   */
  parseAIResponse(response) {
    try {
      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // Validate and enhance result with consistency data
        return {
          score: result.score || 0,
          reasons: result.reasons || [],
          consistency_check: result.consistency_check || {
            name_description_match: true,
            price_reasonable: true,
            image_product_match: true
          }
        };
      }
      
      return null;
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      return null;
    }
  }

  /**
   * Enhanced fallback scoring with strict consistency checks
   */
  fallbackScoring(productData) {
    let score = 7; // Default score
    const reasons = [];
    const consistency_check = {
      name_description_match: true,
      price_reasonable: true,
      image_product_match: true
    };

    // 1. KIỂM TRA TÊN SẢN PHẨM
    if (!productData.name || productData.name.length < 10) {
      score = 3;
      reasons.push("Tên sản phẩm quá ngắn hoặc không rõ ràng");
    }

    // Kiểm tra tên có cụ thể không
    const vagueName = /^(đồ|thứ|máy|cái)\s/i.test(productData.name);
    if (vagueName) {
      score = Math.min(score, 4);
      reasons.push("Tên sản phẩm quá mơ hồ, cần cụ thể hơn");
    }

    // 2. KIỂM TRA GIÁ CẢ
    if (!productData.price || productData.price <= 0) {
      score = 2;
      reasons.push("Giá không hợp lệ");
      consistency_check.price_reasonable = false;
    }

    // Kiểm tra giá bất thường với tên sản phẩm
    const name = productData.name.toLowerCase();
    if (name.includes('iphone') && productData.price < 2000000) {
      score = Math.min(score, 3);
      reasons.push("Giá iPhone quá thấp, nghi ngờ lừa đảo");
      consistency_check.price_reasonable = false;
    }
    if (name.includes('laptop') && productData.price < 3000000) {
      score = Math.min(score, 4);
      reasons.push("Giá laptop quá thấp, không hợp lý");
      consistency_check.price_reasonable = false;
    }

    // 3. KIỂM TRA NHẤT QUÁN TÊN - MÔ TẢ
    if (productData.description && productData.description.length > 10) {
      const nameLower = productData.name.toLowerCase();
      const descLower = productData.description.toLowerCase();
      
      // Tìm thương hiệu trong tên
      const brandInName = this.extractBrand(nameLower);
      const brandInDesc = this.extractBrand(descLower);
      
      if (brandInName && brandInDesc && brandInName !== brandInDesc) {
        score = Math.min(score, 4);
        reasons.push(`Thương hiệu không nhất quán: tên có "${brandInName}" nhưng mô tả có "${brandInDesc}"`);
        consistency_check.name_description_match = false;
      }
    }

    // 4. KIỂM TRA NỘI DUNG CẤM
    const text = `${productData.name} ${productData.description || ""}`.toLowerCase();
    const bannedWords = ["ma túy", "vũ khí", "lừa đảo", "hack", "porn", "sex"];
    
    for (const word of bannedWords) {
      if (text.includes(word)) {
        score = 0;
        reasons.push(`Chứa nội dung cấm: ${word}`);
        break;
      }
    }

    // 5. KIỂM TRA SPAM KEYWORDS
    const spamWords = ["rẻ nhất", "cực hot", "sale sốc", "khuyến mãi lớn"];
    for (const word of spamWords) {
      if (text.includes(word)) {
        score = Math.min(score, 4);
        reasons.push(`Chứa từ khóa spam: ${word}`);
        break;
      }
    }

    return {
      score: Math.max(0, Math.min(10, score)),
      reasons: score < 6 ? reasons : [],
      consistency_check,
      cost: 0
    };
  }

  /**
   * Extract brand from text for consistency checking
   */
  extractBrand(text) {
    const brands = ['iphone', 'samsung', 'sony', 'lg', 'dell', 'hp', 'asus', 'lenovo', 'acer', 'nike', 'adidas'];
    for (const brand of brands) {
      if (text.includes(brand)) {
        return brand;
      }
    }
    return null;
  }

  /**
   * Fallback moderation result
   */
  fallbackModeration(productData) {
    const scoring = this.fallbackScoring(productData);
    return {
      score: scoring.score,
      approved: scoring.score >= 6,
      reasons: scoring.reasons,
      confidence: 0.6,
      totalCost: 0,
    };
  }

  /**
   * Calculate confidence based on score
   */
  calculateConfidence(score) {
    if (score <= 3) return 0.95;
    if (score <= 5) return 0.9;
    if (score >= 8) return 0.9;
    return 0.8;
  }

  /**
   * Cost estimation methods
   */
  estimateTextCost(text) {
    const tokens = Math.ceil(text.length / 4);
    return tokens * 0; // Free models
  }

  estimateImageCost() {
    return 0.00042; // ~$0.42/1K images for GPT-4o-mini
  }

  /**
   * Get available models (for admin interface)
   */
  getAvailableModels() {
    return {
      text: this.models.text,
      vision: this.models.vision,
      free_models: [
        "google/gemma-2-9b-it:free",
        "meta-llama/llama-3.1-8b-instruct:free",
        "microsoft/phi-3-mini-128k-instruct:free",
      ],
    };
  }

  /**
   * Health check method
   */
  async healthCheck() {
    if (!this.apiKey) {
      return {
        status: "warning",
        message: "No API key configured, using fallback",
      };
    }

    try {
      const response = await this.makeAPICall(
        this.models.text,
        [{ role: "user", content: "Test" }],
        10
      );
      return { status: "ok", message: "AI service is working" };
    } catch (error) {
      return { status: "error", message: `AI service error: ${error.message}` };
    }
  }
}

module.exports = new OpenRouterModerationService();
