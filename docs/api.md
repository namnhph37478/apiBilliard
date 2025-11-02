# Billiard POS — API v1

**Base URL:** `/api/v1`  
**Content-Type:** `application/json`  
**Auth:** JWT (Bearer) or HttpOnly cookies (optional)  
**Time zone:** `Asia/Ho_Chi_Minh`

> API phục vụ **Staff App** (quầy lễ tân) và **Admin Panel** (quản trị).

---

## Mục lục

- [Quy ước](#quy-ước)
- [Xác thực & Bảo mật](#xác-thực--bảo-mật)
- [Mẫu phản hồi](#mẫu-phản-hồi)
- [Phân trang & Lọc](#phân-trang--lọc)
- [Tài nguyên](#tài-nguyên)
  - [Auth](#auth)
  - [Users (Admin)](#users-admin)
  - [Tables](#tables)
  - [Table Types (Admin)](#table-types-admin)
  - [Sessions (Check-in/Out)](#sessions-check-inout)
  - [Products (Admin)](#products-admin)
  - [Categories (Admin)](#categories-admin)
  - [Bills](#bills)
  - [Promotions (Admin)](#promotions-admin)
  - [Reports](#reports)
  - [Settings](#settings)
  - [Meta](#meta)
- [Mô hình dữ liệu (rút gọn)](#mô-hình-dữ-liệu-rút-gọn)
- [Lỗi](#lỗi)
- [Biến môi trường](#biến-môi-trường)
- [Luồng mẫu nhanh](#luồng-mẫu-nhanh)

---

## Quy ước

- Tất cả endpoint trả về **JSON envelope**.
- Thời gian ISO; tiền tệ **VND** (number).
- ID là MongoDB ObjectId (string).
- Hầu hết danh sách hỗ trợ `page`, `limit`, `sort`, và các bộ lọc tùy tài nguyên.

---

## Xác thực & Bảo mật

### JWT
- Header: `Authorization: Bearer <access_token>`.
- Refresh: `/auth/refresh` dùng `refresh_token`.

### HttpOnly Cookies (tuỳ chọn)
Bật `AUTH_SET_COOKIE=true` để nhận token qua cookie:
- `access_token` (mặc định ~1h)
- `refresh_token` (mặc định ~7d)

### Vai trò
- `staff`: thao tác quầy (bàn, phiên, hóa đơn).
- `admin`: toàn quyền (người dùng, cấu hình, khuyến mãi, báo cáo, xuất file).

---

## Mẫu phản hồi

```json
// Thành công
{
  "status": 200,
  "message": "OK",
  "data": { "..." : "..." },
  "meta": { "..." : "..." }
}

// Phân trang
{
  "status": 200,
  "message": "OK",
  "data": {
    "items": [ ... ],
    "page": 1,
    "limit": 20,
    "total": 123,
    "sort": "-createdAt"
  }
}

// Lỗi
{
  "status": 422,
  "message": "Validation failed",
  "errors": { "field": "reason" }
}
