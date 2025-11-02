// controllers/product.controller.js
const R = require('../utils/response');
const Product = require('../models/product.model');
const Category = require('../models/product-category.model');
const Session = require('../models/session.model');
const Bill = require('../models/bill.model');
const { makeSkuFromName } = require('../utils/codegen');

/* ===================== Helpers ===================== */

function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function parseSort(sortStr = 'name') {
  if (!sortStr || typeof sortStr !== 'string') return { name: 1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, category, tag, active, isService, branchId, minPrice, maxPrice }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }, { sku: rx }, { tags: rx }];
  }
  if (category) query.category = category;
  if (tag) query.tags = { $in: [String(tag)] };
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = String(active) === 'true' || active === true;
  }
  if (typeof isService === 'boolean' || isService === 'true' || isService === 'false') {
    query.isService = String(isService) === 'true' || isService === true;
  }
  if (branchId) query.branchId = branchId;
  if (typeof minPrice !== 'undefined' || typeof maxPrice !== 'undefined') {
    query.price = {};
    if (typeof minPrice !== 'undefined') query.price.$gte = Number(minPrice);
    if (typeof maxPrice !== 'undefined') query.price.$lte = Number(maxPrice);
  }
  return query;
}

/* ===================== Controllers ===================== */

// GET /products
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    category,
    tag,
    active,
    isService,
    branchId,
    minPrice,
    maxPrice,
    sort = 'name',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({ q, category, tag, active, isService, branchId, minPrice, maxPrice });
  const sortObj = parseSort(String(sort));

  const [items, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name code')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments(query),
  ]);

  return R.paged(res, {
    items: items.map(sanitize),
    page: pageNum,
    limit: limitNum,
    total,
    sort,
  });
});

// GET /products/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id).populate('category', 'name code');
  if (!doc) return R.fail(res, 404, 'Product not found');
  return R.ok(res, sanitize(doc));
});

// POST /products
exports.create = R.asyncHandler(async (req, res) => {
  const {
    name,
    sku,
    category,
    price,
    unit,
    isService = false,
    images = [],
    tags = [],
    active = true,
    branchId = null,
    note = '',
  } = req.body;

  // Kiểm tra category tồn tại
  const cat = await Category.findById(category).select('_id');
  if (!cat) return R.fail(res, 400, 'Category not found');

  // SKU: nếu không truyền → auto từ name
  const finalSku = (sku && String(sku).trim()) ? String(sku).trim().toUpperCase() : makeSkuFromName(name);

  const doc = await Product.create({
    name: String(name).trim(),
    sku: finalSku,
    category,
    price: Number(price || 0),
    unit: unit || '',
    isService: !!isService,
    images: Array.isArray(images) ? images.slice(0, 10) : [],
    tags: Array.isArray(tags) ? Array.from(new Set(tags.map(t => String(t).trim()))).slice(0, 20) : [],
    active: !!active,
    branchId: branchId || null,
    note: note || '',
  });

  return R.created(res, sanitize(doc), 'Product created');
});

// PUT /products/:id
exports.update = R.asyncHandler(async (req, res) => {
  const {
    name,
    sku,
    category,
    price,
    unit,
    isService,
    images,
    tags,
    active,
    branchId,
    note,
  } = req.body;

  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  if (typeof category !== 'undefined') {
    const cat = await Category.findById(category).select('_id');
    if (!cat) return R.fail(res, 400, 'Category not found');
    doc.category = category;
  }

  if (typeof name !== 'undefined') doc.name = name;
  if (typeof sku !== 'undefined') doc.sku = String(sku || '').toUpperCase();
  if (typeof price !== 'undefined') doc.price = Number(price);
  if (typeof unit !== 'undefined') doc.unit = unit;
  if (typeof isService !== 'undefined') doc.isService = !!isService;
  if (typeof images !== 'undefined' && Array.isArray(images)) doc.images = images.slice(0, 10);
  if (typeof tags !== 'undefined' && Array.isArray(tags)) {
    doc.tags = Array.from(new Set(tags.map(t => String(t).trim()))).slice(0, 20);
  }
  if (typeof active !== 'undefined') doc.active = !!active;
  if (typeof branchId !== 'undefined') doc.branchId = branchId;
  if (typeof note !== 'undefined') doc.note = note;

  await doc.save();
  return R.ok(res, sanitize(doc), 'Product updated');
});

// PATCH /products/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  doc.active = !!req.body.active;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Active state updated');
});

// PATCH /products/:id/price
exports.setPrice = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  doc.price = Number(req.body.price);
  await doc.save();
  return R.ok(res, sanitize(doc), 'Price updated');
});

// PATCH /products/:id/images
exports.setImages = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  const arr = Array.isArray(req.body.images) ? req.body.images : [];
  doc.images = arr.slice(0, 10);
  await doc.save();
  return R.ok(res, sanitize(doc), 'Images replaced');
});

// PATCH /products/:id/tags/add
exports.addTags = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  const incoming = Array.isArray(req.body.tags) ? req.body.tags : [];
  const next = new Set([...(doc.tags || []).map(t => String(t).trim())]);
  for (const t of incoming) next.add(String(t).trim());
  doc.tags = Array.from(next).slice(0, 20);

  await doc.save();
  return R.ok(res, sanitize(doc), 'Tags added');
});

// PATCH /products/:id/tags/remove
exports.removeTags = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  const toRemove = new Set((Array.isArray(req.body.tags) ? req.body.tags : []).map(t => String(t).trim()));
  doc.tags = (doc.tags || []).filter(t => !toRemove.has(String(t).trim()));

  await doc.save();
  return R.ok(res, sanitize(doc), 'Tags removed');
});

// DELETE /products/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;

  // Chặn xoá nếu đang nằm trong phiên mở
  const usedInOpen = await Session.exists({ status: 'open', 'items.product': id });
  if (usedInOpen) return R.fail(res, 409, 'Không thể xoá: Sản phẩm đang nằm trong phiên mở');

  // Chặn xoá nếu đã có lịch sử hoá đơn
  const usedInBills = await Bill.exists({ 'items.product': id });
  if (usedInBills) return R.fail(res, 409, 'Không thể xoá: Sản phẩm đã có lịch sử hóa đơn');

  const doc = await Product.findByIdAndDelete(id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  return R.noContent(res);
});
