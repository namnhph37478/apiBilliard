// config/common/upload.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Lưu file về đĩa với tên an toàn & duy nhất
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const id = crypto.randomUUID().replace(/-/g, '');
    cb(null, `${Date.now()}_${id}${ext}`);
  },
});

// Chỉ cho phép ảnh (png, jpg, jpeg, gif, webp, bmp, svg+xml).
// Nếu muốn cho mọi loại: set ENV UPLOAD_ALLOWED=any
const ALLOWED = (process.env.UPLOAD_ALLOWED || 'image').toLowerCase();
const imageMime = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i;

const fileFilter = (req, file, cb) => {
  const ok = ALLOWED === 'any' ? true : imageMime.test(file.mimetype);
  if (!ok) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Invalid file type'));
  cb(null, true);
};

// Giới hạn dung lượng & số file
const maxSizeMB = Number(process.env.UPLOAD_MAX_SIZE_MB || 5); // 5MB
const limits = {
  fileSize: maxSizeMB * 1024 * 1024,
  files: Number(process.env.UPLOAD_MAX_FILES || 10),
};

const uploader = multer({ storage, fileFilter, limits });

// ---- Helpers ---------------------------------------------------------------

// Chuẩn hoá lỗi Multer → message thân thiện
function wrapMulterError(next) {
  return (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const map = {
        LIMIT_FILE_SIZE: `File quá lớn (tối đa ${maxSizeMB}MB).`,
        LIMIT_FILE_COUNT: 'Quá nhiều file.',
        LIMIT_UNEXPECTED_FILE: 'Loại file không hợp lệ.',
      };
      err.message = map[err.code] || err.message;
    }
    next(err);
  };
}

// Trả middleware single/array/fields đã bọc xử lý lỗi
const single = (field) => (req, res, next) =>
  uploader.single(field)(req, res, wrapMulterError(next));

const array = (field, max = 5) => (req, res, next) =>
  uploader.array(field, max)(req, res, wrapMulterError(next));

const fields = (defs) => (req, res, next) =>
  uploader.fields(defs)(req, res, wrapMulterError(next));

// Lấy đường dẫn public cho 1 file hoặc nhiều file
const getPublicPath = (file) => (file ? `/uploads/${file.filename}` : null);
const getPublicPaths = (files) =>
  Array.isArray(files) ? files.map((f) => `/uploads/${f.filename}`) : [];

// Trả URL đầy đủ (http://host/uploads/xxx) — tiện dùng khi cần gửi link
const toFullUrl = (req, fileOrName) => {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.filename;
  if (!name) return null;
  return `${req.protocol}://${req.get('host')}/uploads/${name}`;
};

module.exports = {
  upload: uploader, // nếu muốn dùng trực tiếp: upload.single('image')
  single,
  array,
  fields,
  getPublicPath,
  getPublicPaths,
  toFullUrl,
  UPLOAD_DIR,
};
