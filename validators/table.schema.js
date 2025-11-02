// validators/table.schema.js
const Joi = require('joi');

// ----- Helpers -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const TABLE_STATUS = ['available', 'playing', 'reserved', 'maintenance'];

// ----- Schemas -----

// GET /tables
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    q: Joi.string().trim().allow('', null),        // search theo name
    status: Joi.string().valid(...TABLE_STATUS).optional(),
    type: objectId().optional(),                    // TableType id
    active: Joi.boolean().optional(),
    branchId: objectId().allow(null, ''),

    // sort: 'orderIndex' | '-orderIndex' | 'name' | '-name' | 'createdAt' | '-createdAt' | 'status'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(orderIndex|name|createdAt|status)$/)
      .default('orderIndex'),
  }),
};

// POST /tables
module.exports.create = {
  body: Joi.object({
    name: Joi.string().trim().max(64).required(),
    type: objectId().required(),                    // TableType
    ratePerHour: Joi.number().min(0).allow(null).optional(), // override, null = dùng theo loại
    orderIndex: Joi.number().integer().min(0).default(0),
    active: Joi.boolean().default(true),
    branchId: objectId().allow(null).optional(),
  }),
};

// PUT /tables/:id
module.exports.update = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    name: Joi.string().trim().max(64),
    type: objectId(),
    ratePerHour: Joi.number().min(0).allow(null),
    orderIndex: Joi.number().integer().min(0),
    active: Joi.boolean(),
    branchId: objectId().allow(null),
  }).min(1),
};

// PATCH /tables/:id/status
module.exports.changeStatus = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    status: Joi.string().valid(...TABLE_STATUS).required(),
  }),
};

// PATCH /tables/:id/active
module.exports.setActive = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// PATCH /tables/:id/rate
module.exports.setRate = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    ratePerHour: Joi.number().min(0).allow(null).required(),
  }),
};

// PATCH /tables/reorder  (đổi thứ tự nhiều bàn)
module.exports.reorder = {
  body: Joi.object({
    items: Joi.array().min(1).max(1000).items(
      Joi.object({
        id: objectId().required(),
        orderIndex: Joi.number().integer().min(0).required(),
      })
    ).required(),
  }),
};

// DELETE /tables/:id
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.TABLE_STATUS = TABLE_STATUS;
