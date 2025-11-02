// models/session.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const SESSION_STATUS = Object.freeze(['open', 'closed', 'void']);

/** Sản phẩm/dịch vụ phát sinh trong lúc chơi (lưu tạm trong session) */
const SessionItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
    nameSnapshot: { type: String, required: true, trim: true }, // tên tại thời điểm thêm
    priceSnapshot: { type: Number, required: true, min: 0 },    // giá tại thời điểm thêm
    qty: { type: Number, required: true, min: 1, default: 1 },
    note: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

// amount (ảo) = priceSnapshot * qty
SessionItemSchema.virtual('amount').get(function () {
  return Number((this.priceSnapshot || 0) * (this.qty || 0));
});

/** Snapshot loại bàn/đơn giá tại thời điểm check-in */
const TableTypeSnapshotSchema = new Schema(
  {
    typeId: { type: Schema.Types.ObjectId, ref: 'TableType', required: true },
    code: { type: String, required: true, uppercase: true },
    name: { type: String, required: true },
    ratePerHour: { type: Number, required: true, min: 0 }, // đơn giá áp dụng cho phiên
    rateSource: { type: String, enum: ['type', 'table'], default: 'type' }, // lấy từ loại bàn hay override của bàn
  },
  { _id: false }
);

/** Snapshot cấu hình làm tròn tại thời điểm check-in (đảm bảo ổn định khi admin đổi setting) */
const BillingRuleSnapshotSchema = new Schema(
  {
    roundingStep: { type: Number, default: 1 }, // phút: 1/5/10/15...
    graceMinutes: { type: Number, default: 0 }, // miễn phí dưới X phút
  },
  { _id: false }
);

const SessionSchema = new Schema(
  {
    table: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },

    tableTypeSnapshot: { type: TableTypeSnapshotSchema, required: true },

    billingRuleSnapshot: { type: BillingRuleSnapshotSchema, required: true, default: () => ({}) },

    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, default: null, index: true },

    // phút thực tế (sau làm tròn) được chốt khi checkout; với phiên open có thể null và tính động
    durationMinutes: { type: Number, default: null, min: 0 },

    items: { type: [SessionItemSchema], default: [] }, // giỏ dịch vụ tạm trong phiên

    staffStart: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    staffEnd: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    note: { type: String, trim: true, default: '' },

    status: { type: String, enum: SESSION_STATUS, default: 'open', index: true },

    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
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

/** Đảm bảo mỗi bàn chỉ có 1 phiên mở */
SessionSchema.index(
  { table: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

/** Tổng tiền dịch vụ hiện tại (ảo) */
SessionSchema.virtual('serviceAmount').get(function () {
  return (this.items || []).reduce((sum, it) => sum + (it.priceSnapshot || 0) * (it.qty || 0), 0);
});

/** Phiên còn mở? */
SessionSchema.virtual('isOpen').get(function () {
  return this.status === 'open' && !this.endTime;
});

/** Tính phút chơi (raw & sau làm tròn) tại thời điểm now (hoặc dùng endTime nếu đã có) */
SessionSchema.methods.computeMinutes = function (now = new Date()) {
  const start = this.startTime ? new Date(this.startTime) : null;
  const end = this.endTime ? new Date(this.endTime) : now;
  if (!start) return { rawMinutes: 0, billMinutes: 0 };

  const rawMinutes = Math.max(0, Math.ceil((end - start) / 60000)); // phút lẻ làm tròn lên
  const step = Number(this.billingRuleSnapshot?.roundingStep || 1);
  const grace = Number(this.billingRuleSnapshot?.graceMinutes || 0);

  if (rawMinutes <= grace) return { rawMinutes, billMinutes: 0 };

  const billMinutes = step > 1 ? Math.ceil(rawMinutes / step) * step : rawMinutes;
  return { rawMinutes, billMinutes };
};

/** Tính tiền giờ hiện tại (dựa trên snapshot rate/h) */
SessionSchema.methods.computePlayAmount = function (now = new Date()) {
  const rate = Number(this.tableTypeSnapshot?.ratePerHour || 0);
  const { billMinutes } = this.computeMinutes(now);
  const amount = (rate / 60) * billMinutes;
  return { billMinutes, amount: Math.max(0, Math.round(amount)) }; // có thể làm tròn theo quy tắc khác
};

/** Chốt phiên (không lưu DB): gán endTime, durationMinutes theo rule */
SessionSchema.methods.closePreview = function (endAt = new Date()) {
  const clone = this.toObject();
  const { rawMinutes, billMinutes } = this.computeMinutes(endAt);
  clone.endTime = endAt;
  clone.durationMinutes = billMinutes;
  return { ...clone, rawMinutes, billMinutes };
};

module.exports = mongoose.model('Session', SessionSchema);
module.exports.SESSION_STATUS = SESSION_STATUS;
