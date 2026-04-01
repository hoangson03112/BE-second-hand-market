const Message = require("../../models/Message");
const Account = require("../../models/Account");
const Conversation = require("../../models/Conversation");
const Product = require("../../models/Product");
const SearchQueryLog = require("../../models/SearchQueryLog");
const mongoose = require("mongoose");
const { uploadMultipleToCloudinary } = require("../../utils/CloudinaryUpload");
const { searchProductsInMeili } = require("../../services/productSearchIndex.service");
const SearchHelpers = require("./chatSearch.helpers");
const { MESSAGES } = require("../../utils/messages");

// Helper function to create ObjectId safely
const createObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.createFromHexString(id);
};

const DEFAULT_SEARCH_METRICS_LIMIT = 20;
const MAX_SEARCH_METRICS_LIMIT = 100;
const TOP_QUERIES_LIMIT = 20;

function parsePositiveInt(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function roundedRatio(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function countClicksInTopK(clickRankMap, k) {
  let count = 0;
  for (const [rank, clicks] of clickRankMap.entries()) {
    if (rank <= k) count += clicks;
  }
  return count;
}

class ChatController {
  async searchProductsByAI(req, res) {
    try {
      const userMessage = String(
        req.body?.userMessage || req.body?.query || "",
      ).trim();
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

      // Single clean flow:
      // normalize -> slang map -> budget parse -> meili search variants -> rerank -> fallback.
      const normalized = SearchHelpers.normalizeForMatch(userMessage);
      const mappedQuery = SearchHelpers.mapSlang(normalized);

      const parsedIntent = {
        keyword: mappedQuery || normalized || userMessage,
        filters: { minPrice: null, maxPrice: null, condition: null },
      };
      parsedIntent.keyword = SearchHelpers.normalizeForMatch(parsedIntent.keyword);
      const budget = SearchHelpers.parseBudgetFromQuery(parsedIntent.keyword);
      const keywordWithoutBudget = SearchHelpers.stripBudgetTerms(parsedIntent.keyword);
      if (keywordWithoutBudget) {
        parsedIntent.keyword = keywordWithoutBudget;
      }
      if (Number.isFinite(budget.minPrice)) parsedIntent.filters.minPrice = budget.minPrice;
      if (Number.isFinite(budget.maxPrice)) parsedIntent.filters.maxPrice = budget.maxPrice;

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

      const queryVariants = SearchHelpers.buildSearchQueryVariants(
        parsedIntent.keyword,
        userMessage,
      );
      const meiliMerged = new Map();
      const meiliVariantLimit = Math.max(limit * 4, 24);
      for (const [vIdx, variant] of queryVariants.entries()) {
        const variantHits = await searchProductsInMeili({
          keyword: variant,
          filters: parsedIntent.filters,
          limit: meiliVariantLimit,
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
        .slice(0, meiliVariantLimit);

      // 7) Fallback nếu Meilisearch rỗng: thử lại chỉ với keyword (không filter)
      if (meiliHits.length === 0) {
        const fallbackKeyword = SearchHelpers.normalizeForMatch(
          mappedQuery || normalized || userMessage,
        );
        meiliHits = await searchProductsInMeili({
          keyword: fallbackKeyword,
          filters: {},
          limit,
        }).catch(() => []);
      }

      const keywordTokens = SearchHelpers.extractKeywordTokens(parsedIntent.keyword);
      let mustPhrases = [SearchHelpers.normalizeForMatch(parsedIntent.keyword)].filter(
        (v) => v.length >= 3,
      );
      if (keywordTokens.length <= 1) mustPhrases = [];

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
            SearchHelpers.isProductRelevantByIntent(item, keywordTokens, mustPhrases),
          )
          .sort(
            (a, b) =>
              (SearchHelpers.phraseAnyMatch(b, mustPhrases) ? 1 : 0) -
                (SearchHelpers.phraseAnyMatch(a, mustPhrases) ? 1 : 0) ||
              SearchHelpers.lexicalScoreFromTokens(b, keywordTokens) -
                SearchHelpers.lexicalScoreFromTokens(a, keywordTokens),
          )
          .slice(0, limit);
      } else {
        // Token fallback in-memory: tránh regex Mongo bị miss chữ có dấu.
        const fallbackTokens = SearchHelpers.extractKeywordTokens(
          parsedIntent.keyword || userMessage,
        );
        const fallbackDocs = await Product.find(mongoFilter)
          .select(productProjection)
          .sort({ createdAt: -1 })
          .limit(Math.max(limit * 20, 120))
          .lean();

        products = fallbackDocs
          .filter((p) =>
            SearchHelpers.isProductRelevantByIntent(p, keywordTokens, mustPhrases),
          )
          .slice(0, limit);
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
      const finalTokens = SearchHelpers.extractKeywordTokens(parsedIntent.keyword);
      const strongFinalTokens = finalTokens.filter((t) => t.length >= 3);
      const tokensForFinalGate = strongFinalTokens.length > 0 ? strongFinalTokens : finalTokens;
      const finalPhrase = SearchHelpers.normalizeForMatch(parsedIntent.keyword);
      if (products.length > 0 && tokensForFinalGate.length > 0) {
        products = products.filter((item) => {
          const text = SearchHelpers.normalizeForMatch(
            `${item?.name || ""} ${item?.description || ""}`,
          );
          const matched = tokensForFinalGate.filter((t) => text.includes(t)).length;

          if (tokensForFinalGate.length === 1) return matched >= 1;
          if (tokensForFinalGate.length === 2) {
            return matched === 2 || text.includes(finalPhrase);
          }
          return matched / tokensForFinalGate.length >= 0.6 || text.includes(finalPhrase);
        });
      }

      // Hard rescue: nếu vẫn rỗng, quét rộng Mongo rồi lọc theo intent để giảm false-negative.
      if (products.length === 0 && finalTokens.length > 0) {
        const rescueDocs = await Product.find(mongoFilter)
          .select(productProjection)
          .sort({ createdAt: -1 })
          .limit(300)
          .lean();

        products = rescueDocs
          .filter((item) =>
            SearchHelpers.isProductRelevantByIntent(item, finalTokens, mustPhrases),
          )
          .sort(
            (a, b) =>
              SearchHelpers.lexicalScoreFromTokens(b, finalTokens) -
              SearchHelpers.lexicalScoreFromTokens(a, finalTokens),
          )
          .slice(0, limit);
      }

      // 8) (optional) Rerank đã làm ở phần lọc/sort products phía trên.
      // Tắt Gemini chat response để tránh 429 quota và tập trung vào kết quả search.
      const answer =
        products.length > 0
          ? `Mình tìm thấy ${products.length} sản phẩm phù hợp. Bạn xem thử các gợi ý bên dưới nhé.`
          : "Mình chưa tìm thấy sản phẩm phù hợp. Bạn thử mô tả cụ thể hơn về tên hoặc mức giá sản phẩm.";

      let searchLogId = null;
      try {
        const searchLog = await SearchQueryLog.create({
          userId: req.accountID,
          queryRaw: userMessage,
          queryNormalized: parsedIntent.keyword,
          filters: parsedIntent.filters,
          resultProductIds: products.map((p) => p._id),
        });
        searchLogId = String(searchLog._id);
      } catch (logError) {
        console.error("[AI Product Search] Failed to write search log:", logError.message);
      }

      return res.status(200).json({
        answer,
        products,
        data: products,
        meta: { searchLogId },
      });
    } catch (error) {
      console.error("[AI Product Search] Error:", error);

      return res.status(500).json({
        answer: MESSAGES.SERVER_ERROR,
        products: [],
      });
    }
  }

  async trackSearchClick(req, res) {
    try {
      const searchLogId = String(req.body?.searchLogId || "").trim();
      const productId = String(req.body?.productId || "").trim();
      const rank = Number.parseInt(String(req.body?.rank ?? ""), 10);

      if (
        !mongoose.Types.ObjectId.isValid(searchLogId) ||
        !mongoose.Types.ObjectId.isValid(productId)
      ) {
        return res.status(400).json({
          success: false,
          message: "searchLogId hoặc productId không hợp lệ.",
        });
      }

      const updated = await SearchQueryLog.findByIdAndUpdate(
        searchLogId,
        {
          $set: {
            clickedProductId: productId,
            clickedRank: Number.isFinite(rank) ? rank : null,
            clickedAt: new Date(),
          },
        },
        { new: true },
      ).lean();

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy search log.",
        });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[AI Product Search] trackSearchClick error:", error);
      return res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  async getSearchMetrics(req, res) {
    try {
      const page = parsePositiveInt(req.query?.page, 1);
      const limit = Math.min(
        MAX_SEARCH_METRICS_LIMIT,
        parsePositiveInt(req.query?.limit, DEFAULT_SEARCH_METRICS_LIMIT),
      );
      const skip = (page - 1) * limit;

      const [totalSearches, clickedSearches, logs, topQueriesAgg, clicksByRank] =
        await Promise.all([
          SearchQueryLog.countDocuments({}),
          SearchQueryLog.countDocuments({ clickedProductId: { $ne: null } }),
          SearchQueryLog.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select(
              "queryRaw queryNormalized resultProductIds clickedProductId clickedRank createdAt",
            )
            .lean(),
          SearchQueryLog.aggregate([
            {
              $group: {
                _id: "$queryNormalized",
                total: { $sum: 1 },
                clicked: {
                  $sum: {
                    $cond: [{ $ne: ["$clickedProductId", null] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { total: -1 } },
            { $limit: TOP_QUERIES_LIMIT },
          ]),
          SearchQueryLog.aggregate([
            { $match: { clickedRank: { $ne: null } } },
            { $group: { _id: "$clickedRank", count: { $sum: 1 } } },
          ]),
        ]);

      const clickRankMap = new Map(
        clicksByRank.map((item) => [Number(item._id), Number(item.count)]),
      );
      const precisionAt = (k) =>
        roundedRatio(countClicksInTopK(clickRankMap, k), totalSearches);
      const recallAt = (k) =>
        roundedRatio(countClicksInTopK(clickRankMap, k), clickedSearches || 1);

      return res.status(200).json({
        success: true,
        summary: {
          totalSearches,
          clickedSearches,
          ctr: roundedRatio(clickedSearches, totalSearches),
          proxyTopK: {
            precisionAt1: precisionAt(1),
            precisionAt3: precisionAt(3),
            precisionAt5: precisionAt(5),
            recallAt1: recallAt(1),
            recallAt3: recallAt(3),
            recallAt5: recallAt(5),
          },
        },
        topQueries: topQueriesAgg.map((q) => ({
          query: q._id,
          total: q.total,
          clicked: q.clicked,
          ctr: roundedRatio(q.clicked, q.total),
        })),
        data: logs,
        pagination: {
          page,
          limit,
          total: totalSearches,
          totalPages: Math.ceil(totalSearches / limit),
        },
      });
    } catch (error) {
      console.error("[AI Product Search] getSearchMetrics error:", error);
      return res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
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
