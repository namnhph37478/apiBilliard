// routes/v1/index.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const pkg = (() => { try { return require('../../package.json'); } catch { return { name: 'apiBiliard', version: '0.0.0' }; } })();

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 200,
    message: 'OK',
    data: {
      app: pkg.name || 'apiBiliard',
      version: pkg.version || '0.0.0',
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      requestId: req.id || null,
      now: new Date(),
    },
  });
});

router.get('/version', (req, res) => {
  res.json({
    status: 200,
    message: 'OK',
    data: { app: pkg.name || 'apiBiliard', version: pkg.version || '0.0.0', build: process.env.BUILD_ID || null },
  });
});

// ---- Mount các route module nếu có ----
function mountIf(fileBase) {
  const full = path.join(__dirname, fileBase + '.js');
  if (fs.existsSync(full)) {
    router.use(require(full));
  } else {
    console.warn('[routes] skip missing', 'v1/' + fileBase + '.js');
  }
}

mountIf('auth.routes');
mountIf('users.routes');
mountIf('tables.routes');
mountIf('table-types.routes');
mountIf('sessions.routes');
mountIf('products.routes');
mountIf('categories.routes');
mountIf('bills.routes');
mountIf('promotions.routes');
mountIf('reports.routes');
mountIf('settings.routes');

module.exports = router;
