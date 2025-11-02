// scripts/seed-admin.js
require('dotenv').config();
const db = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    await db.connect();
    const conn = mongoose.connection;
    console.log('🔌 URI:', process.env.MONGODB_URI);
    console.log('📦 DB name:', conn.name);
    console.log('👤 User model => collection:', User.collection.collectionName);

    const username = (process.env.SEED_ADMIN_USER || 'admin').toLowerCase();
    const password = process.env.SEED_ADMIN_PASS || 'admin123';

    let u = await User.findOne({ username });
    if (!u) {
      u = new User({
        username,
        name: 'Administrator',
        role: 'admin',
        active: true,
      });
    } else {
      u.role = 'admin';
      u.active = true;
      if (!u.name) u.name = 'Administrator';
    }

    // Chuẩn hoá về passwordHash
    const salt = await bcrypt.genSalt(10);
    u.passwordHash = await bcrypt.hash(password, salt);

    // Nếu schema yêu cầu field "password", gán thêm để pass validate (dev)
    if (User.schema.path('password') && !u.password) {
      u.password = password;
    }

    await u.save();
    console.log('🎉 Admin upserted:', { id: u.id, username: u.username, role: u.role, active: u.active });

    const count = await User.countDocuments();
    console.log('👥 User count (after):', count);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed admin failed:', err);
    process.exit(1);
  }
})();
