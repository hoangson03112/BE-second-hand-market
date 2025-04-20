# Second Hand Market API

Backend API cho ứng dụng mua bán đồ second hand.

## Cấu trúc thư mục

```
backend/
  ├── config/               # Cấu hình toàn cục
  │   └── env.js            # Cấu hình biến môi trường
  ├── src/
  │   ├── config/           # Cấu hình ứng dụng
  │   │   └── db/           # Cấu hình database
  │   ├── controllers/      # Xử lý logic nghiệp vụ
  │   ├── middleware/       # Middleware (xác thực, phân quyền...)
  │   ├── models/           # Mô hình dữ liệu
  │   ├── routes/           # Định tuyến API
  │   │   ├── account.routes.js
  │   │   ├── cart.routes.js
  │   │   ├── category.routes.js
  │   │   ├── chat.routes.js
  │   │   ├── debug.routes.js
  │   │   ├── index.js      # Tổng hợp tất cả routes
  │   │   ├── order.routes.js
  │   │   └── product.routes.js
  │   ├── services/         # Các dịch vụ (Socket.IO...)
  │   ├── utils/            # Tiện ích, helper functions
  │   └── index.js          # Điểm khởi động ứng dụng
  ├── .env                  # Biến môi trường thực
  ├── .env.example          # Mẫu biến môi trường
  ├── package.json          # Quản lý dependencies
  └── README.md             # Tài liệu dự án
```

## Cài đặt

1. Clone repo
2. Tạo file `.env` từ `.env.example`
3. Cài đặt dependencies
```
npm install
```
4. Khởi động server
```
npm start
```

## API Endpoints

### Authentication
- `POST /eco-market/accounts/register` - Đăng ký tài khoản mới
- `POST /eco-market/accounts/verify` - Xác thực tài khoản
- `POST /eco-market/accounts/login` - Đăng nhập
- `GET /eco-market/accounts/auth` - Kiểm tra xác thực

### Products
- `GET /eco-market/products` - Lấy danh sách sản phẩm
- `GET /eco-market/products/details` - Lấy chi tiết sản phẩm
- `POST /eco-market/products/create` - Tạo sản phẩm mới
- `PATCH /eco-market/products/update-status` - Cập nhật trạng thái sản phẩm

### Categories
- `GET /eco-market/categories` - Lấy danh sách danh mục
- `GET /eco-market/categories/details` - Lấy chi tiết danh mục
- `GET /eco-market/categories/sub` - Lấy danh sách danh mục con

### Cart
- `POST /eco-market/cart/add` - Thêm vào giỏ hàng
- `POST /eco-market/cart/purchase-now` - Mua ngay
- `DELETE /eco-market/cart/delete-item` - Xóa sản phẩm khỏi giỏ hàng
- `PUT /eco-market/cart/update-quantity` - Cập nhật số lượng

### Orders
- `POST /eco-market/orders` - Tạo đơn hàng
- `GET /eco-market/orders/my-orders` - Lấy danh sách đơn hàng của tôi
- `PATCH /eco-market/orders/update` - Cập nhật trạng thái đơn hàng

### Chat
- `GET /eco-market/chat/messages/:partnerId` - Lấy tin nhắn với đối tác
- `GET /eco-market/chat/partners` - Lấy danh sách đối tác chat
- `GET /eco-market/chat/history` - Lấy lịch sử chat

## Real-time (Socket.IO)

Dự án sử dụng Socket.IO để cung cấp tính năng real-time bao gồm:
- Chat trực tiếp giữa người dùng
- Thông báo trạng thái online/offline
- Chỉ báo đang gõ

## Môi trường
- Node.js
- Express
- MongoDB
- Socket.IO 