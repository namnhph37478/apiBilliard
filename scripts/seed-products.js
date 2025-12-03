require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const ProductCategory = require('../models/product-category.model');
const Product = require('../models/product.model');

async function seedProducts() {
  try {
    // Kết nối MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/billiard';
    console.log(`🔌 Connecting to: ${mongoUri}`);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');

    // ===== SEED CATEGORIES =====
    console.log('\n📂 Seeding Product Categories...');
    
    const categories = [
      {
        name: 'Đồ uống',
        code: 'DRINK',
        description: 'Các loại nước uống lạnh, nóng, có gas',
        icon: '/uploads/icons/drink.png',
        color: '#3b82f6',
        orderIndex: 1,
        active: true,
      },
      {
        name: 'Giờ chơi',
        code: 'TIMEPLAY',
        description: 'Các loại giờ chơi billiard',
        icon: '/uploads/icons/game.png',
        color: '#8b5cf6',
        orderIndex: 2,
        active: true,
      },
      {
        name: 'Đồ ăn',
        code: 'FOOD',
        description: 'Các loại đồ ăn vặt, bánh mì',
        icon: '/uploads/icons/food.png',
        color: '#ef4444',
        orderIndex: 3,
        active: true,
      },
    ];

    const createdCategories = await ProductCategory.insertMany(categories, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        console.log('⚠️  Categories already exist (duplicate key), skipping...');
        return ProductCategory.find({ code: { $in: categories.map(c => c.code) } });
      }
      throw err;
    });

    console.log(`✅ ${createdCategories.length} categories seeded/found`);

    // Lấy ID danh mục để dùng cho sản phẩm
    const drinkCat = await ProductCategory.findOne({ code: 'DRINK' });
    const gameCat = await ProductCategory.findOne({ code: 'TIMEPLAY' }); // ← Sửa từ 'GAME' → 'TIMEPLAY'
    const foodCat = await ProductCategory.findOne({ code: 'FOOD' });

    // ===== SEED PRODUCTS =====
    console.log('\n🛍️  Seeding Products...');
    
    const products = [
      // Nước uống
      {
        name: 'Coca Cola',
        sku: 'COCA330',
        category: drinkCat._id,
        price: 45000,
        unit: 'chai',
        isService: false,
        images: ['/uploads/products/coca-cola.jpg'],
        tags: ['cola', 'nước ngọt', 'lạnh'],
        active: true,
        note: 'Hàng mới 330ml',
      },
      {
        name: 'Trà đá',
        sku: 'TRAD001',
        category: drinkCat._id,
        price: 0,
        unit: 'ly',
        isService: false,
        images: ['/uploads/products/tra-da.jpg'],
        tags: ['trà', 'lạnh', 'đặc biệt'],
        active: true,
        note: 'Miễn phí',
      },
      {
        name: 'Pepsi',
sku: 'PEPSI330',
        category: drinkCat._id,
        price: 40000,
        unit: 'chai',
        isService: false,
        images: ['/uploads/products/pepsi.jpg'],
        tags: ['cola', 'nước ngọt'],
        active: true,
      },
      {
        name: 'Nước lọc',
        sku: 'WATER001',
        category: drinkCat._id,
        price: 5000,
        unit: 'ly',
        isService: false,
        images: ['/uploads/products/water.jpg'],
        tags: ['nước', 'sạch'],
        active: true,
      },

      // Giỏ chơi (dịch vụ)
      {
        name: 'Giỏ chơi tiêu chuẩn',
        sku: 'GAME001',
        category: gameCat._id,
        price: 50000,
        unit: 'cái',
        isService: true,  // Là dịch vụ
        images: ['/uploads/products/gio-choi.jpg'],
        tags: ['giờ', 'chơi', 'tiêu chuẩn'],
        active: true,
        note: 'Giờ chơi billiard chuẩn quốc tế',
      },

      // Đồ ăn
      {
        name: 'Bánh mì',
        sku: 'BREAD001',
        category: foodCat._id,
        price: 20000,
        unit: 'cái',
        isService: false,
        images: ['/uploads/products/banh-mi.jpg'],
        tags: ['bánh', 'ăn vặt'],
        active: true,
      },
      {
        name: 'Khoai tây chiên',
        sku: 'FRIED001',
        category: foodCat._id,
        price: 30000,
        unit: 'phần',
        isService: false,
        images: ['/uploads/products/khoai-tay-chien.jpg'],
        tags: ['khoai tây', 'chiên'],
        active: true,
      },
    ];

    const createdProducts = await Product.insertMany(products, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        console.log('⚠️  Some products already exist (duplicate key), continuing...');
        return [];
      }
      throw err;
    });

    console.log(`✅ ${createdProducts.length} products seeded`);

    // ===== SUMMARY =====
    const totalCategories = await ProductCategory.countDocuments();
    const totalProducts = await Product.countDocuments();

    console.log('\n📊 Summary:');
    console.log(`   Total Categories: ${totalCategories}`);
    console.log(`   Total Products: ${totalProducts}`);

    console.log('\n✨ Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    process.exit(1);
  }
}

seedProducts();