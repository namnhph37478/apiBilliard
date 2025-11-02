// models/table-type.model.js
const mongoose = require('mongoose');

const DayRateSchema = new mongoose.Schema(
  {
    // mảng ngày trong tuần 0..6 (0 = CN)
    days: { type: [Number], default: [] },
    from: { type: String, required: true }, // "HH:mm"
    to: { type: String, required: true },   // "HH:mm"
    ratePerHour: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const TableTypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9._-]{2,32}$/,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    baseRatePerHour: { type: Number, required: true, min: 0, default: 0 },
    dayRates: { type: [DayRateSchema], default: [] }, // các khung giờ đặc biệt theo ngày
    orderIndex: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

TableTypeSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

// 👉 Export **Model** (KHÔNG export schema hay object khác)
const TableType = mongoose.model('TableType', TableTypeSchema);
module.exports = TableType;
