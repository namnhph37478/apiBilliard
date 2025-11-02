// validators/table-type.schema.js
const Joi = require('joi');

// ----- Helpers -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const HHMM = /^\d{2}:\d{2}$/;

// Khung giá theo ngày/giờ
const dayRateSchema = Joi.object({
  days: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .unique()
    .default([])
    .messages({ 'array.unique': 'days không được trùng lặp (0=CN..6=T7)' }),
  from: Joi.string().pattern(HHMM).messages({ 'string.pattern.base': 'from phải dạng HH:mm' }),
  to:   Joi.string().pattern(HHMM).messages({ 'string.pattern.base': 'to phải dạng HH:mm' }),
  ratePerHour: Joi.number().min(0).required(),
})
  // Nếu có from thì phải có to và ngược lại
  .with('from', 'to')
  .with('to', 'from');

// ----- Schemas -----

// GET /table-types
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    q: Joi.string().trim().allow('', null),           // tìm theo name/code
    active: Joi.boolean().optional(),
    branchId: objectId().allow(null, ''),

    // sort: 'name' | '-name' | 'code' | '-code' | 'baseRatePerHour' | '-baseRatePerHour' | 'createdAt' | '-createdAt'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(name|code|baseRatePerHour|createdAt)$/)
      .default('name'),
  }),
};

// POST /table-types
module.exports.create = {
  body: Joi.object({
    code: Joi.string()
      .trim()
      .min(2)
      .max(16)
      .uppercase()
      .pattern(/^[A-Z0-9_-]+$/)
      .required()
      .messages({ 'string.pattern.base': 'code chỉ gồm A-Z, 0-9, _, -' }),

    name: Joi.string().trim().max(64).required(),

    baseRatePerHour: Joi.number().min(0).required(),

    dayRates: Joi.array().items(dayRateSchema).default([]),

    active: Joi.boolean().default(true),

    branchId: objectId().allow(null).optional(),
  }),
};

// PUT /table-types/:id
module.exports.update = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    code: Joi.string()
      .trim()
      .min(2)
      .max(16)
      .uppercase()
      .pattern(/^[A-Z0-9_-]+$/)
      .messages({ 'string.pattern.base': 'code chỉ gồm A-Z, 0-9, _, -' }),

    name: Joi.string().trim().max(64),

    baseRatePerHour: Joi.number().min(0),

    dayRates: Joi.array().items(dayRateSchema),

    active: Joi.boolean(),

    branchId: objectId().allow(null),
  }).min(1),
};

// PATCH /table-types/:id/active
module.exports.setActive = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// (tuỳ chọn) PATCH /table-types/:id/day-rates  — thay toàn bộ khung giờ
module.exports.setDayRates = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    dayRates: Joi.array().min(0).items(dayRateSchema).required(),
  }),
};

// GET /table-types/:id
module.exports.getOne = {
  params: Joi.object({ id: objectId().required() }),
};

// DELETE /table-types/:id
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.HHMM = HHMM;
