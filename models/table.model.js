// models/table.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Trạng thái hợp lệ của bàn
const TABLE_STATUS = Object.freeze(['available', 'playing', 'reserved', 'maintenance']);

const TableSchema = new Schema(
  {
    // Tên bàn hiển thị: "Bàn 1", "Bàn 2", ...
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },

    // Loại bàn: Pool/Carom/3C..., tham chiếu TableType
    type: {
      type: Schema.Types.ObjectId,
      ref: 'TableType',
      required: true,
      index: true,
    },

    // Trạng thái vận hành hiện tại của bàn
    status: {
      type: String,
      enum: TABLE_STATUS,
      default: 'available',
      index: true,
    },

    // (Tùy chọn) Ghi đè đơn giá/giờ cho riêng bàn này.
    // Nếu null -> dùng baseRatePerHour ở TableType tại thời điểm check-in (snapshot).
    ratePerHour: {
      type: Number,
      min: 0,
      default: null,
    },

    // Thứ tự hiển thị trong lưới bàn (nhân viên)
    orderIndex: { type: Number, default: 0 },

    // Bàn đang sử dụng hay tạm ngưng trong cấu hình
    active: { type: Boolean, default: true, index: true },

    // Dự phòng đa chi nhánh (hiện có thể để null)
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ===== Indexes =====
// Tránh trùng tên bàn trong cùng một chi nhánh
TableSchema.index(
  { branchId: 1, name: 1 },
  {
    unique: true,
    // Cho phép trùng name nếu name không phải string (phòng trường hợp dữ liệu cũ lỗi)
    partialFilterExpression: { name: { $type: 'string' } },
  }
);

// Tên bàn để tìm nhanh
TableSchema.index({ name: 1 });

// ===== Virtuals & helpers =====
TableSchema.virtual('isAvailable').get(function () {
  return this.active && this.status === 'available';
});

// Gợi ý: không viết logic tính giá ở đây (cần snapshot & rule KM).
// Hãy dùng billing.service để lấy effectiveRatePerHour và tính playAmount.

module.exports = mongoose.model('Table', TableSchema);
module.exports.TABLE_STATUS = TABLE_STATUS;
