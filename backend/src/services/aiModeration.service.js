const axios = require("axios");
const Product = require("../models/Product");
require("dotenv").config();


const EMERGENCY_MODE = false; 
const ENABLE_SPECIALIZED_AI = true; 
const AI_PROVIDERS_CONFIG = {
  bannedProductChecker: "google", 
  vietnameseQualityChecker: "google", 
  imageConsistencyChecker: "google", 
  maxRetries: 3,
  timeoutMs: 30000,
};


const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;

const MODERATION_CONFIG = {

  TEXT_APPROVAL_THRESHOLD: 0.8, 
  FINAL_CONFIDENCE_THRESHOLD: 0.75, 
  IMAGE_TEXT_MATCH_THRESHOLD: 0.6, 
  INDIVIDUAL_SCORE_THRESHOLD: 0.8, 
  IMAGE_CONSISTENCY_THRESHOLD: 0.7, 
  VIETNAMESE_LANGUAGE_THRESHOLD: 0.7, 
  LEGAL_COMPLIANCE_THRESHOLD: 0.0, 


  STRICT_MODE: true,


  getThresholds() {
    if (this.STRICT_MODE) {
      return {
        textApproval: 0.85, 
        finalConfidence: 0.8, 
        imageTextMatch: 0.65, // Tăng lên 0.65
        individualScore: 0.8,
        imageConsistency: 0.75, // Tăng lên 0.75
        vietnameseLanguage: 0.75, // 🆕 Yêu cầu tiếng Việt chuẩn
        legalCompliance: 0.0, // 🆕 Zero tolerance
      };
    }
    return {
      textApproval: this.TEXT_APPROVAL_THRESHOLD,
      finalConfidence: this.FINAL_CONFIDENCE_THRESHOLD,
      imageTextMatch: this.IMAGE_TEXT_MATCH_THRESHOLD,
      individualScore: this.INDIVIDUAL_SCORE_THRESHOLD,
      imageConsistency: this.IMAGE_CONSISTENCY_THRESHOLD,
      vietnameseLanguage: this.VIETNAMESE_LANGUAGE_THRESHOLD,
      legalCompliance: this.LEGAL_COMPLIANCE_THRESHOLD,
    };
  },
};

const BANNED_PRODUCTS_VIETNAM = {
  drugs: [
    "ma túy",
    "cocaine",
    "heroin",
    "methamphetamine",
    "ecstasy",
    "lsd",
    "mdma",
    "cannabis",
    "cần sa",
    "cỏ",
    "weed",
    "marijuana",
    "thuốc lắc",
    "thuốc phiện",
    "opium",
    "morphine",
    "fentanyl",
    "ketamine",
    "thuốc k",
    "ice",
    "đá",
    "chất kích thích",
    "chất gây nghiện",
    "chất tâm thần",
    "psychoactive",
    "thuốc lá điện tử có nicotine",
    "shisha",
    "thuốc lào",
    "buprenorphine",
    "tramadol không đơn",
    "codeine",
    "oxy",
    "xanax không đơn",
    "rivotril",
  ],

  weapons: [
    "súng",
    "pistol",
    "rifle",
    "ak47",
    "m16",
    "sniper",
    "đạn",
    "bullet",
    "lựu đạn",
    "grenade",
    "bomb",
    "bom",
    "tnt",
    "c4",
    "chất nổ",
    "explosives",
    "dao găm",
    "kiếm",
    "katana",
    "samurai",
    "nunchaku",
    "côn nhị khúc",
    "súng hơi có sát thương",
    "súng bắn bi sắt",
    "pháo",
    "rocket",
    "bazooka",
    "vũ khí",
    "weapons",
    "ammunition",
    "thuốc nổ",
    "dynamite",
    "mines",
    "dao lưỡi kép",
    "dao lò xo",
    "dao bươm bướm",
    "brass knuckles",
    "bạn đấm",
    "khuyển",
    "dùi cui điện",
    "súng điện",
    "taser",
    "pepper spray quân sự",
  ],

  wildlife: [
    "sừng tê giác",
    "ngà voi",
    "ivory",
    "rhinoceros horn",
    "tiger bone",
    "xương hổ",
    "da hổ",
    "tiger skin",
    "turtle shell",
    "mai rùa",
    "chim quý hiếm",
    "rare birds",
    "endangered species",
    "động vật hoang dã",
    "tê tê",
    "pangolin",
    "voọc",
    "langur",
    "gấu trúc",
    "panda",
    "hổ",
    "tiger",
    "báo",
    "leopard",
    "voi",
    "elephant",
    "tê giác",
    "rhinoceros",
    "cá mập",
    "shark fin",
    "vi cá heo",
    "whale",
    "chồn hương",
    "civet",
    "rùa biển",
    "sea turtle",
    "đười ại",
    "orangutan",
    "khỉ",
    "monkey",
    "ape",
    "thú hoang dã",
    "wild animals",
    "chó sói",
    "wolf",
  ],
  medicines: [
    "thuốc không rõ nguồn gốc",
    "fake medicine",
    "thuốc giả",
    "counterfeit drugs",
    "steroid",
    "hormone tăng trưởng",
    "hgh",
    "testosterone",
    "insulin không đơn",
    "thuốc giảm cân không phép",
    "sibutramine",
    "fenfluramine",
    "orlistat fake",
    "thuốc tăng cơ",
    "anabolic",
    "viagra giả",
    "cialis giả",
    "kamagra",
    "thuốc kích dục",
    "aphrodisiac",
    "spanish fly",
    "thuốc phá thai",
    "abortion pills",
    "mifepristone",
    "misoprostol",
    "thuốc ngủ mạnh",
    "sleeping pills",
    "rohypnol",
    "thuốc mê",
    "anesthetic",
    "chloroform",
    "ether",
    "thuốc độc",
    "poison",
    "thuốc trừ sâu dạng viên",
    "cyanide",
    "strychnine",
    "warfarin",
  ],

  fake_documents: [
    "tiền giả",
    "fake money",
    "counterfeit currency",
    "đô la giả",
    "fake usd",
    "hộ chiếu giả",
    "fake passport",
    "giấy tờ giả",
    "fake documents",
    "visa giả",
    "chứng minh thư giả",
    "fake id",
    "căn cước giả",
    "fake citizen id",
    "bằng lái xe giả",
    "fake license",
    "bằng cấp giả",
    "fake degree",
    "fake diploma",
    "giấy phép kinh doanh giả",
    "fake business license",
    "sim rác",
    "spam sim",
    "sim fake",
    "sim ảo",
    "thẻ tín dụng giả",
    "fake credit card",
    "thẻ ATM giả",
    "chữ ký giả",
    "fake signature",
    "con dấu giả",
    "fake stamp",
    "fake seal",
  ],

  adult_content: [
    "đồ chơi tình dục",
    "sex toy",
    "adult toy",
    "dildo",
    "vibrator",
    "masturbator",
    "búp bê tình dục",
    "sex doll",
    "condom có gai",
    "bao cao su đặc biệt",
    "thuốc kích dục",
    "thuốc cường dương không rõ nguồn gốc",
    "spanish fly",
    "porn",
    "khiêu dâm",
    "phim sex",
    "adult video",
    "nude photo",
    "ảnh khỏa thân",
    "magazine khiêu dâm",
    "adult magazine",
    "webcam sex",
    "livestream khiêu dâm",
    "escort service",
    "massage kích dục",
    "happy ending",
    "call girl",
  ],

  dangerous_chemicals: [
    "axit cường độ cao",
    "acid",
    "axit sulfuric",
    "sulfuric acid",
    "axit nitric",
    "thuốc trừ sâu",
    "pesticide",
    "paraquat",
    "glyphosate",
    "ddt",
    "chlordane",
    "thuốc diệt chuột",
    "rat poison",
    "warfarin",
    "brodifacoum",
    "strychnine",
    "hóa chất độc",
    "toxic chemical",
    "cyanide",
    "potassium cyanide",
    "arsenic",
    "chất phóng xạ",
    "radioactive",
    "uranium",
    "plutonium",
    "cesium",
    "cobalt-60",
    "mercury",
    "thủy ngân",
    "chì",
    "lead paint",
    "asbestos",
    "amiăng",
    "formaldehyde",
    "methanol",
    "ethylene glycol",
    "benzene",
    "toluene",
    "carbon monoxide",
    "hydrogen sulfide",
    "ammonia",
    "chlorine gas",
  ],

  counterfeit_brands: [
    "hàng giả",
    "fake",
    "rep",
    "super fake",
    "siêu cấp",
    "1:1",
    "aaa",
    "replica",
    "copy",
    "imitation",
    "nhái",
    "hàng nhái",
    "hàng dựng",
    "chanel giả",
    "gucci giả",
    "lv giả",
    "louis vuitton giả",
    "hermes giả",
    "rolex giả",
    "iphone giả",
    "samsung giả",
    "nike giả",
    "adidas giả",
    "supreme giả",
    "off white giả",
    "balenciaga giả",
    "dior giả",
  ],

  gambling: [
    "máy đánh bạc",
    "slot machine",
    "poker machine",
    "cờ bạc",
    "gambling",
    "casino chips",
    "bài poker",
    "poker cards đánh bạc",
    "xí ngầu",
    "dice gambling",
    "roulette",
    "blackjack",
    "baccarat",
    "tài xỉu",
    "sicbo",
    "xổ số lô đề",
    "lottery illegal",
    "vé số giả",
    "cá độ",
    "betting",
    "cược online",
    "game bài đổi thưởng",
    "rikvip",
    "b52",
    "sunwin",
    "hitclub",
  ],

  // 🔌 THIẾT BỊ BẤT HỢP PHÁP VÀ NGUY HIỂM
  illegal_devices: [
    "thiết bị nghe lén",
    "spy device",
    "bug",
    "hidden camera",
    "camera quay lén",
    "gps tracker bất hợp pháp",
    "thiết bị can thiệp tín hiệu",
    "signal jammer",
    "phone jammer",
    "wifi jammer",
    "thiết bị hack",
    "hacking device",
    "skimmer",
    "atm skimmer",
    "credit card reader",
    "thiết bị sao chép thẻ",
    "rfid cloner",
    "lockpick",
    "thiết bị phá khóa",
    "bump key",
    "master key",
    "universal key",
    "thiết bị mở khóa ô tô",
    "car key programmer",
    "obd hacker",
  ],

  // 🏥 DỊCH VỤ Y TẾ BẤT HỢP PHÁP
  illegal_medical: [
    "phẫu thuật thẩm mỹ không phép",
    "illegal surgery",
    "botox không rõ nguồn gốc",
    "filler giá rẻ",
    "cheap filler",
    "tiêm trắng da không phép",
    "glutathione injection",
    "phá thai tại nhà",
    "home abortion",
    "thai bằng thuốc",
    "abortion medicine",
    "xét nghiệm dna không phép",
    "dna test kit",
    "test covid giả",
    "fake covid test",
    "khám bệnh online không phép",
    "tư vấn y tế không phép",
    "chẩn đoán bệnh online",
  ],

  // 🍷 RƯỢU VÀ THUỐC LÁ BẤT HỢP PHÁP
  alcohol_tobacco: [
    "rượu không nhãn mác",
    "unlabeled alcohol",
    "rượu thủ công độc hại",
    "methanol alcohol",
    "rượu trên 40 độ",
    "high proof alcohol",
    "thuốc lá lậu",
    "smuggled cigarettes",
    "thuốc lá điện tử có chất gây nghiện",
    "nicotine vape",
    "pod có nicotine",
    "shisha thuốc lá",
    "tobacco shisha",
    "thuốc lào",
    "traditional tobacco",
    "cigar cuba",
    "cuban cigars",
    "chewing tobacco",
    "thuốc lá nhai",
  ],
};

// 🔍 KIỂM TRA SẢN PHẨM BỊ CẤM
function detectBannedProduct(text) {
  const normalizedText = text
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
    .replace(/[èéẹẻẽêềếệểễ]/g, "e")
    .replace(/[ìíịỉĩ]/g, "i")
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
    .replace(/[ùúụủũưừứựửữ]/g, "u")
    .replace(/[ỳýỵỷỹ]/g, "y")
    .replace(/đ/g, "d");

  const foundBanned = [];

  Object.entries(BANNED_PRODUCTS_VIETNAM).forEach(([category, items]) => {
    items.forEach((bannedItem) => {
      const normalizedBanned = bannedItem
        .toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
        .replace(/[èéẹẻẽêềếệểễ]/g, "e")
        .replace(/[ìíịỉĩ]/g, "i")
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
        .replace(/[ùúụủũưừứựửữ]/g, "u")
        .replace(/[ỳýỵỷỹ]/g, "y")
        .replace(/đ/g, "d");

      // 🔧 FIX: Sử dụng word boundary matching thay vì simple substring
      // Tạo regex với word boundaries để tránh false positive
      try {
        // Escape special regex characters trong banned keyword
        const escapedBanned = normalizedBanned.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        // Tạo regex với word boundary (\b) - chỉ match whole words
        // Sử dụng \s để handle cả space và các ký tự đặc biệt
        const wordBoundaryRegex = new RegExp(
          `(^|\\s|[^\\w])${escapedBanned}($|\\s|[^\\w])`,
          "i"
        );

        if (wordBoundaryRegex.test(normalizedText)) {
          foundBanned.push({
            category: category,
            keyword: bannedItem,
            severity:
              category === "drugs" || category === "weapons"
                ? "CRITICAL"
                : "HIGH",
          });
        }
      } catch (regexError) {
        // Fallback to simple includes for complex keywords
        console.warn(
          `⚠️ Regex failed for keyword "${bannedItem}", using fallback:`,
          regexError.message
        );
        if (normalizedText.includes(normalizedBanned)) {
          foundBanned.push({
            category: category,
            keyword: bannedItem,
            severity:
              category === "drugs" || category === "weapons"
                ? "CRITICAL"
                : "HIGH",
          });
        }
      }
    });
  });

  return foundBanned;
}

// 🔢 VALIDATION TRỌNG LƯỢNG SẢN PHẨM
function validateProductWeight(weightData) {
  if (!weightData) {
    return {
      valid: false,
      reasons: ["Thiếu thông tin trọng lượng sản phẩm (gram)"],
      score: 0.5,
    };
  }

  const weight = parseFloat(weightData);
  const reasons = [];
  let score = 1.0;

  // Kiểm tra định dạng
  if (isNaN(weight) || weight <= 0) {
    reasons.push("Trọng lượng phải là số dương (đơn vị: gram)");
    score = 0.2;
  }

  // Kiểm tra giới hạn hợp lý
  else if (weight < 1) {
    reasons.push("Trọng lượng quá nhỏ (< 1 gram) - có thể không chính xác");
    score = 0.4;
  } else if (weight > 50000) {
    // 50kg
    reasons.push("Trọng lượng quá lớn (> 50kg) - vui lòng kiểm tra lại");
    score = 0.6;
  }

  // Cảnh báo cho các trọng lượng bất thường
  else if (weight > 10000) {
    // 10kg
    reasons.push(
      "Cảnh báo: Sản phẩm có trọng lượng lớn (> 10kg) - cần xác nhận"
    );
    score = 0.8;
  }

  return {
    valid: score >= 0.7,
    reasons: reasons,
    score: score,
    weightInGrams: weight,
  };
}

// 🤖 AI WEIGHT ESTIMATION - Ước tính trọng lượng thông minh (ALWAYS IN GRAMS)
function estimateProductWeight(productName, productDescription = "") {
  const fullText = `${productName} ${productDescription}`.toLowerCase();

  // 📊 Database trọng lượng theo loại sản phẩm (ALL VALUES IN GRAMS) - ENHANCED ACCURACY
  const weightDatabase = {
    // Quần áo - Revised for better accuracy
    clothing: {
      patterns: [
        "áo",
        "quần",
        "váy",
        "đầm",
        "jacket",
        "shirt",
        "dress",
        "pants",
        "skirt",
        "áo thun",
        "áo sơ mi",
        "quần jean",
        "váy hồng",
        "bikini",
        "đồ bơi",
        "đồ tắm",
      ],
      ranges: {
        "áo phông|áo thun|t-shirt|tank top": {
          min: 120,
          max: 250,
          typical: 180,
        },
        "áo sơ mi|shirt|blouse": { min: 150, max: 350, typical: 220 },
        "váy|dress|đầm": { min: 180, max: 500, typical: 300 },
        "quần jean|jeans|quần dài": { min: 350, max: 700, typical: 500 },
        "quần short|shorts": { min: 100, max: 280, typical: 180 },
        "áo khoác|jacket|blazer": { min: 250, max: 700, typical: 450 },
        "áo len|sweater|cardigan": { min: 200, max: 500, typical: 320 },
        "quần legging|leggings": { min: 80, max: 180, typical: 120 },
        "bikini|đồ tắm": { min: 50, max: 150, typical: 80 },
      },
    },

    // Giày dép - More precise weights
    footwear: {
      patterns: ["giày", "dép", "boots", "shoes", "sandals", "sneakers"],
      ranges: {
        "dép|sandals|flip-flop": { min: 80, max: 250, typical: 150 },
        "giày thể thao|sneakers|running shoes": {
          min: 280,
          max: 450,
          typical: 350,
        },
        "giày cao gót|high heels": { min: 180, max: 400, typical: 280 },
        "boots|giày bốt": { min: 350, max: 800, typical: 550 },
        "giày tây|dress shoes": { min: 250, max: 500, typical: 380 },
        "giày búp bê|flats": { min: 120, max: 300, typical: 200 },
      },
    },

    // Túi xách - More realistic ranges
    bags: {
      patterns: ["túi", "balo", "bag", "backpack", "handbag", "purse", "ví"],
      ranges: {
        "ví|wallet|purse nhỏ": { min: 30, max: 150, typical: 80 },
        "túi xách tay|handbag": { min: 150, max: 500, typical: 280 },
        "balo|backpack": { min: 250, max: 1000, typical: 600 },
        "túi xách lớn|tote bag": { min: 120, max: 400, typical: 220 },
        "túi du lịch|travel bag": { min: 500, max: 1500, typical: 900 },
        "túi nhỏ|clutch": { min: 50, max: 200, typical: 100 },
      },
    },

    // Điện tử - More accurate weights
    electronics: {
      patterns: [
        "điện thoại",
        "laptop",
        "tablet",
        "phone",
        "computer",
        "headphone",
        "tai nghe",
        "iphone",
        "samsung",
        "oppo",
        "xiaomi",
      ],
      ranges: {
        "điện thoại|smartphone|phone|iphone|samsung|oppo|xiaomi": {
          min: 140,
          max: 220,
          typical: 180,
        },
        "tai nghe|headphone|earphone": { min: 10, max: 120, typical: 50 },
        "tai nghe bluetooth|airpods|earbuds": { min: 5, max: 30, typical: 15 },
        "tai nghe over-ear|gaming headset": {
          min: 200,
          max: 400,
          typical: 300,
        },
        "laptop|máy tính xách tay": { min: 1000, max: 2500, typical: 1300 },
        "tablet|máy tính bảng|ipad": { min: 280, max: 650, typical: 450 },
        "đồng hồ thông minh|smartwatch|apple watch": {
          min: 25,
          max: 80,
          typical: 45,
        },
        "ốp lưng|case|bao da": { min: 15, max: 100, typical: 40 },
        "sạc|charger|cáp": { min: 15, max: 100, typical: 40 },
      },
    },

    // Sách - More detailed categories
    books: {
      patterns: ["sách", "book", "novel", "giáo trình", "tạp chí", "truyện"],
      ranges: {
        "sách nhỏ|pocket book|sách bỏ túi": { min: 80, max: 180, typical: 120 },
        "sách trung bình|novel|tiểu thuyết": {
          min: 150,
          max: 350,
          typical: 250,
        },
        "sách giáo khoa|textbook|giáo trình": {
          min: 250,
          max: 700,
          typical: 450,
        },
        "sách lớn|hardcover|bìa cứng": { min: 350, max: 900, typical: 550 },
        "tạp chí|magazine": { min: 50, max: 150, typical: 80 },
        "truyện tranh|comic|manga": { min: 100, max: 250, typical: 150 },
      },
    },

    // Mỹ phẩm - More comprehensive
    cosmetics: {
      patterns: [
        "son",
        "kem",
        "nước hoa",
        "makeup",
        "cosmetic",
        "perfume",
        "lipstick",
        "phấn",
        "mascara",
        "nail",
      ],
      ranges: {
        "son môi|lipstick": { min: 8, max: 40, typical: 20 },
        "kem dưỡng|cream|lotion": { min: 25, max: 120, typical: 60 },
        "nước hoa|perfume": { min: 40, max: 180, typical: 90 },
        "phấn|powder|foundation": { min: 15, max: 80, typical: 45 },
        "mascara|kẻ mắt": { min: 10, max: 35, typical: 20 },
        "sơn móng|nail polish": { min: 12, max: 40, typical: 25 },
        "set makeup|bộ mỹ phẩm": { min: 100, max: 500, typical: 250 },
      },
    },

    // Đồ gia dụng - More realistic
    household: {
      patterns: [
        "bình",
        "chén",
        "tô",
        "nồi",
        "chảo",
        "cup",
        "bowl",
        "pot",
        "ly",
        "đũa",
      ],
      ranges: {
        "cốc|cup|ly": { min: 80, max: 250, typical: 150 },
        "chén|bowl|tô": { min: 120, max: 350, typical: 200 },
        "bình nước|water bottle": { min: 80, max: 300, typical: 180 },
        "nồi nhỏ|small pot": { min: 250, max: 600, typical: 400 },
        "nồi lớn|large pot": { min: 600, max: 1500, typical: 900 },
        "đũa|chopsticks": { min: 20, max: 80, typical: 40 },
        "dao|knife": { min: 50, max: 200, typical: 120 },
      },
    },

    // Trang sức - More detailed
    jewelry: {
      patterns: [
        "nhẫn",
        "dây chuyền",
        "vòng tay",
        "đồng hồ",
        "jewelry",
        "ring",
        "necklace",
        "bông tai",
      ],
      ranges: {
        "nhẫn|ring": { min: 3, max: 30, typical: 12 },
        "dây chuyền|necklace": { min: 8, max: 80, typical: 25 },
        "vòng tay|bracelet": { min: 5, max: 60, typical: 20 },
        "đồng hồ|watch": { min: 40, max: 250, typical: 120 },
        "bông tai|earrings": { min: 2, max: 25, typical: 8 },
        "lắc tay|charm bracelet": { min: 10, max: 100, typical: 35 },
      },
    },

    // Đồ chơi - More specific
    toys: {
      patterns: [
        "đồ chơi",
        "toy",
        "gấu bông",
        "lego",
        "búp bê",
        "mô hình",
        "figure",
      ],
      ranges: {
        "đồ chơi nhỏ|small toy|mô hình nhỏ": { min: 30, max: 150, typical: 80 },
        "gấu bông|teddy bear|thú bông": { min: 150, max: 600, typical: 300 },
        "lego|building blocks": { min: 80, max: 800, typical: 250 },
        "búp bê|doll": { min: 100, max: 500, typical: 250 },
        "mô hình|figure|action figure": { min: 50, max: 300, typical: 120 },
        "xe đồ chơi|toy car": { min: 40, max: 200, typical: 100 },
      },
    },

    // Thể thao - More comprehensive
    sports: {
      patterns: [
        "bóng",
        "vợt",
        "giày thể thao",
        "đồ thể thao",
        "sports",
        "yoga",
        "gym",
      ],
      ranges: {
        "bóng|ball": { min: 150, max: 500, typical: 300 },
        "vợt|racket": { min: 150, max: 350, typical: 250 },
        "giày thể thao|sports shoes": { min: 280, max: 500, typical: 380 },
        "thảm yoga|yoga mat": { min: 800, max: 1500, typical: 1200 },
        "tạ|weights|dumbbell": { min: 500, max: 5000, typical: 2000 },
        "áo thể thao|sports wear": { min: 100, max: 250, typical: 150 },
      },
    },

    // 🆕 Thêm categories mới
    accessories: {
      patterns: [
        "kính",
        "mũ",
        "khăn",
        "dây lưng",
        "glasses",
        "hat",
        "scarf",
        "belt",
      ],
      ranges: {
        "kính|glasses|sunglasses": { min: 25, max: 120, typical: 60 },
        "mũ|hat|cap": { min: 50, max: 200, typical: 100 },
        "khăn|scarf": { min: 40, max: 180, typical: 80 },
        "dây lưng|belt": { min: 80, max: 300, typical: 150 },
        "găng tay|gloves": { min: 30, max: 150, typical: 80 },
      },
    },

    stationery: {
      patterns: [
        "bút",
        "sổ",
        "giấy",
        "pen",
        "notebook",
        "paper",
        "văn phòng phẩm",
      ],
      ranges: {
        "bút|pen|pencil": { min: 5, max: 50, typical: 20 },
        "sổ|notebook": { min: 50, max: 300, typical: 150 },
        "giấy|paper": { min: 20, max: 100, typical: 50 },
        "bộ văn phòng phẩm|stationery set": {
          min: 100,
          max: 500,
          typical: 250,
        },
      },
    },
  };

  // 🔍 Tìm loại sản phẩm phù hợp
  let bestMatch = null;
  let highestConfidence = 0;

  for (const [category, data] of Object.entries(weightDatabase)) {
    // Kiểm tra pattern match cho category
    const categoryMatch = data.patterns.some((pattern) =>
      fullText.includes(pattern)
    );

    if (categoryMatch) {
      // Tìm range cụ thể nhất
      for (const [rangePattern, weightRange] of Object.entries(data.ranges)) {
        const patterns = rangePattern.split("|");
        const matchCount = patterns.filter((pattern) =>
          fullText.includes(pattern)
        ).length;
        const confidence = matchCount / patterns.length;

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = {
            category,
            range: weightRange,
            pattern: rangePattern,
            confidence,
          };
        }
      }
    }
  }

  // 📏 Size modifiers
  const sizeModifiers = {
    "xs|extra small": 0.7,
    "s|small|nhỏ": 0.8,
    "m|medium|vừa": 1.0,
    "l|large|lớn": 1.2,
    "xl|extra large": 1.4,
    "xxl|extra extra large": 1.6,
  };

  let sizeMultiplier = 1.0;
  for (const [sizePattern, multiplier] of Object.entries(sizeModifiers)) {
    if (new RegExp(`\\b(${sizePattern})\\b`, "i").test(fullText)) {
      sizeMultiplier = multiplier;
      break;
    }
  }

  // 🎯 Tính toán trọng lượng ước tính (ALWAYS IN GRAMS) - ENHANCED ACCURACY
  if (bestMatch) {
    const baseWeight = bestMatch.range.typical;
    const estimatedWeight = Math.round(baseWeight * sizeMultiplier);

    // ✅ ENSURE MINIMUM REASONABLE WEIGHT - Improved minimums
    const categoryMinimums = {
      jewelry: 2, // Trang sức có thể rất nhẹ
      cosmetics: 8, // Mỹ phẩm nhỏ
      stationery: 5, // Văn phòng phẩm nhỏ
      electronics: 10, // Điện tử nhỏ nhất
      default: 15, // Mặc định cho các sản phẩm khác
    };

    const minWeight =
      categoryMinimums[bestMatch.category] || categoryMinimums.default;
    const finalWeight = Math.max(estimatedWeight, minWeight);

    return {
      estimatedWeight: finalWeight, // ALWAYS IN GRAMS
      confidence: bestMatch.confidence,
      reasoning: `${bestMatch.category} - ${bestMatch.pattern}`,
      range: {
        min: Math.max(
          Math.round(bestMatch.range.min * sizeMultiplier),
          minWeight
        ),
        max: Math.round(bestMatch.range.max * sizeMultiplier),
      },
      sizeAdjustment:
        sizeMultiplier !== 1.0 ? `Size adjustment: ${sizeMultiplier}x` : null,
      unit: "grams", // ✅ EXPLICIT UNIT
      category: bestMatch.category,
    };
  }

  // 🔄 Fallback: Ước tính cơ bản dựa trên text length và keywords (IN GRAMS) - IMPROVED
  const textLength = fullText.length;
  let fallbackWeight = 150; // Reduced from 300g to 150g for better accuracy

  // 🔧 Enhanced Material-based adjustments (more realistic)
  if (fullText.match(/(kim loại|metal|inox|steel|sắt|nhôm|aluminum)/)) {
    fallbackWeight *= 1.8; // Reduced from 2.0 to 1.8
  } else if (fullText.match(/(nhựa|plastic|resin)/)) {
    fallbackWeight *= 0.7; // Slightly increased from 0.6
  } else if (fullText.match(/(vải|fabric|cotton|len|wool|polyester|silk)/)) {
    fallbackWeight *= 0.6; // Reduced from 0.8 (cloth is lighter)
  } else if (fullText.match(/(da|leather|genuine)/)) {
    fallbackWeight *= 1.1; // Reduced from 1.2
  } else if (fullText.match(/(giấy|paper|cardboard)/)) {
    fallbackWeight *= 0.3; // Reduced from 0.4
  } else if (fullText.match(/(thủy tinh|glass|ceramic|sứ)/)) {
    fallbackWeight *= 1.4; // New: glass/ceramic products
  }

  // 🎯 Category-based fallback adjustments
  if (fullText.match(/(son|lipstick|mascara|phấn)/)) {
    fallbackWeight = 25; // Mỹ phẩm nhỏ
  } else if (fullText.match(/(nhẫn|ring|bông tai|earring)/)) {
    fallbackWeight = 15; // Trang sức nhỏ
  } else if (fullText.match(/(bút|pen|pencil)/)) {
    fallbackWeight = 20; // Bút viết
  } else if (fullText.match(/(điện thoại|smartphone|phone)/)) {
    fallbackWeight = 180; // Điện thoại
  } else if (fullText.match(/(áo|shirt|t-shirt)/)) {
    fallbackWeight = 180; // Áo
  } else if (fullText.match(/(giày|shoes|sneaker)/)) {
    fallbackWeight = 350; // Giày
  } else if (fullText.match(/(sách|book|novel)/)) {
    fallbackWeight = 250; // Sách
  }

  // 📏 Text length influence (more conservative)
  if (textLength > 150) {
    fallbackWeight *= 1.15; // Reduced from 1.1
  } else if (textLength > 100) {
    fallbackWeight *= 1.05; // Fine adjustment
  } else if (textLength < 30) {
    fallbackWeight *= 0.85; // Reduced from 0.8
  } else if (textLength < 15) {
    fallbackWeight *= 0.7; // Very short descriptions
  }

  // ✅ ENSURE MINIMUM REASONABLE WEIGHT - Much improved
  const finalFallbackWeight = Math.max(Math.round(fallbackWeight), 20); // Increased from 10g to 20g

  return {
    estimatedWeight: finalFallbackWeight, // ALWAYS IN GRAMS
    confidence: 0.25, // Reduced from 0.3 to reflect uncertainty
    reasoning:
      "Fallback estimation based on text analysis and material detection",
    range: {
      min: Math.max(Math.round(finalFallbackWeight * 0.6), 15), // Improved range
      max: Math.round(finalFallbackWeight * 1.8), // More conservative max
    },
    sizeAdjustment: null,
    unit: "grams", // ✅ EXPLICIT UNIT
    category: "unknown",
  };
}

// 🖼️ KIỂM TRA SỰ NHẤT QUÁN GIỮA CÁC HÌNH ẢNH (Updated - No Category Logic)
function checkImageConsistency(imageAnalyses) {
  if (imageAnalyses.length <= 1) {
    return {
      score: 1.0,
      consistent: true,
      reasons: ["Chỉ có 1 hình ảnh hoặc ít hơn - không cần kiểm tra nhất quán"],
    };
  }

  const validAnalyses = imageAnalyses.filter(
    (img) =>
      img.caption &&
      img.caption !== "unknown" &&
      img.caption !== "no_api" &&
      img.caption !== "analysis_failed" &&
      img.caption.length > 5
  );

  if (validAnalyses.length <= 1) {
    return {
      score: 0.3,
      consistent: false,
      reasons: ["Không đủ hình ảnh hợp lệ để kiểm tra nhất quán"],
    };
  }

  // ❌ REMOVED: Category consistency checking per user request
  // Focus only on semantic similarity between captions

  // Kiểm tra semantic similarity giữa các captions
  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < validAnalyses.length; i++) {
    for (let j = i + 1; j < validAnalyses.length; j++) {
      const caption1 = validAnalyses[i].caption.toLowerCase();
      const caption2 = validAnalyses[j].caption.toLowerCase();

      const words1 = new Set(
        caption1.split(/[\s\-_.,!?]+/).filter((w) => w.length > 2)
      );
      const words2 = new Set(
        caption2.split(/[\s\-_.,!?]+/).filter((w) => w.length > 2)
      );

      const similarity = calculateJaccardSimilarity(words1, words2);
      totalSimilarity += similarity;
      comparisons++;
    }
  }

  const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;

  // Score dựa trên độ tương đồng trung bình
  let score = avgSimilarity;
  let consistent = score >= 0.4; // Ngưỡng tương đồng

  const reasons = [];
  if (!consistent) {
    reasons.push(
      `Các hình ảnh không nhất quán với nhau (độ tương đồng: ${(
        score * 100
      ).toFixed(1)}%)`
    );
    reasons.push("Tất cả hình ảnh phải mô tả cùng 1 sản phẩm");

    // Thêm chi tiết về captions
    if (validAnalyses.length <= 3) {
      reasons.push(
        `Mô tả hình ảnh: "${validAnalyses
          .map((img) => img.caption.slice(0, 30))
          .join('", "')}"`
      );
    }
  }

  return {
    score: score,
    consistent: consistent,
    reasons: reasons,
    avgSimilarity: avgSimilarity,
    // ❌ REMOVED: categories field (no longer using category logic)
  };
}

function validateAPIKeys() {
  const validKeys = {
    google: !!GOOGLE_AI_KEY && GOOGLE_AI_KEY.length > 10,
    // ❌ GROQ removed - Google handles everything now
  };

  console.log(
    "🔑 Google-Only AI Provider Status:",
    `Google (Unified Analysis): ${validKeys.google ? "✅" : "❌"}`
  );
  return validKeys;
}

// ⭐ QUEUE SYSTEM FOR MODERATION
const moderationQueue = [];
let isProcessingQueue = false;

// ⭐ ENHANCED RETRY CONFIGURATION (More aggressive with 503 handling)
const RETRY_CONFIG = {
  maxRetries: 5, // Tăng từ 3 → 5 cho 503 errors
  retryDelay: 3000, // Tăng từ 2000 → 3000ms
  backoffMultiplier: 2.5, // Tăng từ 2 → 2.5
  serviceUnavailableRetries: 8, // 🆕 Đặc biệt cho 503 errors
  serviceUnavailableDelay: 10000, // 🆕 10s delay cho 503
};

// ⭐ STRICTER RATE LIMITING với circuit breaker
const rateLimiter = {
  requests: new Map(),
  maxRequestsPerMinute: 8, // Giảm từ 15 → 8 để tránh overload
  circuitBreaker: {
    failureCount: 0,
    lastFailureTime: null,
    threshold: 5, // 5 failures liên tiếp → circuit open
    cooldownPeriod: 300000, // 5 minutes cooldown
    isOpen: false,
  },

  canMakeRequest(service) {
    // Kiểm tra circuit breaker
    if (this.circuitBreaker.isOpen) {
      const timeSinceLastFailure =
        Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure < this.circuitBreaker.cooldownPeriod) {
        console.warn(
          `⚠️ Circuit breaker OPEN for ${service}. Cooldown remaining: ${Math.ceil(
            (this.circuitBreaker.cooldownPeriod - timeSinceLastFailure) / 1000
          )}s`
        );
        return false;
      } else {
        // Reset circuit breaker sau cooldown
        this.resetCircuitBreaker();
        console.log(`✅ Circuit breaker RESET for ${service}`);
      }
    }

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

  recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      console.warn(
        `🚨 Circuit breaker OPENED after ${this.circuitBreaker.failureCount} failures`
      );
    }
  },

  recordSuccess() {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.isOpen = false;
  },

  resetCircuitBreaker() {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.lastFailureTime = null;
  },
};

// ⭐ HELPER FUNCTIONS FOR TEXT QUALITY ASSESSMENT

// Detect garbled text patterns
function detectGarbledText(text) {
  const garbledPatterns = [
    // Random character combinations
    /[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]{2,}[dfgh]{2,}[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]{1,}/g, // like "hồdf", "dándf"
    /[a-zA-Z]{1,}[dfgh]{1,}[gf]{1,}[a-zA-Z]{0,}/g, // like "dfg fg"
    /\b[a-zA-Z]*[dfgh]{2,}[a-zA-Z]*\b/g, // words with repeated df/gh combinations
    /\b[a-zA-Z]+[fd][gd][a-zA-Z]*\b/g, // patterns like "giaofd", "gd"
    /[a-zA-Z]{1,}[fd][a-zA-Z]{0,2}[gd][a-zA-Z]{0,2}/g, // mixed fd/gd patterns
    /\b\w*[dfg]{3,}\w*\b/g, // 3+ consecutive d/f/g letters
  ];

  const found = [];
  garbledPatterns.forEach((pattern, index) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      found.push({ pattern: index, matches: matches.slice(0, 3) }); // limit to 3 examples
    }
  });

  return found;
}

// Detect typos and spelling errors
function detectTyposAndErrors(text) {
  const words = text
    .toLowerCase()
    .split(/[\s\-_.,!?()]+/)
    .filter((word) => word.length > 2);
  let typoCount = 0;

  // Common Vietnamese typo patterns
  const typoPatterns = [
    /^[a-z]*[dfg]{2,}[a-z]*$/, // excessive dfg
    /^[a-z]*[qx]{2,}[a-z]*$/, // excessive qx (not common in Vietnamese)
    /^[a-z]*[zj]{1,}[a-z]*$/, // z/j rarely used in Vietnamese
    /^.{1,2}$/, // single/double char words that aren't meaningful
    /^\w*[aeiou]{4,}\w*$/, // excessive vowels
    /^\w*[bcdfghjklmnpqrstvwxyz]{5,}\w*$/, // excessive consonants
  ];

  // Common garbled word indicators
  const garbledIndicators = ["dfg", "gfd", "fdg", "gdf", "fgd", "dgf"];

  words.forEach((word) => {
    // Check for typo patterns
    if (typoPatterns.some((pattern) => pattern.test(word))) {
      typoCount++;
    }

    // Check for garbled indicators
    if (garbledIndicators.some((indicator) => word.includes(indicator))) {
      typoCount++;
    }

    // Check for random character repetition
    if (/(.)\1{3,}/.test(word)) {
      // 4+ repeated characters
      typoCount++;
    }
  });

  return typoCount;
}

// 🇻🇳 ĐÁNH GIÁ TÍNH CHUẨN XÁC CỦA TIẾNG VIỆT (Very Strict)
function assessVietnameseCoherence(text) {
  const words = text
    .toLowerCase()
    .split(/[\s\-_.,!?()]+/)
    .filter((word) => word.length > 1);

  if (words.length === 0) return 0;

  // 🔥 TỪVỰNG TIẾNG VIỆT CHUẨN (Mở rộng)
  const standardVietnameseWords = [
    // Quần áo & thời trang
    "váy",
    "áo",
    "quần",
    "giày",
    "dép",
    "tất",
    "vớ",
    "nón",
    "mũ",
    "túi",
    "ví",
    "đầm",
    "vest",
    "blazer",
    "khoác",
    "cardigan",
    "hoodie",
    "polo",
    "len",
    "denim",
    "jeans",
    "shorts",
    "chân",
    "váy",
    "bikini",
    "đồ",
    "lót",
    "yếm",

    // Màu sắc
    "màu",
    "đỏ",
    "xanh",
    "hồng",
    "vàng",
    "trắng",
    "đen",
    "nâu",
    "xám",
    "tím",
    "cam",
    "be",
    "kem",
    "nude",
    "pastel",
    "neon",
    "metallic",
    "gold",
    "bạc",

    // Chất liệu
    "cotton",
    "len",
    "lụa",
    "silk",
    "da",
    "vải",
    "nhung",
    "voan",
    "ren",
    "lace",
    "denim",
    "kaki",
    "polyester",
    "viscose",
    "modal",
    "bamboo",
    "organic",

    // Kích thước
    "size",
    "xs",
    "sm",
    "md",
    "lg",
    "xl",
    "xxl",
    "freesize",
    "oversize",
    "slim",
    "regular",
    "loose",
    "tight",
    "rộng",
    "vừa",
    "chật",
    "ôm",

    // Tính từ mô tả
    "đẹp",
    "xinh",
    "cute",
    "sexy",
    "elegant",
    "vintage",
    "retro",
    "modern",
    "trendy",
    "basic",
    "casual",
    "formal",
    "sang",
    "trọng",
    "cao",
    "cấp",
    "chất",
    "lượng",
    "tốt",
    "xịn",
    "authentic",
    "original",
    "hàng",
    "hiệu",

    // Kinh doanh
    "bán",
    "mua",
    "shop",
    "store",
    "giá",
    "rẻ",
    "sale",
    "giảm",
    "khuyến",
    "mãi",
    "freeship",
    "cod",
    "thanh",
    "toán",
    "giao",
    "hàng",
    "nhanh",
    "uy",
    "tín",

    // Điều kiện hàng
    "mới",
    "cũ",
    "secondhand",
    "vintage",
    "đã",
    "qua",
    "sử",
    "dụng",
    "like",
    "new",
    "còn",
    "nguyên",
    "tag",
    "tem",
    "hộp",
    "bill",
    "receipt",
    "bảo",
    "hành",

    // Từ nối & phụ từ tiếng Việt
    "và",
    "với",
    "của",
    "cho",
    "từ",
    "tại",
    "trong",
    "ngoài",
    "trên",
    "dưới",
    "có",
    "được",
    "là",
    "sẽ",
    "cần",
    "phải",
    "còn",
    "rất",
    "khá",
    "hơi",
    "hoặc",
    "nhưng",
    "nếu",
    "khi",
    "lúc",
    "bây",
    "giờ",
    "ngay",
    "liền",

    // Từvựng thương mại điện tử
    "inbox",
    "comment",
    "like",
    "follow",
    "order",
    "booking",
    "deal",
    "sold",
    "available",
    "stock",
    "hot",
    "trend",
    "viral",
    "review",
    "feedback",

    // Địa chỉ & giao hàng
    "hcm",
    "sài",
    "gòn",
    "hà",
    "nội",
    "đà",
    "nẵng",
    "cần",
    "thơ",
    "quận",
    "phường",
    "thành",
    "phố",
    "tỉnh",
    "huyện",
    "xã",
    "giao",
    "ship",
    "express",
  ];

  // 🔥 CÁC MẪU TIẾNG VIỆT SÁNG TẠO (Cho phép một số từ sáng tạo)
  const creativeVietnamesePatterns = [
    "xinh",
    "xỉu",
    "chill",
    "mood",
    "vibe",
    "comfy",
    "cozy",
    "lovely",
    "sweet",
    "yêu",
    "thích",
    "ghiền",
    "mê",
    "cuốn",
    "hút",
    "wow",
    "amazing",
    "perfect",
  ];

  // 🚫 TỪ VÀ MẪU BỊ CẤM (Suspicious patterns)
  const suspiciousPatterns = [
    /[dfgh]{3,}/, // 3+ liên tiếp d/f/g/h
    /[qxz]{2,}/, // 2+ liên tiếp q/x/z (không phổ biến trong tiếng Việt)
    /[bcdfghjklmnpqrstvwxyz]{6,}/, // 6+ phụ âm liên tiếp
    /[aeiouăâêôơuưy]{5,}/, // 5+ nguyên âm liên tiếp
    /(.)\1{4,}/, // 5+ ký tự lặp lại
    /^[a-z]{1,2}$/, // Từ 1-2 ký tự (thường không có nghĩa)
  ];

  let validWordCount = 0;
  let invalidWordCount = 0;
  let suspiciousWordCount = 0;
  let englishWordCount = 0; // Đếm từ tiếng Anh

  // 🔍 KIỂM TRA TỪNG TỪ
  words.forEach((word) => {
    const cleanWord = word.replace(/[^\wăâêôơuưy]/g, ""); // Bao gồm dấu tiếng Việt
    if (cleanWord.length < 2) return;

    // Kiểm tra suspicious patterns
    const isSuspicious = suspiciousPatterns.some((pattern) =>
      pattern.test(cleanWord)
    );
    if (isSuspicious) {
      suspiciousWordCount++;
      return;
    }

    // Kiểm tra từ tiếng Việt chuẩn
    if (
      standardVietnameseWords.includes(cleanWord) ||
      creativeVietnamesePatterns.includes(cleanWord)
    ) {
      validWordCount++;
      return;
    }

    // Kiểm tra từ tiếng Anh phổ biến (Cho phép một số từ)
    const commonEnglishWords = [
      "new",
      "sale",
      "hot",
      "trend",
      "style",
      "fashion",
      "vintage",
      "retro",
      "basic",
      "premium",
      "luxury",
      "classic",
      "modern",
      "cute",
      "sexy",
      "size",
      "color",
      "free",
      "ship",
      "cod",
      "order",
      "inbox",
      "like",
    ];
    if (commonEnglishWords.includes(cleanWord)) {
      englishWordCount++;
      validWordCount += 0.8; // Điểm thấp hơn cho tiếng Anh
      return;
    }

    // Kiểm tra pattern tiếng Việt cơ bản
    const vietnamesePattern =
      /^[bcdfghjklmnpqrstvwxyz]*[aeiouăâêôơuưy]+[bcdfghjklmnpqrstvwxyz]*$/;
    if (vietnamesePattern.test(cleanWord) && cleanWord.length >= 3) {
      // Có thể là từ tiếng Việt hợp lệ
      validWordCount += 0.6; // Điểm trung bình
      return;
    }

    // Từ không xác định được
    invalidWordCount++;
  });

  // 🧮 TÍNH ĐIỂM
  const totalWords = words.length;
  const validRatio = validWordCount / totalWords;
  const suspiciousRatio = suspiciousWordCount / totalWords;
  const invalidRatio = invalidWordCount / totalWords;
  const englishRatio = englishWordCount / totalWords;

  // Công thức tính điểm nghiêm ngặt
  let score = validRatio;

  // Trừ điểm cho các vấn đề
  score -= suspiciousRatio * 2; // Trừ mạnh cho suspicious text
  score -= invalidRatio * 1.5; // Trừ mạnh cho invalid words
  score -= englishRatio * 0.3; // Trừ nhẹ cho tiếng Anh (cho phép một số)

  // Bonus nếu có đủ từ tiếng Việt chuẩn
  if (validWordCount >= 3 && suspiciousWordCount === 0) {
    score += 0.1; // Bonus 10%
  }

  return Math.max(0, Math.min(score, 1));
}

// 🇻🇳 KIỂM TRA TÍNH ĐỌC ĐƯỢC CỦA TIẾNG VIỆT (NEW)
function assessVietnameseReadability(text) {
  // Kiểm tra cấu trúc câu tiếng Việt
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;

  let readabilityScore = 0;
  let validSentences = 0;

  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (trimmed.length < 5) return; // Câu quá ngắn

    // Kiểm tra cấu trúc cơ bản
    const words = trimmed.split(/\s+/);
    if (words.length < 2) return; // Câu phải có ít nhất 2 từ

    let sentenceScore = 0;

    // 1. Kiểm tra độ dài câu hợp lý (5-25 từ cho tiếng Việt)
    if (words.length >= 5 && words.length <= 25) {
      sentenceScore += 0.3;
    } else if (words.length > 25) {
      sentenceScore += 0.1; // Câu quá dài
    }

    // 2. Kiểm tra có từ nối hợp lý
    const connectors = [
      "và",
      "với",
      "của",
      "cho",
      "từ",
      "có",
      "là",
      "được",
      "còn",
    ];
    const hasConnectors = connectors.some((conn) => trimmed.includes(conn));
    if (hasConnectors) {
      sentenceScore += 0.2;
    }

    // 3. Kiểm tra cấu trúc chủ-vị cơ bản
    const hasSubject =
      /\b(tôi|mình|shop|cửa hàng|sản phẩm|áo|váy|quần|giày)\b/.test(trimmed);
    const hasVerb = /\b(bán|mua|có|được|là|như|giống|đẹp|tốt|phù hợp)\b/.test(
      trimmed
    );
    if (hasSubject && hasVerb) {
      sentenceScore += 0.3;
    }

    // 4. Không có quá nhiều ký tự đặc biệt
    const specialCharCount = (
      trimmed.match(/[!@#$%^&*()+={}[\]:";'<>?\/\\|`~]/g) || []
    ).length;
    if (specialCharCount / trimmed.length < 0.1) {
      sentenceScore += 0.2;
    }

    readabilityScore += sentenceScore;
    validSentences++;
  });

  return validSentences > 0
    ? Math.min(readabilityScore / validSentences, 1)
    : 0;
}

// Assess readability
function assessReadability(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgCharsPerWord = text.replace(/\s+/g, "").length / words.length;

  // Ideal ranges for Vietnamese
  const idealWordsPerSentence = 15; // 10-20 words per sentence
  const idealCharsPerWord = 6; // 4-8 characters per word

  const sentenceLengthScore =
    1 -
    Math.abs(avgWordsPerSentence - idealWordsPerSentence) /
      idealWordsPerSentence;
  const wordLengthScore =
    1 - Math.abs(avgCharsPerWord - idealCharsPerWord) / idealCharsPerWord;

  return Math.max(0, (sentenceLengthScore + wordLengthScore) / 2);
}

// 🎯 SPECIALIZED AI COORDINATION - Combining GROQ & Google Gemini
async function performSpecializedAIAnalysis(text) {
  const apiKeys = validateAPIKeys();
  const results = {
    bannedProductScore: 0.0, // Lower is better (0.0 = legal, 1.0 = banned)
    vietnameseQualityScore: 0.5, // Higher is better (0.0 = poor, 1.0 = excellent)
    aiProvidersUsed: [],
    errors: [],
  };

  // 🇻🇳 GOOGLE GEMINI ONLY: Kiểm tra cả banned products + Vietnamese quality
  if (apiKeys.google) {
    try {
      console.log("🇻🇳 Google Gemini analyzing content (UNIFIED)...");

      // Unified analysis cho cả banned products và Vietnamese quality
      const analysis = await analyzeContentWithGeminiUnified(text);

      results.bannedProductScore = analysis.bannedScore;
      results.vietnameseQualityScore = analysis.vietnameseScore;
      results.aiProvidersUsed.push("Google Gemini (Unified Analysis)");

      console.log(`✅ Google Unified Analysis:`);
      console.log(
        `   🚫 Banned Risk: ${(results.bannedProductScore * 100).toFixed(1)}%`
      );
      console.log(
        `   🇻🇳 Vietnamese Quality: ${(
          results.vietnameseQualityScore * 100
        ).toFixed(1)}%`
      );
    } catch (error) {
      console.warn("⚠️ Google unified analysis failed:", error.message);
      results.errors.push(`Google: ${error.message}`);
      results.bannedProductScore = 0.3; // Conservative default when AI fails
      results.vietnameseQualityScore = 0.4; // Conservative default when AI fails
    }
  } else {
    console.warn("⚠️ Google not available - using fallback analysis");
    results.bannedProductScore = 0.3; // Conservative default
    results.vietnameseQualityScore = 0.4; // Conservative default
    results.errors.push("Google API key not available");
  }

  return results;
}

// 🇻🇳 UNIFIED GOOGLE GEMINI ANALYSIS (Banned + Vietnamese in one call)
async function analyzeContentWithGeminiUnified(text) {
  return await retryWithBackoff(async () => {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Bạn là AI kiểm duyệt CHUYÊN NGHIỆP cho sàn thương mại điện tử Việt Nam.
Phân tích văn bản theo 2 tiêu chí và trả về CHÍNH XÁC định dạng JSON:

🚫 BANNED SCORE (0.0-1.0): Mức độ vi phạm pháp luật Việt Nam
- 0.0-0.2: SẢN PHẨM HỢP PHÁP (quần áo, điện tử, sách, mỹ phẩm...)
- 0.3-0.5: CẦN KIỂM TRA (từ ngữ mơ hồ, cần xác minh)
- 0.6-0.8: KHẢ NGHI (có dấu hiệu vi phạm)
- 0.9-1.0: VI PHẠM NGHIÊM TRỌNG (ma túy, vũ khí, hàng giả...)

🇻🇳 VIETNAMESE SCORE (0.0-1.0): Chất lượng tiếng Việt
- 0.0-0.3: RÁC/GARBLED (không đọc được, spam)
- 0.4-0.5: YẾU (nhiều lỗi, khó hiểu) 
- 0.6-0.7: CHẤP NHẬN ĐƯỢC (một số lỗi nhỏ)
- 0.8-0.9: TỐT (rõ ràng, ít lỗi)
- 1.0: HOÀN HẢO (chuẩn mực, chuyên nghiệp)

📝 PHÂN TÍCH VĂN BẢN: "${text}"

❗ BẮT BUỘC TRẢ VỀ JSON CHÍNH XÁC:
{"bannedScore": 0.X, "vietnameseScore": 0.Y}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 50,
          response_mime_type: "application/json",
        },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 20000 }
    );

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(`🔍 Google Raw Response: ${result}`);

    try {
      const parsed = JSON.parse(result.trim());
      return {
        bannedScore: Math.min(Math.max(parsed.bannedScore || 0.3, 0), 1),
        vietnameseScore: Math.min(
          Math.max(parsed.vietnameseScore || 0.4, 0),
          1
        ),
      };
    } catch (parseError) {
      console.warn("⚠️ JSON parse failed, using regex fallback");
      // Fallback: extract numbers from response
      const bannedMatch = result.match(/bannedScore["\s:]*([0-9.]+)/i);
      const vietnameseMatch = result.match(/vietnameseScore["\s:]*([0-9.]+)/i);

      return {
        bannedScore: bannedMatch
          ? Math.min(Math.max(parseFloat(bannedMatch[1]), 0), 1)
          : 0.3,
        vietnameseScore: vietnameseMatch
          ? Math.min(Math.max(parseFloat(vietnameseMatch[1]), 0), 1)
          : 0.4,
      };
    }
  }, "Gemini Unified Analysis");
}

// 🧠 EXPERT AI ANALYSIS - Tạo hàm riêng cho Multi-Expert System
async function analyzeWithExpertAI(
  prompt,
  expertType = "general",
  images = null
) {
  if (!GOOGLE_AI_KEY) {
    console.warn(`❌ No Google AI key for ${expertType} expert analysis`);
    return getDefaultExpertResponse(expertType);
  }

  return await retryWithBackoff(async () => {
    let requestBody;

    // 🖼️ Handle image analysis for Image Expert - ANALYZE ALL IMAGES
    if (expertType === "imageAnalysis" && images && images.length > 0) {
      console.log(`🖼️ Analyzing ${images.length} images for consistency...`);

      try {
        // Prepare all images for analysis
        const imageParts = [];
        const validImages = [];

        for (let i = 0; i < Math.min(images.length, 5); i++) {
          // Limit to 5 images to avoid token limit
          const imageUrl =
            typeof images[i] === "object" ? images[i].url : images[i];

          if (!imageUrl || typeof imageUrl !== "string") {
            console.warn(`⚠️ Invalid image URL at index ${i}`);
            continue;
          }

          try {
            const imageBase64 = await getImageAsBase64(imageUrl);
            imageParts.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            });
            validImages.push(imageUrl);
            console.log(`✅ Successfully processed image ${i + 1}`);
          } catch (imageError) {
            console.warn(
              `⚠️ Failed to process image ${i + 1}: ${imageError.message}`
            );
          }
        }

        if (validImages.length === 0) {
          console.warn("❌ No valid images found for analysis");
          return getDefaultExpertResponse(expertType);
        }

        // Enhanced prompt for multiple image analysis
        const enhancedPrompt = `
Bạn là chuyên gia phân tích hình ảnh sản phẩm CỰC KỲ NGHIÊM NGẶT. Phân tích ${
          validImages.length
        } hình ảnh để kiểm tra:

THÔNG TIN SẢN PHẨM:
- Tên: ${prompt.match(/TÊN SẢN PHẨM: (.+)/)?.[1] || "N/A"}
- Mô tả: ${prompt.match(/MÔ TẢ: (.+)/)?.[1] || "N/A"}

🚨 NHIỆM VỤ NGHIÊM NGẶT - PHÁT HIỆN GIAN LẬN:

1. **KIỂM TRA KHỚP SẢN PHẨM (BẮT BUỘC)**:
   - Tất cả hình ảnh có CHÍNH XÁC là sản phẩm được mô tả không?
   - Có hình ảnh nào là sản phẩm KHÁC HOÀN TOÀN không? (VD: nói áo nhưng ảnh điện thoại)
   - Màu sắc, model, size có ĐÚNG như mô tả không?
   - Có dấu hiệu "bait and switch" (câu khách bằng ảnh sai) không?

2. **PHÁT HIỆN MISREPRESENTATION (ZERO TOLERANCE)**:
   ❌ PHÁT HIỆN NGAY → misrepresentation = true:
   - Ảnh sản phẩm hoàn toàn khác với tên/mô tả
   - Ảnh fake, photoshop quá mức để đánh lừa
   - Ảnh lấy từ internet/catalog thay vì ảnh thật
   - Watermark của shop khác (bán hàng giả mạo)
   - Ảnh có logo/brand khác với sản phẩm mô tả
   - Tình trạng trong ảnh khác hoàn toàn với mô tả

3. **KIỂM TRA TÍNH NHẤT QUÁN NGHIÊM NGẶT**:
   - Nếu có nhiều ảnh: TẤT CẢ phải cùng 1 sản phẩm
   - Không được có ảnh của sản phẩm khác xen lẫn
   - Góc chụp khác nhau nhưng phải cùng 1 item

4. **ĐÁNH GIÁ CHẤT LƯỢNG & TÍNH CHÂN THỰC**:
   - Ảnh có rõ nét, đủ ánh sáng không?
   - Có dấu hiệu chỉnh sửa quá mức không?
   - Ảnh có phù hợp để bán hàng không?

🎯 NGƯỠNG NGHIÊM NGẶT:
- imageTextMatch < 0.3 → SẢN PHẨM SAI HOÀN TOÀN
- imageTextMatch 0.3-0.6 → NGHI NGỜ, CẦN REVIEW  
- imageTextMatch >= 0.7 → KHỚP TỐT
- imageConsistency < 0.4 → CÁC ẢNH KHÔNG CÙNG SẢN PHẨM
- imageConsistency >= 0.6 → NHẤT QUÁN TỐT

🚨 CÁC TRƯỜNG HỢP BẮT BUỘC REJECT:
- Ảnh điện thoại nhưng mô tả quần áo
- Ảnh ô tô nhưng mô tả đồng hồ  
- Ảnh nam giới nhưng mô tả quần áo nữ
- Ảnh màu đỏ nhưng mô tả màu xanh
- Ảnh mới nhưng mô tả đã qua sử dụng (và ngược lại)
- Ảnh có thương hiệu A nhưng mô tả thương hiệu B

📊 KẾT QUẢ BẮT BUỘC:
{
  "imageTextMatch": 0.0-1.0,
  "imageQuality": "EXCELLENT|GOOD|FAIR|POOR",
  "imageConsistency": 0.0-1.0,
  "inappropriate": true/false,
  "misrepresentation": true/false,
  "recommendation": "APPROVE|REJECT|NEEDS_REVIEW",
  "detailedAnalysis": "Mô tả chi tiết từng ảnh và so sánh với tên/mô tả",
  "inconsistencies": ["Danh sách chi tiết các vấn đề"],
  "imageDescriptions": ["Mô tả chính xác từng ảnh"],
  "overallConsistency": "Đánh giá tổng thể tính nhất quán",
  "reasoning": "Giải thích chi tiết tại sao APPROVE/REJECT/NEEDS_REVIEW"
}`;

        requestBody = {
          contents: [
            {
              parts: [{ text: enhancedPrompt }, ...imageParts],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 800, // Increase for detailed analysis
            response_mime_type: "application/json",
          },
        };

        console.log(
          `🔍 Sending ${validImages.length} images for expert analysis...`
        );
      } catch (imageError) {
        console.error(
          `❌ Image processing failed for ${expertType}:`,
          imageError
        );
        return getDefaultExpertResponse(expertType);
      }
    } else {
      // 🔤 Regular text analysis for other experts
      requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          response_mime_type: "application/json",
        },
      };
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
      requestBody,
      { headers: { "Content-Type": "application/json" }, timeout: 45000 } // Increase timeout for multiple images
    );

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(
      `🔍 ${expertType} Expert Raw Response:`,
      result?.substring(0, 200) + "..."
    );

    try {
      const parsed = JSON.parse(result.trim());

      // 🔧 FIX: Validate and clean the response for ALL expert types
      if (expertType === "imageAnalysis") {
        return {
          imageTextMatch: Math.max(
            0,
            Math.min(1, parseFloat(parsed.imageTextMatch) || 0.4)
          ),
          imageQuality: parsed.imageQuality || "FAIR",
          imageConsistency: Math.max(
            0,
            Math.min(1, parseFloat(parsed.imageConsistency) || 0.7)
          ),
          inappropriate: Boolean(parsed.inappropriate),
          misrepresentation: Boolean(parsed.misrepresentation),
          recommendation: parsed.recommendation || "NEEDS_REVIEW",
          detailedAnalysis: parsed.detailedAnalysis || "Phân tích hoàn tất",
          inconsistencies: Array.isArray(parsed.inconsistencies)
            ? parsed.inconsistencies
            : [],
          imageDescriptions: Array.isArray(parsed.imageDescriptions)
            ? parsed.imageDescriptions
            : [],
          overallConsistency: parsed.overallConsistency || "Cần đánh giá thêm",
          reasoning: parsed.reasoning || "Phân tích toàn bộ hình ảnh hoàn tất",
        };
      }

      // 🔧 FIX: Ensure all numeric fields are properly converted for other expert types
      if (expertType === "legal") {
        return {
          riskLevel: parsed.riskLevel || "MEDIUM",
          violationTypes: Array.isArray(parsed.violationTypes)
            ? parsed.violationTypes
            : [],
          recommendation: parsed.recommendation || "NEEDS_REVIEW",
          confidence: parseFloat(parsed.confidence) || 0.3,
          reasoning: parsed.reasoning || "Không thể phân tích được do lỗi API",
        };
      }

      if (expertType === "contentQuality") {
        return {
          textQuality: parsed.textQuality || "FAIR",
          clarity: parseFloat(parsed.clarity) || 0.5,
          completeness: parseFloat(parsed.completeness) || 0.5,
          vietnameseGrammar: parseFloat(parsed.vietnameseGrammar) || 0.5,
          consistency: parseFloat(parsed.consistency) || 0.5,
          isSpam: Boolean(parsed.isSpam),
          recommendation: parsed.recommendation || "NEEDS_REVIEW",
          issues: Array.isArray(parsed.issues)
            ? parsed.issues
            : ["Lỗi phân tích API"],
          reasoning: parsed.reasoning || "Không thể đánh giá được do lỗi API",
        };
      }

      if (expertType === "seniorModerator") {
        return {
          decision: parsed.decision || "NEEDS_REVIEW",
          confidence: parseFloat(parsed.confidence) || 0.3,
          overallScore: parseFloat(parsed.overallScore) || 0.5,
          keyFactors: Array.isArray(parsed.keyFactors)
            ? parsed.keyFactors
            : ["Lỗi hệ thống AI"],
          recommendations: Array.isArray(parsed.recommendations)
            ? parsed.recommendations
            : ["Admin cần kiểm tra thủ công"],
          reasoning:
            parsed.reasoning || "Hệ thống AI gặp lỗi, cần review manual",
        };
      }

      // Fallback for unknown expert types
      return parsed;
    } catch (parseError) {
      console.warn(`⚠️ ${expertType} Expert JSON parse failed, using fallback`);
      return getDefaultExpertResponse(expertType);
    }
  }, `${expertType} Expert Analysis`);
}

// 🔧 DEFAULT RESPONSES FOR EXPERTS
function getDefaultExpertResponse(expertType) {
  switch (expertType) {
    case "legal":
      return {
        riskLevel: "MEDIUM",
        violationTypes: [],
        recommendation: "NEEDS_REVIEW",
        confidence: 0.3,
        reasoning: "Không thể phân tích được do lỗi API",
      };
    case "contentQuality":
      return {
        textQuality: "FAIR",
        clarity: 0.5,
        completeness: 0.5,
        vietnameseGrammar: 0.5,
        consistency: 0.5,
        isSpam: false,
        recommendation: "NEEDS_REVIEW",
        issues: ["Lỗi phân tích API"],
        reasoning: "Không thể đánh giá được do lỗi API",
      };
    case "imageAnalysis":
      return {
        imageTextMatch: 0.4,
        imageQuality: "FAIR",
        imageConsistency: 0.7,
        inappropriate: false,
        misrepresentation: false,
        recommendation: "NEEDS_REVIEW",
        detailedAnalysis: "Lỗi phân tích hình ảnh do API",
        inconsistencies: ["API analysis failed"],
        imageDescriptions: ["Không thể phân tích hình ảnh"],
        overallConsistency: "Không thể đánh giá do lỗi API",
        reasoning: "Không thể phân tích hình ảnh do lỗi API",
      };
    case "seniorModerator":
      return {
        decision: "NEEDS_REVIEW",
        confidence: 0.3,
        overallScore: 0.5,
        keyFactors: ["Lỗi hệ thống AI"],
        recommendations: ["Admin cần kiểm tra thủ công"],
        reasoning: "Hệ thống AI gặp lỗi, cần review manual",
      };
    default:
      return {
        recommendation: "NEEDS_REVIEW",
        confidence: 0.3,
        reasoning: "Lỗi hệ thống",
      };
  }
}

// 🇻🇳 ENHANCED GOOGLE GEMINI VISION (Very Strict for Vietnamese Marketplace)
async function analyzeImageWithGeminiVision(imageUrl) {
  if (!GOOGLE_AI_KEY) {
    return { caption: "no_api_key", nsfwScore: 0, inappropriateScore: 0 };
  }

  return await retryWithBackoff(async () => {
    const imageBase64 = await getImageAsBase64(imageUrl);
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Bạn là AI kiểm duyệt CỰC KỲ NGHIÊM NGẶT cho sàn thương mại điện tử Việt Nam.
Phân tích hình ảnh này theo PHÁP LUẬT VIỆT NAM và yêu cầu marketplace uy tín:

🇻🇳 YÊU CẦU PHÂN TÍCH:
1. MÔ TẢ SẢN PHẨM: Mô tả ngắn gọn bằng tiếng Việt (1-2 câu)
2. VI PHẠM PHÁP LUẬT (0.0-1.0): Hàng cấm, trái phép, bất hợp pháp tại VN
3. NỘI DUNG NGƯỜI LỚN (0.0-1.0): NSFW, khiêu dâm, không phù hợp
4. TÍNH CHÂN THỰC (0.0-1.0): Ảnh thật vs giả/photoshop/không rõ ràng

🚫 PHÁT HIỆN NGAY (Score = 1.0):
- VŨ KHÍ: súng, dao, bom, chất nổ
- MA TÚY: cần sa, thuốc lắc, chất kích thích
- HÀNG GIẢ: fake, rep, nhái thương hiệu
- KHIÊU DÂM: nude, sex toy, nội dung 18+
- ĐỘNG VẬT QUÝ HIẾM: ngà voi, sừng tê giác, da hổ
- CỜ BẠC: máy đánh bạc, chip casino
- THUỐC KHÔNG PHÉP: thuốc không rõ nguồn gốc

⚠️ NGHỊ NGỜ (Score = 0.3-0.7):
- Ảnh mờ, không rõ ràng
- Photoshop quá mức
- Không phù hợp với sản phẩm bán hàng
- Thiếu thông tin sản phẩm

✅ HỢP LỆ (Score = 0.0-0.2):
- Sản phẩm rõ ràng, thật
- Phù hợp marketplace
- Tuân thủ pháp luật VN
- Ảnh chân thực, chất lượng

📸 HƯỚNG DẪN TRẢ LỜI:
Định dạng: Mô tả bằng tiếng Việt|PHÁP LUẬT:X.X|NSFW:X.X|CHÂN THỰC:X.X

VÍ DỤ:
- "Áo thun màu xanh cơ bản|PHÁP LUẬT:0.0|NSFW:0.0|CHÂN THỰC:0.8"
- "Hình ảnh mờ không rõ sản phẩm|PHÁP LUẬT:0.1|NSFW:0.0|CHÂN THỰC:0.2"`,
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.05, maxOutputTokens: 200 }, // Tăng tokens cho mô tả tiếng Việt
      },
      { headers: { "Content-Type": "application/json" }, timeout: 25000 } // Tăng timeout cho vision
    );

    const result =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parts = result.split("|");

    const caption = parts[0] || "unknown";
    const legalMatch = result.match(/PHÁP LUẬT:(\d+\.?\d*)/i);
    const nsfwMatch = result.match(/NSFW:(\d+\.?\d*)/i);
    const authenticMatch = result.match(/CHÂN THỰC:(\d+\.?\d*)/i);

    const inappropriateScore = legalMatch ? parseFloat(legalMatch[1]) : 0;
    const nsfwScore = nsfwMatch ? parseFloat(nsfwMatch[1]) : 0;
    const authenticityScore = authenticMatch
      ? parseFloat(authenticMatch[1])
      : 0.5;

    return {
      caption: caption.toLowerCase(),
      nsfwScore,
      inappropriateScore, // Đây sẽ là điểm vi phạm pháp luật
      authenticityScore,
    };
  }, `Gemini Vision Analysis for ${typeof imageUrl === "string" ? imageUrl.slice(-20) : "image"}`);
}

// 🖼️ ENHANCED GEMINI VISION WITH CUSTOM PROMPT (For Multi-Expert Analysis)
async function analyzeImagesWithCustomPrompt(images, customPrompt) {
  if (!GOOGLE_AI_KEY) {
    return {
      imageTextMatch: 0.5,
      imageQuality: "FAIR",
      imageConsistency: 1.0,
      inappropriate: false,
      misrepresentation: false,
      recommendation: "NEEDS_REVIEW",
      detailedAnalysis: "No API key available",
      inconsistencies: [],
      reasoning: "Google API key not configured",
    };
  }

  if (!images || images.length === 0) {
    return {
      imageTextMatch: 0.5,
      imageQuality: "FAIR",
      imageConsistency: 1.0,
      inappropriate: false,
      misrepresentation: false,
      recommendation: "APPROVE",
      detailedAnalysis: "Không có hình ảnh để phân tích",
      inconsistencies: [],
      reasoning: "Sản phẩm không có hình ảnh",
    };
  }

  try {
    // Process first image with custom prompt
    const firstImageUrl =
      typeof images[0] === "object" ? images[0].url : images[0];

    if (!firstImageUrl || typeof firstImageUrl !== "string") {
      throw new Error("Invalid image URL format");
    }

    return await retryWithBackoff(async () => {
      const imageBase64 = await getImageAsBase64(firstImageUrl);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
        {
          contents: [
            {
              parts: [
                {
                  text: customPrompt,
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 400,
            response_mime_type: "application/json",
          },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );

      const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`🖼️ Image Expert Raw Response: ${result}`);

      try {
        const parsed = JSON.parse(result.trim());
        return {
          imageTextMatch: Math.max(
            0,
            Math.min(1, parsed.imageTextMatch || 0.5)
          ),
          imageQuality: parsed.imageQuality || "FAIR",
          imageConsistency: Math.max(
            0,
            Math.min(1, parsed.imageConsistency || 1.0)
          ),
          inappropriate: parsed.inappropriate || false,
          misrepresentation: parsed.misrepresentation || false,
          recommendation: parsed.recommendation || "NEEDS_REVIEW",
          detailedAnalysis:
            parsed.detailedAnalysis || "Phân tích hình ảnh thành công",
          inconsistencies: Array.isArray(parsed.inconsistencies)
            ? parsed.inconsistencies
            : [],
          reasoning: parsed.reasoning || "Phân tích hoàn tất",
        };
      } catch (parseError) {
        console.warn("⚠️ Image Expert JSON parse failed, using fallback");
        return {
          imageTextMatch: 0.4,
          imageQuality: "FAIR",
          imageConsistency: 0.7,
          inappropriate: false,
          misrepresentation: false,
          recommendation: "NEEDS_REVIEW",
          detailedAnalysis: "Lỗi parse JSON, cần review thủ công",
          inconsistencies: ["JSON parsing failed"],
          reasoning: "Could not parse AI response",
        };
      }
    }, `Custom Image Analysis for ${images.length} images`);
  } catch (error) {
    console.error("❌ Error in custom image analysis:", error);
    return {
      imageTextMatch: 0.3,
      imageQuality: "POOR",
      imageConsistency: 0.5,
      inappropriate: false,
      misrepresentation: false,
      recommendation: "NEEDS_REVIEW",
      detailedAnalysis: `Lỗi phân tích hình ảnh: ${error.message}`,
      inconsistencies: ["Analysis error"],
      reasoning: `Image analysis failed: ${error.message}`,
    };
  }
}

// Helper function to convert image URL to base64 for Gemini
async function getImageAsBase64(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
    });
    return Buffer.from(response.data).toString("base64");
  } catch (error) {
    throw new Error(`Failed to fetch image: Invalid URL - ${error.message}`);
  }
}

// ⭐ STRICT IMAGE-TEXT MATCHING (Enhanced with semantic analysis)
function calculateImageTextMatch(
  captions,
  productTitle,
  productDescription = ""
) {
  // CONSERVATIVE APPROACH: Fail if no data available
  if (!captions.length || !productTitle) return 0.1; // Much lower default - require manual review

  const validCaptions = captions.filter(
    (c) =>
      typeof c === "string" &&
      c.length > 5 &&
      c !== "unknown" &&
      c !== "no_api_key" &&
      c !== "analysis_failed"
  );

  // CRITICAL: If AI analysis failed, be conservative
  if (validCaptions.length === 0) return 0.15; // Much lower when no valid captions

  const productText = `${productTitle} ${productDescription}`.toLowerCase();

  // Enhanced keyword extraction with filtering
  const productKeywords = new Set(
    productText
      .split(/[\s\-_.,!?]+/)
      .filter((word) => word.length > 2)
      .map((word) => word.replace(/[^\w]/g, ""))
      .filter((word) => !isCommonWord(word)) // Filter out common words
  );

  if (productKeywords.size === 0) return 0.1; // No meaningful keywords

  let totalScore = 0;
  let criticalMatches = 0; // Count of important matches

  validCaptions.forEach((caption) => {
    const captionWords = new Set(
      caption
        .toLowerCase()
        .split(/[\s\-_.,!?]+/)
        .filter((word) => word.length > 2)
        .map((word) => word.replace(/[^\w]/g, ""))
        .filter((word) => !isCommonWord(word))
    );

    // 1. STRICT Keyword matching - require exact matches
    const directMatches = [...productKeywords].filter((word) =>
      captionWords.has(word)
    );

    // ❌ REMOVED: Category checking (detectProductCategory, detectCriticalMismatch)
    // 🎯 NEW: Focus on direct text matching only per user request

    // Calculate scores WITHOUT category constraints
    const directMatchRatio =
      directMatches.length / Math.max(productKeywords.size, 1);
    const jaccardScore = calculateJaccardSimilarity(
      productKeywords,
      captionWords
    );

    // Simplified scoring: direct matching + semantic similarity
    const captionScore = 0.6 * directMatchRatio + 0.4 * jaccardScore;
    totalScore += captionScore;

    if (directMatches.length >= 2) criticalMatches++;
  });

  const averageScore = totalScore / validCaptions.length;
  const criticalBonus = criticalMatches > 0 ? 0.1 : 0; // 10% bonus for having critical matches

  const finalScore = Math.min(averageScore + criticalBonus, 1.0);

  // STRICT: No minimum floor - if it doesn't match, it doesn't match
  return Math.max(finalScore, 0.05); // Very low minimum, force human review
}

// Helper function to detect common words that shouldn't be used for matching
function isCommonWord(word) {
  const commonWords = [
    "và",
    "của",
    "cho",
    "với",
    "từ",
    "tại",
    "trên",
    "dưới",
    "trong",
    "ngoài",
    "được",
    "các",
    "một",
    "này",
    "đó",
    "những",
    "như",
    "có",
    "không",
    "là",
    "sẽ",
    "the",
    "and",
    "or",
    "but",
    "for",
    "with",
    "from",
    "that",
    "this",
    "have",
    "has",
  ];
  return commonWords.includes(word.toLowerCase());
}

// ❌ REMOVED: Category checking functions (detectProductCategory, detectCriticalMismatch)
// 🎯 FOCUS: AI-only moderation without category constraints

// Calculate Jaccard similarity coefficient
function calculateJaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ⭐ ENHANCED RETRY MECHANISM
async function retryWithBackoff(
  fn,
  operation,
  retries = RETRY_CONFIG.maxRetries
) {
  // 🆕 Kiểm tra circuit breaker trước khi thử
  if (rateLimiter.circuitBreaker.isOpen) {
    console.warn(`⚠️ ${operation} skipped - Circuit breaker is OPEN`);
    throw new Error(
      "Circuit breaker is open - service temporarily unavailable"
    );
  }

  let maxAttempts = retries;

  for (let i = 0; i <= maxAttempts; i++) {
    try {
      const result = await fn();
      // ✅ Success - reset circuit breaker
      rateLimiter.recordSuccess();
      return result;
    } catch (error) {
      const statusCode = error.response?.status;

      // 🚨 SPECIAL HANDLING FOR 503 SERVICE UNAVAILABLE
      if (statusCode === 503) {
        rateLimiter.recordFailure();

        // Cho phép retry nhiều hơn cho 503 errors
        if (i < RETRY_CONFIG.serviceUnavailableRetries) {
          const serviceDelay = RETRY_CONFIG.serviceUnavailableDelay * (i + 1);
          console.warn(
            `⚠️ ${operation} - Google Gemini Service Unavailable (503). Retry ${
              i + 1
            }/${RETRY_CONFIG.serviceUnavailableRetries} in ${serviceDelay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, serviceDelay));
          continue;
        } else {
          console.error(
            `❌ ${operation} failed after ${RETRY_CONFIG.serviceUnavailableRetries} attempts - Google Gemini service persistently unavailable`
          );
          throw new Error(
            `Google Gemini service unavailable after ${RETRY_CONFIG.serviceUnavailableRetries} attempts`
          );
        }
      }

      // 🚦 RATE LIMIT HANDLING (429)
      if (statusCode === 429) {
        rateLimiter.recordFailure();

        if (i === retries) {
          console.error(
            `❌ ${operation} failed after ${retries} retries due to persistent rate limiting (429).`
          );
          throw error;
        }
        const rateDelay = 12000 * (i + 1); // Longer delays for rate limits
        console.warn(
          `⚠️ ${operation} rate limited (429). Backing off for ${rateDelay}ms. Attempt ${
            i + 1
          }/${retries}.`
        );
        await new Promise((resolve) => setTimeout(resolve, rateDelay));
        continue;
      }

      // 🔐 AUTHENTICATION ERRORS (401/403) - No retry
      const isAuthError = statusCode === 401 || statusCode === 403;
      const isInvalidKeyError = error.message.includes("API key not available");
      if (isAuthError || isInvalidKeyError) {
        console.error(
          `❌ ${operation} failed - authentication error (no retry):`,
          error.message
        );
        throw error;
      }

      // 🌐 SERVER ERRORS (500, 502, 504) - Retry with exponential backoff
      if (statusCode >= 500 && statusCode <= 504) {
        rateLimiter.recordFailure();

        if (i === retries) {
          console.error(
            `❌ ${operation} failed after ${retries} retries - server error ${statusCode}:`,
            error.message
          );
          throw error;
        }
        const serverDelay =
          RETRY_CONFIG.retryDelay *
          Math.pow(RETRY_CONFIG.backoffMultiplier, i + 1);
        console.warn(
          `⚠️ ${operation} server error (${statusCode}). Retrying in ${serverDelay}ms. Attempt ${
            i + 1
          }/${retries}.`
        );
        await new Promise((resolve) => setTimeout(resolve, serverDelay));
        continue;
      }

      // 🔄 OTHER ERRORS - Standard exponential backoff
      if (i === retries) {
        rateLimiter.recordFailure();
        console.error(
          `❌ ${operation} failed after ${retries} retries:`,
          error.message
        );
        throw error;
      }

      const delay =
        RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, i);
      console.warn(
        `⚠️ ${operation} failed (attempt ${
          i + 1
        }), retrying in ${delay}ms... Error: ${error.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// 🚨 EMERGENCY MODERATION - Sử dụng khi Google Gemini down
async function performEmergencyModeration(productId, productData, startTime) {
  try {

    const { name: title, description, images = [], weight } = productData;
    const fullText = `${title} ${description || ""}`;

    // ✅ STEP 1: BANNED PRODUCTS CHECK (Highest Priority)
    const bannedProductCheck = detectBannedProduct(fullText);
    if (bannedProductCheck.length > 0) {
      const criticalBanned = bannedProductCheck.filter(
        (b) => b.severity === "CRITICAL"
      );
      const reasons = [
        "🚫 SẢN PHẨM BỊ CẤM TẠI VIỆT NAM (Emergency Mode)",
        ...bannedProductCheck.map(
          (b) => `❌ Phát hiện: "${b.keyword}" (${b.category})`
        ),
        criticalBanned.length > 0
          ? "⚠️ MỨC ĐỘ NGHIÊM TRỌNG: Có thể vi phạm pháp luật"
          : "⚠️ Sản phẩm không được phép bán",
      ];

      await Product.findByIdAndUpdate(productId, {
        status: "rejected",
        "aiModerationResult.approved": false,
        "aiModerationResult.confidence": 0,
        "aiModerationResult.reasons": reasons,
        "aiModerationResult.reviewedAt": new Date(),
        "aiModerationResult.processingTime": Date.now() - startTime,
        "aiModerationResult.emergencyMode": true,
        "aiModerationResult.bannedProduct": true,
      });

      console.log(`🚫 EMERGENCY: Banned product rejected - ${productId}`);
      return;
    }

    // ✅ STEP 2: RULE-BASED QUALITY CHECKS
    const textChecks = {
      hasTitle: title && title.trim().length > 0,
      hasDescription: description && description.trim().length > 0,
      titleLength: title ? title.length >= 10 && title.length <= 200 : false,
      noGarbledText: !detectGarbledText(fullText).hasGarbledText,
      readableText: assessReadability(fullText).score >= 0.5,
    };

    const imageChecks = {
      hasImages: images && images.length > 0,
      reasonableImageCount: images.length <= 10,
    };

    // 🔢 KIỂM TRA TRỌNG LƯỢNG SẢN PHẨM
    const weightValidation = validateProductWeight(weight);

    // 🤖 AI WEIGHT ESTIMATION - Ước tính trọng lượng thông minh
    let weightEstimation = null;
    let finalWeight = weight; // Sử dụng weight người dùng nhập

    if (!weight || !weightValidation.valid) {
      console.log("🤖 Running AI Weight Estimation...");
      weightEstimation = estimateProductWeight(title, description);
      finalWeight = weightEstimation.estimatedWeight;
      console.log(
        `🎯 AI Estimated Weight: ${finalWeight}g (Confidence: ${(
          weightEstimation.confidence * 100
        ).toFixed(1)}%)`
      );
      console.log(`📊 Reasoning: ${weightEstimation.reasoning}`);
      console.log(
        `📏 Range: ${weightEstimation.range.min}g - ${weightEstimation.range.max}g`
      );
      if (weightEstimation.sizeAdjustment) {
        console.log(`📐 ${weightEstimation.sizeAdjustment}`);
      }
    }

    // Tái validate với weight mới (nếu có estimation)
    const finalWeightValidation = validateProductWeight(finalWeight);

    // ✅ STEP 3: CALCULATE EMERGENCY SCORE
    let emergencyScore = 0.0;
    const passedChecks = [];
    const failedChecks = [];

    // Text quality scoring (40%)
    if (textChecks.hasTitle) {
      emergencyScore += 0.1;
      passedChecks.push("Có tiêu đề");
    } else {
      failedChecks.push("Thiếu tiêu đề");
    }

    if (textChecks.hasDescription) {
      emergencyScore += 0.1;
      passedChecks.push("Có mô tả");
    } else {
      failedChecks.push("Thiếu mô tả");
    }

    if (textChecks.titleLength) {
      emergencyScore += 0.1;
      passedChecks.push("Tiêu đề có độ dài phù hợp");
    } else {
      failedChecks.push("Tiêu đề quá ngắn/dài");
    }

    if (textChecks.noGarbledText) {
      emergencyScore += 0.1;
      passedChecks.push("Không có text lỗi");
    } else {
      failedChecks.push("Text có dấu hiệu lỗi/garbled");
    }

    // Image checks (30%)
    if (imageChecks.hasImages) {
      emergencyScore += 0.2;
      passedChecks.push("Có hình ảnh");
    } else {
      failedChecks.push("Thiếu hình ảnh");
    }

    if (imageChecks.reasonableImageCount) {
      emergencyScore += 0.1;
      passedChecks.push("Số lượng hình hợp lý");
    } else {
      failedChecks.push("Quá nhiều hình ảnh");
    }

    // Weight validation (20%)
    if (finalWeightValidation.valid) {
      emergencyScore += 0.2;
      passedChecks.push(`Trọng lượng hợp lệ (${finalWeight}g)`);
    } else {
      emergencyScore += 0.05; // Partial credit
      failedChecks.push(...finalWeightValidation.reasons);
    }

    // Readability bonus (10%)
    if (textChecks.readableText) {
      emergencyScore += 0.1;
      passedChecks.push("Text dễ đọc");
    } else {
      failedChecks.push("Text khó đọc/không rõ ràng");
    }

    // ✅ STEP 4: DETERMINE APPROVAL (Conservative)
    // Emergency mode: Send to manual review instead of auto-approve
    const emergencyApproved = false; // Always manual review in emergency mode
    const confidence = Math.min(emergencyScore, 0.85); // Cap at 0.85 for emergency mode

    const reasons = [
      `🚨 EMERGENCY MODE: Google Gemini unavailable - Rule-based moderation only`,
      `📊 Emergency Score: ${(emergencyScore * 100).toFixed(1)}%`,
      `✅ Passed: ${passedChecks.length} checks | ❌ Failed: ${failedChecks.length} checks`,
      ...passedChecks.map((check) => `  ✅ ${check}`),
      ...failedChecks.map((check) => `  ❌ ${check}`),
      `👥 QUEUED FOR MANUAL REVIEW: AI analysis sẽ được thực hiện khi service khôi phục`,
      `🔄 Status: Chờ admin phê duyệt`,
    ];

    // ✅ STEP 5: UPDATE DATABASE
    await Product.findByIdAndUpdate(productId, {
      status: "pending_review", // Special status for emergency mode
      "aiModerationResult.approved": emergencyApproved,
      "aiModerationResult.confidence": confidence,
      "aiModerationResult.reasons": reasons,
      "aiModerationResult.reviewedAt": new Date(),
      "aiModerationResult.processingTime": Date.now() - startTime,
      "aiModerationResult.emergencyMode": true,
      "aiModerationResult.queuedForAI": true,
      "aiModerationResult.ruleBasedScore": emergencyScore,
      "aiModerationResult.passedChecks": passedChecks.length,
      "aiModerationResult.failedChecks": failedChecks.length,
    });

    return;
  } catch (error) {
    console.error(
      `❌ Emergency moderation failed for product ${productId}:`,
      error.message
    );

    // Fallback: Set as pending review with error
    await Product.findByIdAndUpdate(productId, {
      status: "pending_review",
      "aiModerationResult.approved": false,
      "aiModerationResult.confidence": 0.3,
      "aiModerationResult.reasons": [
        "🚨 EMERGENCY MODE: Rule-based moderation encountered error",
        "👥 Manual review required",
        `❌ Error: ${error.message}`,
      ],
      "aiModerationResult.reviewedAt": new Date(),
      "aiModerationResult.processingTime": Date.now() - startTime,
      "aiModerationResult.emergencyMode": true,
      "aiModerationResult.error": true,
    });

    return;
  }
}

// ⭐ SIMPLIFIED AI MODERATION FUNCTION - Multi-Expert Analysis Only
async function processEnhancedAIModerationBackground(productId, productData) {
  const startTime = Date.now();
  try {
    // 🚨 EMERGENCY MODE - Bypass AI moderation hoàn toàn
    if (EMERGENCY_MODE || rateLimiter.circuitBreaker.isOpen) {
      const reason = EMERGENCY_MODE
        ? "Manual emergency mode enabled"
        : "Circuit breaker is open - all AI services down";



      const emergencyResult = await performEmergencyModeration(
        productId,
        productData,
        startTime
      );
      return emergencyResult;
    }


    await Product.findByIdAndUpdate(productId, {
      "aiModerationResult.processingStarted": new Date(),
      "aiModerationResult.retryCount": 0,
    });

    const { name: title, description, images = [], weight } = productData;
    const fullText = `${title} ${description || ""}`;



    const aiResults = await performSpecializedAIAnalysis(
      title,
      description || "",
      images
    );

    // 🔢 Optional: Still check weight estimation for completeness
    let weightEstimation = null;
    let finalWeight = weight;
    if (!weight || weight <= 0) {
      console.log("🤖 Running AI Weight Estimation...");
      weightEstimation = estimateProductWeight(title, description);
      finalWeight = weightEstimation.estimatedWeight;
      console.log(
        `🎯 AI Estimated Weight: ${finalWeight}g (Confidence: ${(
          weightEstimation.confidence * 100
        ).toFixed(1)}%)`
      );
    }

    // 🎯 ENHANCED DECISION MAPPING based on AI Analysis
    const finalDecision = aiResults.finalDecision;
    const approved = finalDecision === "APPROVE";
    const confidence = parseFloat(aiResults.confidence) || 0.5;

    let status;
    switch (finalDecision) {
      case "APPROVE":
        status = "approved";
        break;
      case "REJECT":
        status = "rejected";
        break;
      case "NEEDS_REVIEW":
      default:
        status = "pending_review";
        break;
    }

    const processingTime = Date.now() - startTime;

    // 📋 COMPREHENSIVE REASONS from Enhanced AI Analysis
    const allReasons = [
      `🧠 Enhanced Multi-Expert AI Analysis: ${finalDecision}`,
      `🎯 Final Decision: ${finalDecision} (Confidence: ${(
        confidence * 100
      ).toFixed(1)}%)`,
      `👨‍⚖️ Senior Moderator Reasoning: "${aiResults.reasoning}"`,
    ];

    // Add individual expert insights
    if (aiResults.experts?.legal) {
      const legal = aiResults.experts.legal;
      allReasons.push(
        `🏛️ Legal Expert: ${legal.riskLevel} risk - ${legal.recommendation}`
      );
      if (legal.violationTypes?.length > 0) {
        allReasons.push(
          `⚠️ Legal Violations: ${legal.violationTypes.join(", ")}`
        );
      }
    }

    if (aiResults.experts?.contentQuality) {
      const content = aiResults.experts.contentQuality;
      allReasons.push(
        `🇻🇳 Content Expert: ${content.textQuality} quality - ${content.recommendation}`
      );
      if (content.clarity)
        allReasons.push(`   Clarity: ${(content.clarity * 100).toFixed(1)}%`);
      if (content.completeness)
        allReasons.push(
          `   Completeness: ${(content.completeness * 100).toFixed(1)}%`
        );
      if (content.isSpam) allReasons.push(`   ⚠️ Detected as spam content`);
    }

    if (aiResults.experts?.imageAnalysis && images?.length > 0) {
      const img = aiResults.experts.imageAnalysis;
      allReasons.push(
        `🖼️ Image Expert: ${img.imageQuality} quality - ${img.recommendation}`
      );
      if (img.imageTextMatch)
        allReasons.push(
          `   Image-Text Match: ${(img.imageTextMatch * 100).toFixed(1)}%`
        );
      if (img.misrepresentation)
        allReasons.push(`   ⚠️ Possible misrepresentation detected`);
      if (img.inappropriate)
        allReasons.push(`   ⚠️ Inappropriate content detected`);
    }

    if (weightEstimation) {
      allReasons.push(
        `⚖️ AI Weight Estimation: ${finalWeight}g (${(
          weightEstimation.confidence * 100
        ).toFixed(1)}% confidence)`
      );
    }

    // Add key factors from Senior Moderator
    if (aiResults.keyFactors?.length > 0) {
      allReasons.push(
        `🔑 Key Decision Factors: ${aiResults.keyFactors.join(", ")}`
      );
    }

    // Add recommendations if any
    if (aiResults.recommendations?.length > 0) {
      allReasons.push(
        `💡 Recommendations: ${aiResults.recommendations.join("; ")}`
      );
    }

    // 💾 UPDATE DATABASE with comprehensive results
    await Product.findByIdAndUpdate(productId, {
      status,
      "aiModerationResult.approved": approved,
      "aiModerationResult.confidence": Number(confidence.toFixed(3)),
      "aiModerationResult.reasons": allReasons,
      "aiModerationResult.reviewedAt": new Date(),
      "aiModerationResult.processingTime": processingTime,

      // 🧠 Enhanced Multi-Expert Analysis Results
      "aiModerationResult.enhancedAnalysis": {
        finalDecision: finalDecision,
        reasoning: aiResults.reasoning,
        confidence: confidence,
        overallScore: parseFloat(aiResults.overallScore) || 0.5,
        keyFactors: aiResults.keyFactors || [],
        recommendations: aiResults.recommendations || [],
        expertsConsulted: [
          "Legal",
          "Content Quality",
          "Image Analysis",
          "Senior Moderator",
        ],
        timestamp: aiResults.timestamp,
      },

      // 🤖 AI Weight Estimation (if performed) - ALWAYS IN GRAMS
      "estimatedWeight.value": weightEstimation?.estimatedWeight || null,
      "estimatedWeight.unit": "grams", // ✅ EXPLICIT UNIT
      "estimatedWeight.confidence": weightEstimation?.confidence || null,
      "estimatedWeight.reasoning": weightEstimation?.reasoning || null,
      "estimatedWeight.range": weightEstimation?.range || null,
      "estimatedWeight.category": weightEstimation?.category || null,
      "estimatedWeight.isAIGenerated": !!weightEstimation,
      "estimatedWeight.generatedAt": weightEstimation ? new Date() : null,

      // 🏷️ Moderation metadata
      "aiModerationResult.moderationType": "enhanced-multi-expert-ai",
      "aiModerationResult.strictMode": MODERATION_CONFIG.STRICT_MODE,
      "aiModerationResult.apiVersion": "google-gemini-enhanced-v2",
    });

    console.log(
      `${
        approved ? "✅" : finalDecision === "NEEDS_REVIEW" ? "🔍" : "❌"
      } Enhanced AI moderation complete: ${status.toUpperCase()} | Product: ${productId} | Time: ${processingTime}ms | Confidence: ${confidence.toFixed(
        3
      )} | Decision: ${finalDecision}`
    );

    return {
      approved,
      confidence,
      finalDecision: finalDecision,
      enhancedAnalysis: aiResults,
    };
  } catch (error) {
    console.error(
      `❌ Enhanced Multi-Expert AI moderation failed for product ${productId}:`,
      error.message
    );
    await Product.findByIdAndUpdate(productId, {
      status: "pending_review",
      "aiModerationResult.approved": false,
      "aiModerationResult.reasons": [
        `🚨 Lỗi hệ thống Enhanced Multi-Expert AI: ${error.message}`,
      ],
      "aiModerationResult.reviewedAt": new Date(),
      "aiModerationResult.moderationType": "failed-enhanced-ai",
    });
    throw error;
  }
}

// ⭐ QUEUE PROCESSING SYSTEM (Keep existing)
async function addToModerationQueue(
  productId,
  productData,
  priority = "normal"
) {
  moderationQueue.push({
    productId,
    productData,
    priority,
    addedAt: new Date(),
    attempts: 0,
  });
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
  console.log(
    `🔄 Processing ${currentMode} Google Gemini ONLY moderation queue: ${moderationQueue.length} items (Testing Mode)`
  );
  while (moderationQueue.length > 0) {
    const item = moderationQueue.shift();
    try {
      await processEnhancedAIModerationBackground(
        item.productId,
        item.productData
      );
    } catch (error) {
      item.attempts++;
      if (item.attempts < 2) {
        // Giảm retry attempts
        moderationQueue.push({ ...item, priority: "low" });
        console.log(
          `🔄 Retry queued for product ${item.productId} (attempt ${
            item.attempts + 1
          })`
        );
      } else {
        console.error(
          `❌ Final failure for product ${item.productId} after 2 attempts`
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Longer delay
  }
  isProcessingQueue = false;
  console.log(
    `✅ ${currentMode} Google Gemini ONLY moderation queue processing complete (Testing Mode)`
  );
}

// 🎯 SPECIALIZED AI API TESTING (GROQ + Google)
async function testAPIKeys() {
  const keys = validateAPIKeys();
  const results = { google: false, groq: false };

  // Test Google Gemini (Vietnamese Quality)
  if (keys.google) {
    try {
      await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_KEY}`,
        {
          contents: [{ parts: [{ text: "test vietnamese quality" }] }],
          generationConfig: { maxOutputTokens: 5 },
        },
        { timeout: 15000 }
      );
      results.google = true;
      console.log("✅ Google Gemini API test successful (Vietnamese Quality)");
    } catch (error) {
      console.warn("❌ Google Gemini API test failed:", error.message);
      results.google = false;
    }
  } else {
    console.warn("❌ Google Gemini API key not found");
  }

  // Test GROQ (Banned Products)
  if (keys.groq) {
    try {
      await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "mixtral-8x7b-32768",
          messages: [{ role: "user", content: "test banned product check" }],
          max_tokens: 5,
        },
        {
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      results.groq = true;
      console.log("✅ GROQ API test successful (Banned Products)");
    } catch (error) {
      console.warn("❌ GROQ API test failed:", error.message);
      results.groq = false;
    }
  } else {
    console.warn("❌ GROQ API key not found");
  }

  console.log("🧪 Specialized AI API Test Results:");
  console.log(
    `  🇻🇳 Google Gemini (Vietnamese): ${
      results.google ? "✅ Working" : "❌ Failed"
    }`
  );
  console.log(
    `  🎯 GROQ (Banned Products): ${results.groq ? "✅ Working" : "❌ Failed"}`
  );

  return results;
}

// 🎯 SPECIALIZED AI SYSTEM HEALTH CHECK
function getModerationSystemHealth() {
  const apiKeys = validateAPIKeys();
  const thresholds = MODERATION_CONFIG.getThresholds();
  const hasSpecializedAI = apiKeys.google && apiKeys.groq; // Both providers needed

  return {
    queueLength: moderationQueue.length,
    isProcessing: isProcessingQueue,
    specializedAIEnabled: ENABLE_SPECIALIZED_AI,
    aiSpecialization: {
      bannedProductChecker: AI_PROVIDERS_CONFIG.bannedProductChecker,
      vietnameseQualityChecker: AI_PROVIDERS_CONFIG.vietnameseQualityChecker,
      imageConsistencyChecker: AI_PROVIDERS_CONFIG.imageConsistencyChecker,
    },
    strictMode: MODERATION_CONFIG.STRICT_MODE,
    currentMode: MODERATION_CONFIG.STRICT_MODE ? "STRICT" : "BALANCED",
    emergencyMode: EMERGENCY_MODE,
    operatingMode: "SPECIALIZED_AI", // NEW: Specialized AI mode
    circuitBreaker: {
      isOpen: rateLimiter.circuitBreaker.isOpen,
      failureCount: rateLimiter.circuitBreaker.failureCount,
      lastFailureTime: rateLimiter.circuitBreaker.lastFailureTime,
      status: rateLimiter.circuitBreaker.isOpen ? "🔴 OPEN" : "🟢 CLOSED",
    },
    rateLimiterStatus: {
      text: rateLimiter.requests.get("text")?.length || 0,
      image: rateLimiter.requests.get("image")?.length || 0,
    },
    providersStatus: {
      "groq (banned-products)": apiKeys.groq ? "✅ Ready" : "❌ Key Missing",
      "google (vietnamese-quality)": apiKeys.google
        ? "✅ Ready"
        : "❌ Key Missing",
      "google (image-consistency)": apiKeys.google
        ? "✅ Ready"
        : "❌ Key Missing",
    },
    systemStatus: hasSpecializedAI
      ? rateLimiter.circuitBreaker.isOpen
        ? "⚠️ Circuit Breaker Open"
        : "✅ Ready (Full Specialized AI)"
      : apiKeys.google && !apiKeys.groq
      ? "⚠️ Partial (Missing GROQ for banned products)"
      : !apiKeys.google && apiKeys.groq
      ? "⚠️ Partial (Missing Google for Vietnamese/Images)"
      : "❌ Missing Both AI Providers",
    recommendedAction: !hasSpecializedAI
      ? !apiKeys.google
        ? "Add Google Gemini API key for Vietnamese quality & image analysis"
        : "Add GROQ API key for banned product detection"
      : rateLimiter.circuitBreaker.isOpen
      ? "Wait for circuit breaker cooldown or check AI services"
      : "System operating at full capacity with specialized AI",
    thresholds: {
      textApproval: thresholds.textApproval,
      imageApproval: thresholds.individualScore,
      finalConfidence: thresholds.finalConfidence,
      imageTextMatch: thresholds.imageTextMatch,
      vietnameseLanguage: thresholds.vietnameseLanguage, // 🇻🇳
      imageConsistency: thresholds.imageConsistency,
      bannedProductTolerance: 0.5, // 🎯 NEW: GROQ banned product threshold
    },
  };
}

// ⭐ ADMIN FUNCTIONS FOR CONFIGURATION
function setStrictMode(enabled) {
  MODERATION_CONFIG.STRICT_MODE = enabled;
  console.log(`🔧 Strict Mode ${enabled ? "ENABLED" : "DISABLED"}`);
  return {
    strictMode: MODERATION_CONFIG.STRICT_MODE,
    thresholds: MODERATION_CONFIG.getThresholds(),
  };
}

function getCurrentConfig() {
  return {
    mode: MODERATION_CONFIG.STRICT_MODE ? "STRICT" : "BALANCED",
    thresholds: MODERATION_CONFIG.getThresholds(),
    weights: { text: 0.35, image: 0.3, imageTextMatch: 0.35 },
  };
}

// ⭐ TEST SPECIFIC PRODUCT FUNCTION
async function testProductModerationDetailed(productData) {
  const { name: title, description, images = [] } = productData;
  const fullText = `${title} ${description || ""}`;

  console.log(`🧪 TESTING PRODUCT MODERATION:`);
  console.log(`📝 Title: "${title}"`);
  console.log(`📄 Description: "${description?.substring(0, 100)}..."`);
  console.log(`🖼️  Images: ${images.length} image(s)`);

  try {
    // Run moderation
    const [textResult, imageResult] = await Promise.allSettled([
      moderateTextEnhanced(fullText),
      moderateImagesEnhanced(images),
    ]);

    const textMod =
      textResult.status === "fulfilled"
        ? textResult.value
        : { score: 0.1, approved: false, reasons: ["Text moderation failed"] };
    const imageMod =
      imageResult.status === "fulfilled"
        ? imageResult.value
        : { score: 0.1, approved: false, reasons: ["Image moderation failed"] };

    const captions = imageMod.details?.map((img) => img.caption) || [];
    const imageTextMatchScore = calculateImageTextMatch(
      captions,
      title,
      description
    );

    const thresholds = MODERATION_CONFIG.getThresholds();
    const weights = { text: 0.35, image: 0.3, imageTextMatch: 0.35 };
    const finalConfidence =
      weights.text * textMod.score +
      weights.image * imageMod.score +
      weights.imageTextMatch * imageTextMatchScore;

    const approved =
      textMod.approved &&
      imageMod.approved &&
      imageTextMatchScore >= thresholds.imageTextMatch &&
      finalConfidence >= thresholds.finalConfidence &&
      textMod.score >= thresholds.individualScore &&
      imageMod.score >= thresholds.individualScore;

    console.log(`\n📊 DETAILED TEST RESULTS:`);
    console.log(
      `📝 Text: ${textMod.score.toFixed(3)} | ${textMod.approved ? "✅" : "❌"}`
    );
    console.log(
      `🖼️  Image: ${imageMod.score.toFixed(3)} | ${
        imageMod.approved ? "✅" : "❌"
      }`
    );
    console.log(
      `🔗 Image-Text Match: ${imageTextMatchScore.toFixed(3)} (req: ${
        thresholds.imageTextMatch
      })`
    );
    console.log(
      `🎯 Final Confidence: ${finalConfidence.toFixed(3)} (req: ${
        thresholds.finalConfidence
      })`
    );
    console.log(`✅ APPROVED: ${approved ? "YES" : "NO"}`);

    if (captions.length > 0) {
      console.log(`📋 Captions: [${captions.join(", ")}]`);
    }

    return {
      approved,
      scores: {
        text: textMod.score,
        image: imageMod.score,
        imageTextMatch: imageTextMatchScore,
        finalConfidence,
      },
      details: { textMod, imageMod, captions },
      thresholds,
    };
  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
    return { approved: false, error: error.message };
  }
}

// 🧪 TEST BANNED PRODUCT DETECTION (Fix False Positive)
function testBannedProductDetection() {
  console.log("🧪 TESTING BANNED PRODUCT DETECTION - FALSE POSITIVE FIX:");

  // Test case 1: Sản phẩm váy hồng (nên PASS)
  const testCase1 = `Váy hồng tiểu thư tôn dáng.

🌸 Váy len co giãn tốt nhưng không bị nhão chút nào
🌸 Size S 
🌸 Váy dài trên đầu gối
🌸 Váy xinh hợp đi chơi hoặc đi học 

🎊Tiệm đồ Con Voi đảm bảo:
Luôn là đồ chất lượng, được nâng niu, giữ gìn cẩn thận.
Tiệm đã giặt sạch đồ và kiểm tra trước khi giao hàng.
100% giao đồ đúng trong ảnh.
Sẵn sàng hỗ trợ và tư vấn đồ xinh cho các bạn.`;

  // Test case 2: Thực sự có chứa từ cấm (nên FAIL)
  const testCase2 = "Bán cỏ chất lượng cao, cần sa nguyên chất";

  console.log("\n📋 Test Case 1 - Váy hồng (Expected: PASS):");
  const result1 = detectBannedProduct(testCase1);
  console.log(`   Results: ${result1.length} banned keywords found`);
  if (result1.length > 0) {
    console.log("   ❌ FALSE POSITIVE - Found:");
    result1.forEach((item) => {
      console.log(`      - "${item.keyword}" (${item.category})`);
    });
  } else {
    console.log("   ✅ PASS - No banned keywords detected");
  }

  console.log("\n📋 Test Case 2 - Thực sự bị cấm (Expected: FAIL):");
  const result2 = detectBannedProduct(testCase2);
  console.log(`   Results: ${result2.length} banned keywords found`);
  if (result2.length > 0) {
    console.log("   ✅ CORRECTLY DETECTED - Found:");
    result2.forEach((item) => {
      console.log(`      - "${item.keyword}" (${item.category})`);
    });
  } else {
    console.log("   ❌ SHOULD HAVE BEEN DETECTED");
  }

  console.log("\n🔍 Detailed Analysis for Test Case 1:");
  console.log("   Text contains:");
  console.log("   - 'đảm bảo' → should NOT trigger 'báo' (wildlife)");
  console.log("   - 'kiểm tra' → should NOT trigger 'kiếm' (weapons)");
  console.log("   - 'Con Voi' → should NOT trigger 'voi' (wildlife)");

  return { result1, result2 };
}

// 🧪 TEST SPCIFIC PINK DRESS PRODUCT (Váy hồng testing) - Google Only
async function testPinkDressWithAI() {
  console.log("🇻🇳 TESTING PINK DRESS WITH GOOGLE-ONLY AI:");

  const pinkDressText = `Váy hồng tiểu thư tôn dáng.

🌸 Váy len co giãn tốt nhưng không bị nhão chút nào
🌸 Size S 
🌸 Váy dài trên đầu gối
🌸 Váy xinh hợp đi chơi hoặc đi học 

🎊Tiệm đồ Con Voi đảm bảo:
Luôn là đồ chất lượng, được nâng niu, giữ gìn cẩn thận.
Tiệm đã giặt sạch đồ và kiểm tra trước khi giao hàng.
100% giao đồ đúng trong ảnh.
Sẵn sàng hỗ trợ và tư vấn đồ xinh cho các bạn.`;

  console.log(`📝 Testing text: "${pinkDressText.substring(0, 100)}..."`);

  try {
    // 1. Rule-based detection first (for comparison)
    console.log("\n🔍 1. RULE-BASED DETECTION (old method):");
    const ruleBased = detectBannedProduct(pinkDressText);
    console.log(`   Found ${ruleBased.length} potential keywords:`);
    ruleBased.forEach((item) => {
      console.log(
        `   - "${item.keyword}" (${item.category}) - ${item.severity}`
      );
    });

    // 2. Google Unified AI Analysis (NEW)
    console.log("\n🇻🇳 2. GOOGLE UNIFIED AI ANALYSIS:");
    const apiKeys = validateAPIKeys();
    if (apiKeys.google) {
      try {
        const unifiedResult = await analyzeContentWithGeminiUnified(
          pinkDressText
        );
        console.log(
          `   🚫 Banned Score: ${(unifiedResult.bannedScore * 100).toFixed(
            1
          )}% ${unifiedResult.bannedScore <= 0.5 ? "✅" : "❌"}`
        );
        console.log(
          `   🇻🇳 Vietnamese Score: ${(
            unifiedResult.vietnameseScore * 100
          ).toFixed(1)}% ${unifiedResult.vietnameseScore >= 0.4 ? "✅" : "❌"}`
        );
        console.log(
          `   📊 Overall: ${
            unifiedResult.bannedScore <= 0.5 &&
            unifiedResult.vietnameseScore >= 0.4
              ? "✅ SHOULD APPROVE"
              : "❌ SHOULD REJECT"
          }`
        );
      } catch (error) {
        console.error(`   ❌ Google unified failed: ${error.message}`);
      }
    } else {
      console.log(`   ❌ Google API key not available`);
    }

    // 3. Specialized AI Analysis (uses unified internally)
    console.log("\n🤖 3. SPECIALIZED AI ANALYSIS:");
    try {
      const specializedResults = await performSpecializedAIAnalysis(
        pinkDressText
      );
      console.log(
        `   🚫 Banned Score: ${(
          specializedResults.bannedProductScore * 100
        ).toFixed(1)}%`
      );
      console.log(
        `   🇻🇳 Vietnamese Score: ${(
          specializedResults.vietnameseQualityScore * 100
        ).toFixed(1)}%`
      );
      console.log(
        `   🤖 Providers Used: ${specializedResults.aiProvidersUsed.join(", ")}`
      );
      console.log(
        `   ❌ Errors: ${
          specializedResults.errors.length > 0
            ? specializedResults.errors.join("; ")
            : "None"
        }`
      );

      // Approval logic
      const shouldApprove =
        specializedResults.bannedProductScore <= 0.5 &&
        specializedResults.vietnameseQualityScore >= 0.4;
      console.log(
        `   🎯 AI DECISION: ${
          shouldApprove ? "✅ SHOULD APPROVE" : "❌ SHOULD REJECT"
        }`
      );

      return specializedResults;
    } catch (error) {
      console.error(`   ❌ Specialized AI analysis failed: ${error.message}`);
    }

    // 4. Full Text Moderation
    console.log("\n📝 4. FULL TEXT MODERATION:");
    try {
      const textModResult = await moderateTextEnhanced(pinkDressText);
      console.log(
        `   📊 Text Score: ${(textModResult.score * 100).toFixed(1)}%`
      );
      console.log(`   ✅ Approved: ${textModResult.approved}`);
      console.log(`   🤖 AI Used: ${textModResult.aiUsed}`);
      if (textModResult.specializedAI) {
        console.log(
          `   🚫 Banned Score: ${(
            textModResult.specializedAI.bannedProductScore * 100
          ).toFixed(1)}%`
        );
        console.log(
          `   🇻🇳 Vietnamese Score: ${(
            textModResult.specializedAI.vietnameseQualityScore * 100
          ).toFixed(1)}%`
        );
      }
      console.log(
        `   📋 Reasons (first 3): ${textModResult.reasons
          .slice(0, 3)
          .join(" | ")}`
      );

      return textModResult;
    } catch (error) {
      console.error(`   ❌ Full text moderation failed: ${error.message}`);
    }
  } catch (error) {
    console.error(`❌ Overall test failed: ${error.message}`);
  }
}

// 🎯 MULTI-EXPERT AI ANALYSIS - 3 Chuyên gia + 1 Senior Moderator
// ❌ REMOVED OLD FUNCTION - Now using Enhanced Multi-Expert AI Analysis System

// 🧠 MULTI-EXPERT AI ANALYSIS SYSTEM (Enhanced Intelligence)
async function performSpecializedAIAnalysis(
  productName,
  productDescription,
  images
) {
  try {
    console.log("🧠 Starting Multi-Expert AI Analysis System...");

    const experts = {
      legal: null,
      contentQuality: null,
      imageAnalysis: null,
      seniorModerator: null,
    };

    // 🏛️ LEGAL & COMPLIANCE EXPERT
    const legalPrompt = `
Bạn là chuyên gia pháp lý & tuân thủ chính sách. Phân tích sản phẩm này:

TÊN: ${productName}
MÔ TẢ: ${productDescription}

NHIỆM VỤ:
1. Kiểm tra vi phạm pháp luật Việt Nam
2. Phát hiện hàng cấm, bất hợp pháp
3. Đánh giá rủi ro pháp lý

CÁC LOẠI HÀNG CẤM CHÍNH:
- Ma túy, chất cấm, thuốc kích dục
- Vũ khí, chất nổ, dao kiếm
- Hàng giả, hàng nhái, vi phạm bản quyền
- Thuốc điều trị, thiết bị y tế không phép
- Thuốc lá, rượu bia, chất có cồn
- Nội dung người lớn, đồ chơi tình dục
- Tài liệu bí mật, thông tin nhạy cảm
- Động vật hoang dã, sản phẩm từ động vật quý hiếm
- Hàng lậu, hàng không nguồn gốc

ĐÁNH GIÁ VỀ:
- riskLevel: "LOW", "MEDIUM", "HIGH", "CRITICAL"
- violationTypes: [] (nếu có vi phạm)
- recommendation: "APPROVE", "REJECT", "INVESTIGATE"
- confidence: 0.0-1.0
- reasoning: giải thích chi tiết

Trả về JSON format:
{
  "riskLevel": "...",
  "violationTypes": [...],
  "recommendation": "...",
  "confidence": 0.0,
  "reasoning": "..."
}`;

    // 🇻🇳 CONTENT QUALITY EXPERT
    const contentQualityPrompt = `
Bạn là chuyên gia chất lượng nội dung tiếng Việt. Phân tích tên và mô tả sản phẩm:

TÊN: ${productName}
MÔ TẢ: ${productDescription}

ĐÁNH GIÁ CHẤT LƯỢNG:
1. Tính rõ ràng, dễ hiểu của tên sản phẩm
2. Tính đầy đủ, chi tiết của mô tả
3. Ngữ pháp, chính tả tiếng Việt
4. Tính nhất quán giữa tên và mô tả
5. Có dấu hiệu spam, text rác không?

TIÊU CHÍ ĐÁNH GIÁ:
- Tên rõ ràng: có thể hiểu được sản phẩm gì không?
- Mô tả đầy đủ: có thông tin cần thiết (tình trạng, kích thước, màu sắc)?
- Ngôn ngữ chuẩn: không có quá nhiều lỗi chính tả/ngữ pháp
- Không spam: không phải text ngẫu nhiên hoặc copy-paste vô nghĩa

KẾT QUÀ:
- textQuality: "EXCELLENT", "GOOD", "FAIR", "POOR", "UNREADABLE"
- clarity: 0.0-1.0 (độ rõ ràng)
- completeness: 0.0-1.0 (độ đầy đủ)
- vietnameseGrammar: 0.0-1.0 (ngữ pháp tiếng Việt)
- consistency: 0.0-1.0 (tính nhất quán tên-mô tả)
- isSpam: true/false
- recommendation: "APPROVE", "REJECT", "NEEDS_IMPROVEMENT"
- issues: [] (danh sách vấn đề nếu có)
- reasoning: giải thích chi tiết

Trả về JSON format:
{
  "textQuality": "...",
  "clarity": 0.0,
  "completeness": 0.0,
  "vietnameseGrammar": 0.0,
  "consistency": 0.0,
  "isSpam": false,
  "recommendation": "...",
  "issues": [...],
  "reasoning": "..."
}`;

    // 🖼️ IMAGE ANALYSIS EXPERT
    const imageAnalysisPrompt = `
Bạn là chuyên gia phân tích hình ảnh sản phẩm. Phân tích độ phù hợp giữa hình ảnh và thông tin sản phẩm:

TÊN SẢN PHẨM: ${productName}
MÔ TẢ: ${productDescription}

NHIỆM VỤ PHÂN TÍCH:
1. Mô tả chi tiết những gì nhìn thấy trong từng hình ảnh
2. So sánh với tên và mô tả sản phẩm
3. Đánh giá độ khớp giữa hình ảnh và text
4. Phát hiện hình ảnh không phù hợp
5. Kiểm tra chất lượng ảnh (độ nét, góc chụp, ánh sáng)

ĐÁNH GIÁ:
- imageTextMatch: 0.0-1.0 (độ khớp hình ảnh - text)
- imageQuality: "EXCELLENT", "GOOD", "FAIR", "POOR"
- imageConsistency: 0.0-1.0 (tính nhất quán giữa các ảnh)
- inappropriate: true/false (có nội dung không phù hợp?)
- misrepresentation: true/false (hình ảnh có đánh lừa?)
- recommendation: "APPROVE", "REJECT", "NEEDS_REVIEW"
- detailedAnalysis: mô tả chi tiết từng ảnh
- inconsistencies: [] (danh sách không nhất quán nếu có)
- reasoning: giải thích chi tiết

Trả về JSON format:
{
  "imageTextMatch": 0.0,
  "imageQuality": "...",
  "imageConsistency": 0.0,
  "inappropriate": false,
  "misrepresentation": false,
  "recommendation": "...",
  "detailedAnalysis": "...",
  "inconsistencies": [...],
  "reasoning": "..."
}`;

    // Chạy song song các expert analysis
    const [legalResult, contentResult, imageResult] = await Promise.all([
      analyzeWithExpertAI(legalPrompt, "legal"),
      analyzeWithExpertAI(contentQualityPrompt, "contentQuality"),
      images && images.length > 0
        ? analyzeWithExpertAI(imageAnalysisPrompt, "imageAnalysis", images)
        : Promise.resolve({
            imageTextMatch: 0.5,
            imageQuality: "FAIR",
            imageConsistency: 1.0,
            inappropriate: false,
            misrepresentation: false,
            recommendation: "APPROVE",
            detailedAnalysis: "Không có hình ảnh để phân tích",
            inconsistencies: [],
            imageDescriptions: ["Sản phẩm không có hình ảnh"],
            overallConsistency: "Không có hình ảnh để đánh giá tính nhất quán",
            reasoning: "Sản phẩm không có hình ảnh",
          }),
    ]);

    experts.legal = legalResult;
    experts.contentQuality = contentResult;
    experts.imageAnalysis = imageResult;

    // 👨‍⚖️ SENIOR MODERATOR - ENHANCED DECISION MAKING
    const seniorModeratorPrompt = `
Bạn là Senior Moderator với kinh nghiệm lâu năm. Đưa ra quyết định cuối cùng dựa trên phân tích của 3 chuyên gia:

THÔNG TIN SẢN PHẨM:
- Tên: ${productName}
- Mô tả: ${productDescription}

PHÂN TÍCH CỦA CÁC CHUYÊN GIA:

🏛️ Legal Expert:
${JSON.stringify(experts.legal, null, 2)}

🇻🇳 Content Quality Expert:
${JSON.stringify(experts.contentQuality, null, 2)}

🖼️ Image Analysis Expert:
${JSON.stringify(experts.imageAnalysis, null, 2)}

🚨 NGUYÊN TẮC TỪ CHỐI NGAY LẬP TỨC (ZERO TOLERANCE):

🚫 REJECT IMMEDIATELY - BẮT BUỘC TỪ CHỐI khi:
1. **HÌNH ẢNH KHÔNG KHỚP SẢN PHẨM**:
   - misrepresentation = true (hình ảnh đánh lừa)
   - imageTextMatch < 0.3 (hình ảnh hoàn toàn không khớp)
   - imageConsistency < 0.4 (các ảnh không nhất quán về sản phẩm)
   - inconsistencies chứa "different product", "wrong item", "không liên quan"

2. **VI PHẠM PHÁP LUẬT NGHIÊM TRỌNG**:
   - riskLevel = "HIGH" hoặc "CRITICAL"
   - violationTypes có bất kỳ vi phạm nào

3. **NỘI DUNG SPAM/RÁC**:
   - isSpam = true
   - textQuality = "UNREADABLE" hoặc "POOR"
   - clarity < 0.2 (không thể hiểu được)

4. **NỘI DUNG KHÔNG PHÍCH HỢP**:
   - inappropriate = true (hình ảnh không phù hợp)

⚠️ NGUYÊN TẮC ĐẶC BIỆT - HÌNH ẢNH:
- NẾU CÓ HÌNH ẢNH: Bắt buộc phải khớp với tên + mô tả sản phẩm
- NẾU KHÔNG CÓ HÌNH ẢNH: Chấp nhận được nếu text chất lượng tốt
- NẾU HÌNH ẢNH SAI SẢN PHẨM: TỪ CHỐI NGAY, không cần xem xét thêm

✅ APPROVE (CHẤP NHẬN) - Chỉ khi:
- Rủi ro pháp lý LOW
- Content quality từ FAIR trở lên  
- Không có hình ảnh HOẶC hình ảnh khớp tốt (imageTextMatch >= 0.6)
- Không có vi phạm nghiêm trọng nào
- imageConsistency >= 0.6 (nếu có nhiều ảnh)

🔍 NEEDS_REVIEW (CẦN XEM XÉT) - Chỉ khi:
- Rủi ro MEDIUM nhưng không có misrepresentation
- Content quality FAIR với một số vấn đề nhỏ
- imageTextMatch từ 0.3-0.6 (vùng xám, cần admin đánh giá)
- Không rõ ràng nhưng không có dấu hiệu gian lận

🎯 QUY TẮC QUYẾT ĐỊNH NGHIÊM NGẶT:
1. Ưu tiên bảo vệ người mua → từ chối khi nghi ngờ
2. Hình ảnh sai sản phẩm = gian lận = TỪ CHỐI NGAY
3. Khi không chắc chắn về hình ảnh → NEEDS_REVIEW (không APPROVE)
4. Chỉ APPROVE khi chắc chắn sản phẩm đáng tin cậy

KẾT QUẢ CUỐI CÙNG:
- decision: "APPROVE", "REJECT", "NEEDS_REVIEW" 
- confidence: 0.0-1.0
- overallScore: 0.0-1.0
- keyFactors: [] (các yếu tố quyết định chính)
- recommendations: [] (khuyến nghị nếu có)
- reasoning: giải thích chi tiết lý do quyết định bằng Tiếng Việt (đặc biệt nếu REJECT vì hình ảnh sai)

Trả về JSON format:
{
  "decision": "...",
  "confidence": 0.0,
  "overallScore": 0.0,
  "keyFactors": [...],
  "recommendations": [...],
  "reasoning": "..."
}`;

    experts.seniorModerator = await analyzeWithExpertAI(
      seniorModeratorPrompt,
      "seniorModerator",
      images
    );

    // 📊 Compile final analysis result - FIX: Ensure numeric values
    const analysisResult = {
      timestamp: new Date().toISOString(),
      experts: experts,
      finalDecision: experts.seniorModerator?.decision || "NEEDS_REVIEW",
      confidence: parseFloat(experts.seniorModerator?.confidence) || 0.3,
      overallScore: parseFloat(experts.seniorModerator?.overallScore) || 0.5,
      reasoning:
        experts.seniorModerator?.reasoning || "Không thể phân tích đầy đủ",
      keyFactors: experts.seniorModerator?.keyFactors || [],
      recommendations: experts.seniorModerator?.recommendations || [],
    };

    console.log(
      `🎯 Final Decision: ${analysisResult.finalDecision} (Confidence: ${analysisResult.confidence})`
    );

    return analysisResult;
  } catch (error) {
    console.error("❌ Error in Multi-Expert AI Analysis:", error);
    return {
      timestamp: new Date().toISOString(),
      finalDecision: "NEEDS_REVIEW",
      confidence: 0.1,
      overallScore: 0.3,
      reasoning: `Lỗi phân tích AI: ${error.message}`,
      keyFactors: ["AI_ANALYSIS_ERROR"],
      recommendations: ["Cần admin review thủ công"],
      experts: {
        legal: null,
        contentQuality: null,
        imageAnalysis: null,
        seniorModerator: null,
      },
    };
  }
}

module.exports = {
  // 🎯 MAIN FUNCTIONS - Multi-Expert AI System
  processEnhancedAIModerationBackground,
  performSpecializedAIAnalysis,

  // 🔧 QUEUE & SYSTEM MANAGEMENT
  addToModerationQueue,
  getModerationSystemHealth,
  validateAPIKeys,
  testAPIKeys,

  // 🇻🇳 CORE AI ANALYSIS FUNCTIONS
  analyzeContentWithGeminiUnified,
  analyzeImageWithGeminiVision,
  analyzeImagesWithCustomPrompt, // 🖼️ Enhanced Image Analysis for Multi-Expert System
  getImageAsBase64,

  // 📊 ANALYSIS HELPER FUNCTIONS
  calculateImageTextMatch,
  checkImageConsistency,
  detectBannedProduct,
  validateProductWeight,
  estimateProductWeight, // 🤖 AI Weight Estimation

  // 🔤 TEXT QUALITY ASSESSMENT
  detectGarbledText,
  detectTyposAndErrors,
  assessVietnameseCoherence,
  assessReadability,
  assessVietnameseReadability,

  // ⚙️ CONFIGURATION & ADMIN
  MODERATION_CONFIG,
  setStrictMode,
  getCurrentConfig,

  // 🧪 TESTING & DEBUGGING
  testProductModerationDetailed,
  testBannedProductDetection,
  testPinkDressWithAI,

  // 🎯 MULTI-EXPERT AI ANALYSIS - 3 Chuyên gia + 1 Senior Moderator
  // ❌ REMOVED OLD FUNCTION - Now using Enhanced Multi-Expert AI Analysis System
};
