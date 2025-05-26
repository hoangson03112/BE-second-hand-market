const express = require("express");
const initializeRoutes = require("./routes");
const db = require("./config/db");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const server = http.createServer(app);
const { initializeSocket } = require("./services/socket");
const config = require("../config/env");
const logger = require("./utils/logger");
const { SessionsClient } = require("@google-cloud/dialogflow");
const { v4: uuidv4 } = require("uuid");
const Product = require("./models/Product");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");
const verifyToken = require("./middleware/verifyToken");
const Category = require("./models/category");

// Initialize socket.io
const io = initializeSocket(server);

// Make socket.io instance available to Express
app.set("io", io.instance);
app.set("userSocketMap", io.userSocketMap);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Configure CORS
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
  })
);

// Connect to database
db.connect();

app.use(express.json({ extended: true }));
app.use(cookieParser());

// Initialize routes
initializeRoutes(app);
const projectId = process.env.DIALOGFLOW_PROJECT_ID;
// GOOGLE_APPLICATION_CREDENTIALS sẽ được thư viện tự động đọc từ biến môi trường
let sessionClient;
try {
  sessionClient = new SessionsClient();
  console.log("Dialogflow Session Client initialized successfully.");
} catch (e) {
  console.error(
    "Lỗi khởi tạo Dialogflow Session Client. Kiểm tra GOOGLE_APPLICATION_CREDENTIALS:",
    e
  );
}

// ---- Helper function để chuyển đổi Struct từ Dialogflow ----
function convertDialogflowStructToPlainObject(struct) {
  if (!struct || !struct.fields) return null;
  const obj = {};
  for (const key in struct.fields) {
    const field = struct.fields[key];
    if (field.stringValue) obj[key] = field.stringValue;
    else if (field.numberValue) obj[key] = field.numberValue;
    else if (field.boolValue) obj[key] = field.boolValue;
    else if (field.structValue)
      obj[key] = convertDialogflowStructToPlainObject(field.structValue);
    else if (field.listValue)
      obj[key] = convertDialogflowListToPlainArray(field.listValue);
    else if (field.nullValue !== undefined) obj[key] = null;
  }
  return obj;
}
function convertDialogflowListToPlainArray(listValue) {
  if (!listValue || !listValue.values) return [];
  return listValue.values.map((value) => {
    if (value.stringValue) return value.stringValue;
    if (value.numberValue) return value.numberValue;
    if (value.boolValue) return value.boolValue;
    if (value.structValue)
      return convertDialogflowStructToPlainObject(value.structValue);
    if (value.listValue)
      return convertDialogflowListToPlainArray(value.listValue);
    return null;
  });
}

// Hàm tiện ích cho việc chuyển đổi tiền tệ tiếng Việt
const convertVietnameseMoney = (amount, unit) => {
  const unitMap = {
    nghìn: 1e3,
    ngàn: 1e3,
    triệu: 1e6,
    tỷ: 1e9,
    tỉ: 1e9,
    k: 1e3,
    m: 1e6,
    b: 1e9,
    đồng: 1,
    vnd: 1,
  };
  return amount * (unitMap[(unit || "").toLowerCase()] || 1);
};

// Hàm chuẩn hóa văn bản
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Tính điểm tương đồng giữa hai chuỗi
const calculateSimilarity = (str1, str2) => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const max = Math.max(s1.length, s2.length);
  if (max === 0) return 1.0;

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s2.includes(s1[i])) matches++;
  }

  return matches / max;
};

// Format sản phẩm cho phản hồi
const formatProductForResponse = (p, executionTime) => ({
  id: p._id.toString(),
  title: p.name,
  subtitle: `Giá: ${Number(p.price).toLocaleString("vi-VN")}đ`,
  link: `/san-pham/${p.slug || p._id.toString()}`,
  imageUrl: p.imageUrl || p.avatar,
  categoryId: p.categoryId,
  brand: p.brand,
  color: p.color,
  executionTime,
});

// Tạo thông báo từ kết quả tìm kiếm
const createResponseMessage = (products, searchParams, relaxed = false) => {
  if (products.length === 0) return null;

  let message = relaxed
    ? `Tôi không tìm thấy kết quả chính xác, nhưng đây là ${products.length} sản phẩm tương tự có thể bạn quan tâm`
    : `Đây là ${products.length} sản phẩm tôi tìm thấy`;

  if (searchParams.textSearchTerms.length > 0) {
    message += ` cho "${searchParams.textSearchTerms.join(" ")}"`;
  }

  if (searchParams.minPrice || searchParams.maxPrice) {
    message += ` trong khoảng giá ${
      searchParams.minPrice
        ? `từ ${Number(searchParams.minPrice).toLocaleString("vi-VN")}đ `
        : ""
    }${
      searchParams.maxPrice
        ? `đến ${Number(searchParams.maxPrice).toLocaleString("vi-VN")}đ`
        : ""
    }`;
  }

  return message;
};

// ---- 1. Endpoint Proxy (Frontend gọi đến) ----
app.post(
  "/eco-market/chat/send-message-with-AI",
  verifyToken,
  async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Thiếu message" });
    }
    let conversation = await Conversation.findOne({
      participants: { $all: [req.accountID] },
    });
    if (!conversation) {
      const newConversationWithAI = new Conversation({
        participants: [req.accountID],
      });
      await newConversationWithAI.save();
      conversation = newConversationWithAI;
    }

    const newMessage = new Message({
      conversationId: conversation._id,
      senderId: req.accountID,
      text: message,
      type: "text",
    });
    await newMessage.save();
    const sessionId = conversation._id;

    if (!sessionClient) {
      return res
        .status(500)
        .json({ error: "Dialogflow client chưa được khởi tạo." });
    }

    const sessionPath = sessionClient.projectAgentSessionPath(
      projectId,
      sessionId
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: "vi-VN",
        },
      },
    };

    try {
      const [dialogflowResponse] = await sessionClient.detectIntent(request);
      const result = dialogflowResponse.queryResult;

      let customPayload = null;
      if (result.fulfillmentMessages && result.fulfillmentMessages.length > 0) {
        const payloadMessage = result.fulfillmentMessages.find(
          (msg) =>
            msg.payload && msg.payload.fields && msg.payload.fields.customData // Tìm payload có key là "customData"
        );
        if (payloadMessage) {
          // payloadMessage.payload.fields.customData.structValue chứa dữ liệu bạn gửi từ webhook
          customPayload = convertDialogflowStructToPlainObject(
            payloadMessage.payload.fields.customData.structValue
          );
        }
      }

      res.json({
        sessionId: sessionId,
        reply: result.fulfillmentText,
        intentName: result.intent ? result.intent.displayName : null,
        parameters: result.parameters
          ? convertDialogflowStructToPlainObject(result.parameters)
          : null,
        payload: customPayload,
      });
    } catch (error) {
      console.error("Lỗi khi gọi Dialogflow detectIntent:", error);
      res.status(500).json({
        error: "Không thể xử lý yêu cầu với Dialogflow.",
        details: error.message,
      });
    }
  }
);

// ---- 2. Endpoint Webhook (Dialogflow gọi đến) ----
app.post("/eco-market/chat/dialogflow-webhook", async (req, res) => {
  const intentName = req.body.queryResult.intent.displayName;
  const parameters = req.body.queryResult.parameters;
  let fulfillmentText = "Xin lỗi, tôi chưa hiểu ý bạn từ webhook.";
  let customPayloadForFrontend = null;

  if (intentName === "TimKiemSanPham") {
    try {
      const startTime = Date.now();

      // Trích xuất tham số tìm kiếm
      const productName = parameters.productName || "";
      const productCategories = parameters.loai_san_pham || [];
      const brand = parameters.productName.brand || "";
      const colors = parameters.productName.color || [];
      const priceInfo = parameters.productName.price || [];

      // Khởi tạo tham số tìm kiếm
      const searchParams = {
        exactTerms: [],
        textSearchTerms: [],
        productName,
        categories: productCategories,
        brand,
        colors,
        status: "active",
        limit: 5,
      };

      // 1. Xử lý tên sản phẩm
      if (productName) {
        const normalizedProductName = normalizeText(productName);
        const words = normalizedProductName
          .split(/\s+/)
          .filter((w) => w.length > 2);

        searchParams.exactTerms.push(productName);
        words.forEach((word) => searchParams.textSearchTerms.push(word));
      }

      // 2. Xử lý loại sản phẩm
      if (productCategories.length > 0) {
        const categoryNames = [];
        productCategories.forEach((category) => {
          if (category) {
            categoryNames.push(category);
            searchParams.textSearchTerms.push(category);
          }
        });
        searchParams.categoryNames = categoryNames;
      }

      // 3. Xử lý thương hiệu
      if (brand) {
        searchParams.exactTerms.push(brand);
        searchParams.textSearchTerms.push(brand);
      }

      // 4. Xử lý màu sắc
      if (colors.length > 0) {
        searchParams.colors = colors;
      }

      // 5. Xử lý giá tiền
      if (priceInfo.length > 0) {
        const priceValues = priceInfo
          .map((p) =>
            p.amount && p.unit ? convertVietnameseMoney(p.amount, p.unit) : null
          )
          .filter((p) => p !== null);

        if (priceValues.length === 1) {
          searchParams.maxPrice = priceValues[0];
        } else if (priceValues.length >= 2) {
          searchParams.minPrice = Math.min(...priceValues);
          searchParams.maxPrice = Math.max(...priceValues);
        }
      }

      // Xây dựng MongoDB query
      const mongoQuery = { status: searchParams.status };
      const exactMatchConditions = [];

      // Full-text search
      if (searchParams.textSearchTerms.length > 0) {
        mongoQuery.$text = { $search: searchParams.textSearchTerms.join(" ") };
      }

      // Tìm kiếm chính xác trong tên sản phẩm
      if (searchParams.productName) {
        exactMatchConditions.push({
          name: { $regex: searchParams.productName, $options: "i" },
        });
      }

      // Thương hiệu
      if (searchParams.brand) {
        mongoQuery.brand = { $regex: searchParams.brand, $options: "i" };
      }

      // Danh mục sản phẩm
      if (searchParams.categoryNames && searchParams.categoryNames.length > 0) {
        try {
          const categories = await Category.find({
            name: {
              $in: searchParams.categoryNames.map(
                (name) => new RegExp(name, "i")
              ),
            },
          }).select("_id");

          if (categories.length > 0) {
            const categoryIds = categories.map((c) => c._id);
            mongoQuery.categoryId = { $in: categoryIds };
          } else {
            searchParams.categoryNames.forEach((catName) => {
              exactMatchConditions.push({
                name: { $regex: catName, $options: "i" },
              });
            });
          }
        } catch (error) {
          console.error("Error finding categories:", error);
          searchParams.categoryNames.forEach((catName) => {
            exactMatchConditions.push({
              name: { $regex: catName, $options: "i" },
            });
          });
        }
      }

      // Thêm các điều kiện tìm kiếm chính xác
      if (exactMatchConditions.length > 0) {
        mongoQuery.$or = [...(mongoQuery.$or || []), ...exactMatchConditions];
      }

      // Màu sắc
      if (searchParams.colors && searchParams.colors.length > 0) {
        mongoQuery.color = { $in: searchParams.colors };
      }

      // Khoảng giá
      if (
        searchParams.minPrice !== undefined ||
        searchParams.maxPrice !== undefined
      ) {
        mongoQuery.price = {};
        if (searchParams.minPrice !== undefined)
          mongoQuery.price.$gte = Number(searchParams.minPrice);
        if (searchParams.maxPrice !== undefined)
          mongoQuery.price.$lte = Number(searchParams.maxPrice);
      }

      // Chuẩn bị tham số tìm kiếm
      const sortOptions = mongoQuery.$text
        ? { score: { $meta: "textScore" } }
        : { isPopular: -1, viewCount: -1 };

      const projection = mongoQuery.$text
        ? { score: { $meta: "textScore" } }
        : {};

      // Log điều kiện truy vấn để debug
      console.log(
        "MongoDB Query:",
        JSON.stringify(
          {
            text_search: mongoQuery.$text ? "Enabled" : "Disabled",
            name_regex: mongoQuery.$or ? "Enabled" : "Disabled",
            query: mongoQuery,
          },
          null,
          2
        )
      );

      // Thực thi truy vấn chính

      const products = await Product.find({ name: parameters.loai_san_pham[0] })
        .sort(sortOptions)
        .limit(searchParams.limit);
      console.log("products", products);
      let resultProducts = products;

      // TÌM KIẾM LINH HOẠT nếu không có kết quả
      if (products.length === 0 && productName) {
        // 1. Thử với regex linh hoạt
        const flexWords = productName.trim().split(/\s+/);
        const flexPattern = flexWords.join(".*");

        const flexProducts = await Product.find({
          name: { $regex: flexPattern, $options: "i" },
          status: "active",
        })
          .sort({ name: 1 })
          .limit(searchParams.limit)
          .select("_id name price imageUrl avatar slug categoryId brand color");

        if (flexProducts.length > 0) {
          resultProducts = flexProducts;
        } else {
          // 2. Thử với tìm kiếm nới lỏng (chỉ giữ text search)
          const relaxedQuery = {
            status: searchParams.status,
            ...(searchParams.textSearchTerms.length > 0 && {
              $text: { $search: searchParams.textSearchTerms.join(" ") },
            }),
          };

          const relaxedProducts = await Product.find(relaxedQuery, projection)
            .sort(sortOptions)
            .limit(searchParams.limit)
            .select(
              "_id name price imageUrl avatar slug categoryId brand color"
            );

          if (relaxedProducts.length > 0) {
            resultProducts = relaxedProducts;
            fulfillmentText = createResponseMessage(
              relaxedProducts,
              searchParams,
              true
            );
          }
          // 3. Tìm kiếm bằng điểm tương đồng nếu vẫn không có kết quả
          else {
            const allActiveProducts = await Product.find({ status: "active" })
              .select(
                "_id name price imageUrl avatar slug categoryId brand color"
              )
              .limit(100); // Giới hạn số lượng để tối ưu hiệu suất

            const scoredProducts = allActiveProducts.map((product) => {
              const similarity = calculateSimilarity(product.name, productName);
              return { ...product.toObject(), similarity };
            });

            const similarProducts = scoredProducts
              .filter((p) => p.similarity > 0.5)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, searchParams.limit);

            if (similarProducts.length > 0) {
              resultProducts = similarProducts;
              fulfillmentText = `Đây là ${similarProducts.length} sản phẩm tương tự với "${productName}"`;
            } else {
              fulfillmentText = `Rất tiếc, tôi không tìm thấy sản phẩm nào phù hợp với "${productName}". Bạn có thể thử tìm kiếm với tiêu chí khác không?`;
            }
          }
        }
      } else if (products.length > 0) {
        // Có kết quả từ tìm kiếm chính
        fulfillmentText = createResponseMessage(products, searchParams);
      } else {
        // Không có kết quả và không có productName
        fulfillmentText =
          "Rất tiếc, tôi không tìm thấy sản phẩm phù hợp. Bạn có thể thử tìm kiếm với tiêu chí khác không?";
      }

      // Nếu tìm được sản phẩm, tạo payload trả về
      if (resultProducts && resultProducts.length > 0) {
        const executionTime = Date.now() - startTime;
        customPayloadForFrontend = {
          type: "productList",
          items: resultProducts.map((p) =>
            formatProductForResponse(p, executionTime)
          ),
        };
      }
    } catch (dbError) {
      console.error("Webhook - Lỗi truy vấn MongoDB:", dbError);
      fulfillmentText =
        "Đã có lỗi xảy ra khi tìm kiếm sản phẩm. Vui lòng thử lại sau.";
    }
  }

  // Chuẩn bị phản hồi
  const responseJson = {
    fulfillmentText: fulfillmentText,
  };

  // Thêm payload tùy chỉnh nếu có
  if (customPayloadForFrontend) {
    responseJson.fulfillmentMessages = [
      {
        payload: {
          customData: customPayloadForFrontend,
        },
      },
    ];
  }

  // Trả về kết quả
  res.json(responseJson);
});

// Start server
const PORT = config.PORT;
server.listen(PORT, () =>
  logger.info(`Server + Socket.IO running on port ${PORT}`)
);
