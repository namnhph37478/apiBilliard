# Billiard POS – API

Node.js/Express + MongoDB backend cho **quản lý quán bida**: bàn chơi, tính giờ, dịch vụ/đồ uống, hóa đơn, khuyến mãi, báo cáo, cấu hình hệ thống.

> **Tài liệu API đầy đủ:** xem [`api.md`](./api.md)

---

## 1) Tính năng chính

- **Đăng nhập (JWT)**: phân quyền `staff`/`admin`
- **Quản lý bàn**: danh sách, check-in/out, trạng thái, đơn giá theo loại bàn
- **Phiên chơi (Session)**: tính giờ tự động, thêm dịch vụ, chốt phiên → tạo hóa đơn
- **Sản phẩm & danh mục**: đồ uống/đồ ăn/dịch vụ
- **Hóa đơn (Bill)**: thanh toán, in PDF (58/80mm/A4), QR e-bill, export Excel
- **Khuyến mãi (Promotion)**: theo thời gian, sản phẩm, hoặc hóa đơn
- **Báo cáo (Reports)**: tổng quan, chuỗi doanh thu, top món/bàn, theo nhân viên, dashboard
- **Cấu hình (Settings)**: thông tin quán, in ấn, eReceipt, quy tắc làm tròn/thời gian ân hạn, backup
- **Backup**: job sao lưu theo lịch (tùy chọn)

---

## 2) Yêu cầu hệ thống

- **Node.js** ≥ 18
- **MongoDB** ≥ 5.0
- (khuyến nghị) **pnpm** hoặc **npm**

---

## 3) Cài đặt & chạy

```bash
# 1) Clone
git clone <your-repo-url> api-billiard
cd api-billiard

# 2) Cài dependencies
npm install
# hoặc
pnpm install

# 3) Tạo file .env từ env.example
cp env.example .env
# → cấu hình MONGODB_URI, JWT_SECRET, CORS_ORIGINS, v.v.

# 4) Chạy dev
npm run dev
# Mặc định http://localhost:3000
