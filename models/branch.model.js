// models/branch.model.js
const mongoose = require('mongoose');

const { Schema } = mongoose;
const CODE_REGEX = /^[A-Z0-9_-]+$/;

const BranchSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: CODE_REGEX,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    // Thông tin hiển thị
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    note: { type: String, trim: true, default: '' },

    // Sắp xếp & trạng thái
    orderIndex: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },

    // Tự do mở rộng (múi giờ riêng, khung giờ mở cửa,... nếu cần)
    meta: { type: Schema.Types.Mixed, default: null },

    // Audit (tuỳ chọn)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ===== Indexes =====
BranchSchema.index({ code: 1 }, { unique: true });
BranchSchema.index({ orderIndex: 1, active: 1 });
BranchSchema.index({ name: 'text', code: 'text', address: 'text' });

// ===== Hooks =====
BranchSchema.pre('save', function (next) {
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  if (this.name) this.name = String(this.name).trim();
  next();
});

// ===== Virtuals / toJSON =====
BranchSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
});

// (tuỳ chọn) Nhãn hiển thị nhanh
BranchSchema.methods.getLabel = function () {
  return `${this.code} · ${this.name}`;
};

const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema);

module.exports = Branch;
module.exports.CODE_REGEX = CODE_REGEX;
