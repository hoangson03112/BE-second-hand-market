/**
 * Centralized API response messages (Vietnamese with accents)
 * All controllers should use these constants instead of hardcoded strings.
 * Usage: const { MESSAGES } = require('../utils/messages');
 */

const MESSAGES = {
  // ======================================================================
  // Common / General
  // ======================================================================
  SERVER_ERROR: "Lỗi máy chủ",
  INTERNAL_SERVER_ERROR: "Lỗi máy chủ nội bộ",
  NOT_FOUND: "Không tìm thấy",
  UNAUTHORIZED: "Không có quyền truy cập",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  INVALID_ID: "Định dạng ID không hợp lệ",
  MISSING_FIELDS: "Thiếu thông tin bắt buộc",
  INVALID_STATUS: "Trạng thái không hợp lệ",
  OPERATION_SUCCESS: "Thao tác thành công",

  // ======================================================================
  // Auth
  // ======================================================================
  AUTH: {
    ACCOUNT_NOT_FOUND: "Tài khoản không tồn tại",
    GOOGLE_CANNOT_CHANGE_PASSWORD:
      "Tài khoản Google không thể đổi mật khẩu tại đây. Bạn đăng nhập qua Google.",
    NO_PASSWORD_SET:
      "Tài khoản chưa có mật khẩu. Vui lòng đặt mật khẩu trước.",
    OLD_PASSWORD_WRONG: "Mật khẩu cũ không đúng",
    CHANGE_PASSWORD_SUCCESS: "Đổi mật khẩu thành công",
    WRONG_CREDENTIALS: "Sai tên đăng nhập hoặc mật khẩu",
    LOGIN_SUCCESS: "Đăng nhập thành công",
    ACCOUNT_NOT_ACTIVATED: "Tài khoản chưa được kích hoạt",
    REGISTER_CODE_SENT: "Đã gửi mã xác nhận",
    VERIFY_SUCCESS: "Tài khoản đã được xác minh",
    VERIFY_INVALID_CODE: "Mã xác nhận không hợp lệ hoặc đã hết hạn",
    ACCOUNTS_NOT_FOUND: "Không tìm thấy tài khoản nào",
    ACCOUNTS_RETRIEVED: "Lấy danh sách tài khoản thành công",
    TOKEN_REFRESHED: "Làm mới phiên đăng nhập thành công",
    SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    ACCOUNT_INACTIVE: "Tài khoản không hoạt động",
    LOGOUT_SUCCESS: "Đăng xuất thành công",
    UPDATE_SUCCESS: "Cập nhật thành công!",
    ENTER_EMAIL: "Vui lòng nhập email",
    FORGOT_PASSWORD_EMAIL_SENT:
      "Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu",
    GOOGLE_RESET_UNSUPPORTED: "Tài khoản Google không hỗ trợ đặt lại mật khẩu",
    SEND_EMAIL_FAILED: "Không thể gửi email. Vui lòng thử lại sau.",
    RESET_LINK_SENT: "Link đặt lại mật khẩu đã được gửi đến email của bạn",
    MISSING_RESET_INFO: "Thiếu thông tin token hoặc mật khẩu mới",
    PASSWORD_TOO_SHORT: "Mật khẩu phải có ít nhất 6 ký tự",
    RESET_TOKEN_INVALID: "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
    RESET_PASSWORD_SUCCESS: "Đặt lại mật khẩu thành công",
  },

  // ======================================================================
  // Cart
  // ======================================================================
  CART: {
    ADD_SUCCESS: "Đã thêm sản phẩm vào giỏ hàng",
    ITEM_REMOVED: "Đã xóa sản phẩm khỏi giỏ hàng",
    ITEMS_REMOVED: "Đã xóa các sản phẩm khỏi giỏ hàng",
    PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm",
    PRODUCT_NOT_IN_CART: "Không tìm thấy sản phẩm trong giỏ hàng",
    QUANTITY_UPDATED: "Đã cập nhật số lượng",
    CART_CLEARED: "Đã xóa toàn bộ giỏ hàng",
    NOT_FOUND: "Không tìm thấy giỏ hàng",
    QUANTITY_INVALID: "Số lượng phải là số nguyên không âm",
    STOCK_EXCEEDED: (stock) => `Chỉ còn ${stock} sản phẩm trong kho.`,
  },

  // ======================================================================
  // Category
  // ======================================================================
  CATEGORY: {
    NOT_FOUND: "Không tìm thấy danh mục",
    FETCH_ERROR: "Lỗi khi lấy danh sách danh mục",
    CREATE_FAILED: "Không thể tạo danh mục",
    SUBCATEGORY_ID_REQUIRED: "Thiếu ID danh mục con",
    SUBCATEGORY_NOT_FOUND: "Không tìm thấy danh mục con",
    SUBCATEGORY_CREATE_SUCCESS: "Tạo danh mục con thành công",
    SUBCATEGORY_CREATE_ERROR: "Lỗi khi tạo danh mục con",
    SUBCATEGORY_UPDATE_SUCCESS: "Cập nhật danh mục con thành công",
    SUBCATEGORY_UPDATE_ERROR: "Lỗi khi cập nhật danh mục con",
    SUBCATEGORY_ID_NAME_REQUIRED: "Thiếu ID hoặc tên danh mục con",
    SUBCATEGORY_DELETE_SUCCESS: "Xóa danh mục con thành công",
    SUBCATEGORY_DELETE_ERROR: "Lỗi khi xóa danh mục con",
    SUBCATEGORY_HAS_PRODUCTS:
      "Không thể xóa danh mục con này vì vẫn còn sản phẩm đang sử dụng. Vui lòng chuyển hoặc xóa các sản phẩm trước khi xóa danh mục con.",
    CATEGORY_OR_SUBCATEGORY_NOT_FOUND: "Không tìm thấy danh mục hoặc danh mục con",
  },

  // ======================================================================
  // Chat
  // ======================================================================
  CHAT: {
    NO_MEDIA_UPLOADED: "Không có tệp media nào được tải lên",
    UPLOAD_FAILED: "Không thể tải lên media chat",
    CONVERSATION_CREATED: "Đã tạo hoặc tìm thấy cuộc trò chuyện",
    CONVERSATION_NOT_FOUND: "Không tìm thấy cuộc trò chuyện",
    CONVERSATION_MARKED_READ: "Đã đánh dấu cuộc trò chuyện là đã đọc",
    MESSAGE_NOT_FOUND: "Không tìm thấy tin nhắn",
    MESSAGE_DELETE_UNAUTHORIZED: "Bạn không có quyền xóa tin nhắn này",
    MESSAGE_DELETED: "Đã xóa tin nhắn",
  },

  // ======================================================================
  // Order
  // ======================================================================
  ORDER: {
    INVALID_TOKEN: "Token không hợp lệ",
    MISSING_ORDER_CODE_OR_STATUS: "Thiếu mã đơn hàng hoặc trạng thái",
    STATUS_NOT_MAPPED: "Trạng thái không được ánh xạ, bỏ qua",
    NOT_FOUND: "Không tìm thấy đơn hàng",
    TRANSITION_SKIPPED: "Chuyển trạng thái bị bỏ qua (không hợp lệ hoặc trùng lặp)",
  },

  // ======================================================================
  // Product
  // ======================================================================
  PRODUCT: {
    NOT_FOUND: "Không tìm thấy sản phẩm",
    CATEGORY_NOT_FOUND: "Không tìm thấy danh mục",
    SUBCATEGORY_NOT_FOUND: "Không tìm thấy danh mục con",
    ID_REQUIRED: "Thiếu ID sản phẩm",
    INVALID_ID: "Định dạng ID sản phẩm không hợp lệ",
    VALIDATION_FAILED: "Thông tin sản phẩm không hợp lệ",
    CATEGORY_SLUG_REQUIRED: "Thiếu slug danh mục hoặc danh mục con",
    DELETE_SUCCESS: "Xóa sản phẩm thành công.",
    DELETE_ERROR: "Lỗi khi xóa sản phẩm.",
    UPDATE_SUCCESS: "Cập nhật sản phẩm thành công",
    CREATE_FAILED: "Không thể tạo sản phẩm",
    CREATE_SUCCESS: "Sản phẩm đã được tạo thành công! Đang kiểm duyệt bằng AI...",
    REJECT_REASON_REQUIRED: "Vui lòng nhập lý do từ chối sản phẩm",
    REVIEW_REQUEST_SUCCESS: "Đã gửi yêu cầu duyệt lại. Admin sẽ xem xét sản phẩm của bạn.",
    REVIEW_REQUEST_FAILED: "Không thể gửi yêu cầu duyệt lại. Vui lòng thử lại.",
    REVIEW_REQUEST_UNAUTHORIZED: "Bạn không có quyền yêu cầu duyệt lại sản phẩm này",
    REVIEW_REQUEST_INVALID_STATUS: "Chỉ có thể yêu cầu duyệt lại sản phẩm đã bị từ chối",
    SELLER_ADDRESS_REQUIRED: "Seller phải chọn địa chỉ lấy hàng hợp lệ (addressId)",
    SELLER_ADDRESS_INVALID: "Địa chỉ không hợp lệ hoặc không thuộc tài khoản này",
    SELLER_ADDRESS_INCOMPLETE: "Địa chỉ lấy hàng không đầy đủ (cần provinceId, districtId, wardCode)",
  },

  // ======================================================================
  // Refund
  // ======================================================================
  REFUND: {
    NOT_FOUND: "Không tìm thấy yêu cầu hoàn tiền",
    ORDER_NOT_FOUND: "Không tìm thấy đơn hàng",
    ONLY_DELIVERED: "Chỉ có thể yêu cầu hoàn tiền cho đơn hàng đã hoàn thành",
    AMOUNT_INVALID: (max) => `Số tiền hoàn không hợp lệ. Tối đa: ${max}`,
    ALREADY_PENDING: "Đơn hàng này đã có yêu cầu hoàn tiền đang xử lý",
    REQUEST_SENT: "Đã gửi yêu cầu hoàn tiền. Seller sẽ xem xét trong 48h.",
    CREATE_ERROR: "Lỗi máy chủ khi tạo yêu cầu hoàn tiền",
    ALREADY_PROCESSED: "Yêu cầu này đã được xử lý",
    DECISION_INVALID: "Quyết định phải là 'approved' hoặc 'rejected'",
    ADMIN_DECISION_INVALID: "Quyết định phải là 'refund' hoặc 'reject'",
    APPEAL_SENT: "Đã chuyển khiếu nại lên admin. Admin sẽ xem xét trong 24-48h.",
    ALREADY_ESCALATED: "Yêu cầu này đã được chuyển lên admin",
    ONLY_APPEAL_ON_REJECTED: "Chỉ có thể khiếu nại khi seller từ chối",
    ONLY_ADMIN_CAN_HANDLE_DISPUTE: "Chỉ admin mới xử lý được dispute",
    PROCESSED_SUCCESS: "Xử lý hoàn tiền thành công",
    UNAUTHORIZED: "Bạn không có quyền xem yêu cầu này",
    MISSING_INFO: "Thiếu thông tin bắt buộc",
  },

  // ======================================================================
  // Review
  // ======================================================================
  REVIEW: {
    MISSING_INFO: "Thiếu thông tin bắt buộc (productId, orderId, rating)",
    INVALID_RATING: "Đánh giá phải từ 1 đến 5 sao",
    ORDER_NOT_FOUND_OR_UNAUTHORIZED: "Không tìm thấy đơn hàng hoặc bạn không có quyền đánh giá",
    ONLY_AFTER_DELIVERY: "Chỉ có thể đánh giá sau khi đơn hàng hoàn thành",
    PRODUCT_NOT_IN_ORDER: "Sản phẩm không có trong đơn hàng này",
    ALREADY_REVIEWED: "Bạn đã đánh giá sản phẩm này trong đơn hàng rồi",
    CREATE_SUCCESS: "Đánh giá sản phẩm thành công",
    CREATE_ERROR: "Lỗi máy chủ khi tạo đánh giá",
    NOT_FOUND_OR_UNAUTHORIZED: "Không tìm thấy đánh giá hoặc bạn không có quyền chỉnh sửa",
    UPDATE_SUCCESS: "Cập nhật đánh giá thành công",
    DELETE_NOT_FOUND_OR_UNAUTHORIZED: "Không tìm thấy đánh giá hoặc bạn không có quyền xóa",
    DELETE_SUCCESS: "Xóa đánh giá thành công",
    SELLER_ALREADY_REVIEWED: "Bạn đã đánh giá đơn hàng này rồi!",
    SELLER_REVIEW_SUCCESS: "Đánh giá thành công!",
    SELLER_REVIEW_UPDATE_NOT_FOUND: "Không tìm thấy đánh giá hoặc bạn không có quyền sửa.",
    SELLER_REVIEW_UPDATE_SUCCESS: "Cập nhật đánh giá thành công!",
  },

  // ======================================================================
  // Seller
  // ======================================================================
  SELLER: {
    CHECK_STATUS_ERROR: "Lỗi khi kiểm tra trạng thái seller",
    PRODUCT_LIMIT_ERROR: "Lỗi khi kiểm tra giới hạn sản phẩm",
    ALREADY_SELLER: "Bạn đã là Seller rồi!",
    UPLOAD_ID_CARD: "Vui lòng tải lên ảnh CCCD mặt trước và mặt sau",
    ACCEPT_TERMS: "Vui lòng đồng ý với điều khoản và chính sách",
    NOT_FOUND: "Không tìm thấy seller",
    LIST_ERROR: "Lỗi khi lấy danh sách seller",
    INFO_ERROR: "Lỗi khi lấy thông tin seller",
    INVALID_STATUS: "Trạng thái không hợp lệ",
    REJECT_REASON_REQUIRED: "Vui lòng nhập lý do từ chối",
    UPDATE_STATUS_ERROR: "Lỗi khi cập nhật trạng thái seller",
  },

  // ======================================================================
  // Bank info
  // ======================================================================
  BANK_INFO: {
    MISSING_INFO: "Thiếu thông tin bắt buộc.",
    MISSING_TRANSFER_IMAGE: "Thiếu ảnh chuyển khoản.",
    INVALID_STATUS: "Trạng thái không hợp lệ.",
    REJECT_REASON_REQUIRED: "Cần nhập lý do từ chối.",
    NOT_FOUND: "Không tìm thấy thông tin thanh toán.",
  },

  // ======================================================================
  // Address
  // ======================================================================
  ADDRESS: {
    UNAUTHORIZED: "Không có quyền truy cập",
    DELETE_SUCCESS: "Xóa địa chỉ thành công",
  },

  // ======================================================================
  // Blog
  // ======================================================================
  BLOG: {
    NOT_FOUND: "Không tìm thấy blog",
    MISSING_INFO: "Vui lòng điền đầy đủ thông tin",
    CREATE_SUCCESS: "Tạo blog thành công!",
    UPDATE_SUCCESS: "Cập nhật blog thành công!",
    DELETE_SUCCESS: "Xóa blog thành công!",
    LIKED: "Đã thích",
    UNLIKED: "Đã bỏ thích",
    INVALID_STATUS: "Trạng thái không hợp lệ",
    STATUS_UPDATE_SUCCESS: "Cập nhật trạng thái thành công!",
    VIEW_INCREMENTED: "Đã tăng lượt xem",
  },

  // ======================================================================
  // Admin
  // ======================================================================
  ADMIN: {
    ACTION_MUST_BE_APPROVE_OR_REJECT: "Hành động phải là 'approve' hoặc 'reject'",
    PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm",
    PRODUCT_APPROVED_OR_REJECTED: (action) =>
      `Sản phẩm đã được ${action === "approve" ? "phê duyệt" : "từ chối"}`,
    AI_MODE_CHANGED: (mode) => `Chế độ kiểm duyệt AI đã chuyển thành ${mode.toUpperCase()}`,
    AI_MODE_INVALID: "Chế độ phải là 'strict' hoặc 'balanced'",
    PRODUCT_FORCE_APPROVED: "Sản phẩm đã được admin phê duyệt thủ công",
    PRODUCT_QUEUED_REPROCESSING: "Đã đưa sản phẩm vào hàng chờ kiểm duyệt lại",
    MODERATION_HEALTH_ERROR: "Không thể kiểm tra trạng thái kiểm duyệt",
    TEST_APIS_ERROR: "Không thể kiểm tra API",
  },

  // ======================================================================
  // Personal discount (Seller deals)
  // ======================================================================
  DEAL: {
    MISSING_INFO: "Vui lòng điền đầy đủ thông tin!",
    PRICE_MUST_BE_POSITIVE: "Giá phải lớn hơn 0!",
    END_DATE_MUST_BE_FUTURE: "Ngày kết thúc phải sau thời điểm hiện tại!",
    DUPLICATE_DEAL: "Đã có deal đang hoạt động cho người mua này với sản phẩm này!",
    CREATE_SUCCESS: "Tạo deal thành công!",
    CREATE_ERROR: "Có lỗi xảy ra khi tạo deal.",
    NOT_FOUND_OR_UNAUTHORIZED: "Deal không tồn tại hoặc không thuộc quyền của bạn.",
    CANCEL_SUCCESS: "Đã hủy deal thành công.",
    NOT_FOUND: "Không tìm thấy deal",
  },

  // ======================================================================
  // Notification
  // ======================================================================
  NOTIFICATION: {
    NOT_FOUND: "Không tìm thấy thông báo",
    MARK_ALL_READ: "Đã đánh dấu tất cả thông báo là đã đọc",
    DELETE_SUCCESS: "Đã xóa thông báo",
  },

  // ======================================================================
  // Report
  // ======================================================================
  REPORT: {
    ALREADY_REPORTED: "Bạn đã gửi báo cáo cho đơn hàng này. Vui lòng chờ xử lý!",
  },
};

module.exports = { MESSAGES };
