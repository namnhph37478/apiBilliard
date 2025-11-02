// validators/auth.schema.js
const Joi = require('joi');

// ------------ Common pieces ------------
const username = Joi.string()
  .trim()
  .min(3)
  .max(64)
  .lowercase()
  .pattern(/^[a-z0-9._-]+$/)
  .messages({
    'string.pattern.base': 'username chỉ gồm a-z, 0-9, ., _, -',
  });

const password = Joi.string().min(6).max(128);

const email = Joi.string().trim().lowercase().email().max(120);

const phone = Joi.string().trim().max(32);

// ------------ Schemas ------------

// POST /auth/login
module.exports.login = {
  body: Joi.object({
    username: username.required(),
    password: password.required(),
  }),
};

// POST /auth/refresh
// - Có thể gửi refreshToken trong body HOẶC qua Authorization Bearer (middleware sẽ lấy)
module.exports.refresh = {
  body: Joi.object({
    refreshToken: Joi.string().trim().optional(),
  }),
};

// PUT /auth/profile  (cập nhật hồ sơ chính mình)
module.exports.updateProfile = {
  body: Joi.object({
    name: Joi.string().trim().max(120).optional(),
    email: email.allow('', null).optional(),
    phone: phone.allow('', null).optional(),
    avatar: Joi.string().trim().uri().allow('', null).optional(), // nếu bạn gửi URL; nếu upload file thì không cần field này
  }).min(1),
};

// PUT /auth/change-password  (đổi mật khẩu chính mình)
module.exports.changePassword = {
  body: Joi.object({
    oldPassword: password.required(),
    newPassword: password.disallow(Joi.ref('oldPassword')).min(6).max(128).required()
      .messages({ 'any.invalid': 'Mật khẩu mới phải khác mật khẩu cũ' }),
    confirmNewPassword: Joi.any().valid(Joi.ref('newPassword')).required()
      .messages({ 'any.only': 'Xác nhận mật khẩu không khớp' }),
  }),
};
