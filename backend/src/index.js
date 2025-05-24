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
      console.log("Dialogflow Raw Response:", JSON.stringify(result, null, 2));

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

  // Hàm chuyển đổi giá trị tiền tệ Việt Nam
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

    // Xử lý trường hợp không có đơn vị
    if (!unit) return amount;

    // Chuẩn hóa đơn vị về chữ thường
    unit = unit.toLowerCase();

    // Kiểm tra và chuyển đổi
    return amount * (unitMap[unit] || 1);
  };

  if (intentName === "TimKiemSanPham") {
    let searchTerm = "";
    let priceRange = {};

    // Xử lý chuyển đổi giá tiền nếu có
    if (parameters.gia_tien) {
      const moneyValue = parameters.gia_tien;
      if (moneyValue.amount && moneyValue.unit) {
        const numericValue = convertVietnameseMoney(
          moneyValue.amount,
          moneyValue.unit
        );
        priceRange = { $lte: numericValue }; // Mặc định là giá tối đa
      }
    }

    // Xử lý khoảng giá nếu có
    if (parameters.gia_toi_thieu || parameters.gia_toi_da) {
      priceRange = {};
      if (parameters.gia_toi_thieu) {
        priceRange.$gte = convertVietnameseMoney(
          parameters.gia_toi_thieu,
          parameters.gia_toi_thieu_unit
        );
      }
      if (parameters.gia_toi_da) {
        priceRange.$lte = convertVietnameseMoney(
          parameters.gia_toi_da,
          parameters.gia_toi_da_unit
        );
      }
    }

    // Mở rộng thu thập nhiều tham số từ câu chat người dùng
    if (parameters.ten_san_pham) searchTerm += parameters.ten_san_pham + " ";
    if (parameters.loai_san_pham) searchTerm += parameters.loai_san_pham + " ";
    if (parameters.thuong_hieu) searchTerm += parameters.thuong_hieu + " ";
    if (parameters.mau_sac) searchTerm += parameters.mau_sac + " ";
    if (parameters.mo_ta) searchTerm += parameters.mo_ta + " ";

    searchTerm = searchTerm.trim();

    if (searchTerm || Object.keys(priceRange).length > 0) {
      try {
        console.log(
          `Webhook searching MongoDB for: "${searchTerm}" with price range:`,
          priceRange
        );

        // Xây dựng query linh hoạt
        const query = {};

        if (searchTerm) {
          query.$text = { $search: searchTerm };
        }

        if (Object.keys(priceRange).length > 0) {
          query.price = priceRange;
        }

        // Lọc theo danh mục cụ thể nếu có
        if (parameters.danh_muc) {
          query.category = parameters.danh_muc;
        }

        const products = await Product.find(query, {
          score: { $meta: searchTerm ? "textScore" : undefined },
        })
          .sort(searchTerm ? { score: { $meta: "textScore" } } : {})
          .limit(5)
          .select("name price imageUrl slug category brand");

        if (products.length > 0) {
          customPayloadForFrontend = {
            type: "productList",
            items: products.map((p) => ({
              id: p._id.toString(),
              title: p.name,
              subtitle: `Giá: ${Number(p.price).toLocaleString("vi-VN")}đ`,
              link: `/san-pham/${p.slug || p._id.toString()}`,
              imageUrl: p.imageUrl,
              category: p.category,
              brand: p.brand,
            })),
          };

          fulfillmentText = `Đây là ${products.length} sản phẩm tôi tìm thấy`;
          if (searchTerm) fulfillmentText += ` cho "${searchTerm}"`;
          if (Object.keys(priceRange).length > 0) {
            fulfillmentText += ` trong khoảng giá ${
              priceRange.$gte
                ? `từ ${priceRange.$gte.toLocaleString("vi-VN")}đ `
                : ""
            }${
              priceRange.$lte
                ? `đến ${priceRange.$lte.toLocaleString("vi-VN")}đ`
                : ""
            }`;
          }
        } else {
          fulfillmentText = `Rất tiếc, tôi không tìm thấy sản phẩm nào`;
          if (searchTerm) fulfillmentText += ` cho "${searchTerm}"`;
          if (Object.keys(priceRange).length > 0) {
            fulfillmentText += ` trong khoảng giá ${
              priceRange.$gte
                ? `từ ${priceRange.$gte.toLocaleString("vi-VN")}đ `
                : ""
            }${
              priceRange.$lte
                ? `đến ${priceRange.$lte.toLocaleString("vi-VN")}đ`
                : ""
            }`;
          }
          fulfillmentText +=
            ". Bạn có thể thử tìm kiếm với tiêu chí khác không?";
        }
      } catch (dbError) {
        console.error("Webhook - Lỗi truy vấn MongoDB:", dbError);
        fulfillmentText =
          "Đã có lỗi xảy ra khi tìm kiếm sản phẩm. Vui lòng thử lại sau.";
      }
    } else {
      fulfillmentText =
        "Bạn đang tìm sản phẩm gì? Vui lòng cho tôi biết tên, loại hoặc thương hiệu sản phẩm bạn cần.";
    }
  }

  let responseJson = {
    fulfillmentText: fulfillmentText,
  };

  if (customPayloadForFrontend) {
    responseJson.fulfillmentMessages = [
      {
        payload: {
          customData: customPayloadForFrontend,
        },
      },
    ];
  }

  console.log(
    "Webhook Response to Dialogflow:",
    JSON.stringify(responseJson, null, 2)
  );
  res.json(responseJson);
});

// Start server
const PORT = config.PORT;
server.listen(PORT, () =>
  logger.info(`Server + Socket.IO running on port ${PORT}`)
);
