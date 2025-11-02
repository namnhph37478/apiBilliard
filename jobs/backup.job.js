// jobs/backup.job.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { logger, getLogger } = require('../utils/logger');
const { yyyymmdd } = require('../utils/codegen');
const Setting = require('../models/setting.model');
const { getActiveSetting } = require('../services/billing.service'); // tái dùng để lấy setting theo branch (mặc định global)

const BACKUP_DIR = path.join(process.cwd(), 'storage', 'backups');
ensureDir(BACKUP_DIR);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/billiard';
const BACKUP_CRON = process.env.BACKUP_CRON || ''; // vd "0 2 * * *"
const BACKUP_MAX_FILES = Number(process.env.BACKUP_MAX_FILES || 0) || 0; // 0 = bỏ qua

// ================== Helpers ==================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowStamp() {
  const d = new Date();
  const H = String(d.getHours()).padStart(2, '0');
  const M = String(d.getMinutes()).padStart(2, '0');
  const S = String(d.getSeconds()).padStart(2, '0');
  return `${yyyymmdd(d)}_${H}${M}${S}`;
}

/** "HH:mm" -> "m h * * *" */
function cronFromTimeOfDay(hhmm = '02:00') {
  const m = /^\d{2}:\d{2}$/.test(hhmm) ? Number(hhmm.slice(3, 5)) : 0;
  const h = /^\d{2}:\d{2}$/.test(hhmm) ? Number(hhmm.slice(0, 2)) : 2;
  return `${m} ${h} * * *`;
}

/** Xoá file cũ theo retentionDays hoặc max files */
async function pruneOldBackups({ dir = BACKUP_DIR, retentionDays = 7, maxFiles = BACKUP_MAX_FILES }) {
  const lg = getLogger({ scope: 'backup' });
  const files = (await fs.promises.readdir(dir))
    .filter(f => f.endsWith('.archive.gz'))
    .map(f => ({ name: f, path: path.join(dir, f) }));

  if (!files.length) return { deleted: 0, kept: 0 };

  // sort by mtime desc
  const stats = await Promise.all(files.map(async f => {
    const st = await fs.promises.stat(f.path);
    return { ...f, mtime: st.mtime, size: st.size };
  }));
  stats.sort((a, b) => b.mtime - a.mtime);

  const now = Date.now();
  const msDay = 24 * 60 * 60 * 1000;
  let toDelete = [];

  // retention by days
  if (retentionDays > 0) {
    const cutoff = now - retentionDays * msDay;
    toDelete = stats.filter(x => x.mtime.getTime() < cutoff);
  }

  // max files cap (keep most recent)
  if (maxFiles > 0 && stats.length > maxFiles) {
    const extra = stats.slice(maxFiles); // old ones
    toDelete = Array.from(new Set([...toDelete, ...extra]));
  }

  for (const f of toDelete) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.unlink(f.path);
      lg.info('Deleted old backup', { file: f.name, size: f.size });
    } catch (e) {
      lg.warn('Failed to delete backup file', { file: f.name, error: e.message });
    }
  }

  return { deleted: toDelete.length, kept: stats.length - toDelete.length };
}

// ================== Core dump ==================
/**
 * Chạy mongodump --archive=FILE --gzip
 * @returns {Promise<{ ok: boolean, filePath: string, code: number }>}
 */
function runMongoDump({ uri = MONGODB_URI, outDir = BACKUP_DIR } = {}) {
  return new Promise((resolve) => {
    ensureDir(outDir);
    const filename = `backup_${nowStamp()}.archive.gz`;
    const filePath = path.join(outDir, filename);

    const args = [`--uri=${uri}`, `--archive=${filePath}`, '--gzip'];
    const child = spawn('mongodump', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const lg = getLogger({ scope: 'backup' });
    lg.info('Starting mongodump', { args: args.join(' ') });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      const ok = code === 0;
      if (!ok) {
        lg.error('mongodump failed', { code, stderr: stderr.trim() });
        return resolve({ ok, filePath, code });
      }
      lg.info('mongodump success', { filePath });
      return resolve({ ok, filePath, code });
    });
  });
}

// ================== Targets ==================
/**
 * Hiện hỗ trợ target 'local' (mặc định).
 * Các target khác (s3/gdrive) có thể mở rộng tại đây.
 */
async function handleTarget({ target = 'local', filePath, targetConfig = null }) {
  const lg = getLogger({ scope: 'backup' });
  if (target === 'local') {
    // nothing to do
    return { ok: true, location: filePath };
  }
  if (target === 's3') {
    // TODO: upload lên S3 (dùng aws-sdk v3)
    lg.warn('S3 target not implemented yet');
    return { ok: false, location: null };
  }
  if (target === 'gdrive') {
    // TODO: upload Google Drive
    lg.warn('GDrive target not implemented yet');
    return { ok: false, location: null };
  }
  lg.warn('Unknown backup target', { target });
  return { ok: false, location: null };
}

// ================== Public API ==================
/**
 * Thực thi 1 lần ngay lập tức:
 * - Đọc Setting.backup
 * - Nếu enabled=false → bỏ qua
 * - Chạy mongodump
 * - Upload (nếu có)
 * - Prune theo retentionDays & BACKUP_MAX_FILES
 */
async function runBackupOnce({ branchId = null } = {}) {
  const lg = getLogger({ scope: 'backup' });
  try {
    const setting = await getActiveSetting(branchId);
    const bk = setting?.backup || {};
    if (!bk.enabled) {
      lg.info('Backup is disabled in settings');
      return { skipped: true };
    }

    // dump
    const res = await runMongoDump({ uri: MONGODB_URI, outDir: BACKUP_DIR });
    if (!res.ok) return { ...res, skipped: false };

    // target handling
    const tgt = await handleTarget({ target: bk.target || 'local', filePath: res.filePath, targetConfig: bk.targetConfig });
    if (!tgt.ok) lg.warn('Backup target step failed', { target: bk.target });

    // prune
    const pr = await pruneOldBackups({ dir: BACKUP_DIR, retentionDays: bk.retentionDays || 7, maxFiles: BACKUP_MAX_FILES });

    return { ok: true, filePath: res.filePath, pruned: pr };
  } catch (e) {
    lg.error('runBackupOnce error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

/**
 * Lên lịch chạy tự động:
 * - Nếu có env BACKUP_CRON → dùng luôn (vd "0 2 * * *")
 * - Ngược lại đọc Setting.backup.timeOfDay ("HH:mm") → build cron "m h * * *"
 * - Dùng node-cron nếu có (không bắt buộc); nếu thiếu, fallback setInterval kiểm tra từng phút
 */
async function scheduleBackup({ branchId = null } = {}) {
  const lg = getLogger({ scope: 'backup' });
  let cronExp = BACKUP_CRON;

  if (!cronExp) {
    try {
      const setting = await getActiveSetting(branchId);
      const hhmm = setting?.backup?.timeOfDay || '02:00';
      cronExp = cronFromTimeOfDay(hhmm);
    } catch {
      cronExp = cronFromTimeOfDay('02:00');
    }
  }

  // Cố gắng dùng node-cron nếu có
  let cron = null;
  try {
    // eslint-disable-next-line global-require
    cron = require('node-cron');
  } catch {
    cron = null;
  }

  if (cron && cron.validate(cronExp)) {
    cron.schedule(cronExp, async () => {
      await runBackupOnce({ branchId });
    }, { timezone: process.env.TZ || 'Asia/Ho_Chi_Minh' });
    lg.info('Backup scheduled with node-cron', { cron: cronExp });
    return { ok: true, via: 'node-cron', cron: cronExp };
  }

  // Fallback: kiểm tra mỗi phút xem có trùng "m h * * *" không
  const [minStr, hourStr] = cronExp.split(' ');
  const min = Number(minStr);
  const hour = Number(hourStr);
  if (Number.isNaN(min) || Number.isNaN(hour)) {
    lg.error('Invalid cron expression, cannot schedule', { cron: cronExp });
    return { ok: false, error: 'Invalid cron expression' };
  }

  setInterval(async () => {
    const now = new Date();
    if (now.getMinutes() === min && now.getHours() === hour) {
      await runBackupOnce({ branchId });
    }
  }, 60 * 1000);
  lg.info('Backup scheduled with setInterval (fallback)', { when: cronExp });
  return { ok: true, via: 'setInterval', cron: cronExp };
}

// ================== CLI support ==================
/**
 * Cho phép gọi trực tiếp:
 *  - node jobs/backup.job.js run      → chạy 1 lần
 *  - node jobs/backup.job.js schedule → lên lịch theo Setting/ENV
 */
if (require.main === module) {
  const cmd = process.argv[2] || 'run';
  const lg = getLogger({ scope: 'backup' });

  // Kết nối DB trước khi chạy lệnh (re-use config/db if available)
  // Ở codebase của bạn đã có config/db.js; nếu đã connect trong app, đoạn này có thể bỏ.
  (async () => {
    try {
      // eslint-disable-next-line global-require
      const { connect } = require('../config/db');
      await connect();
    } catch (e) {
      lg.warn('DB may already be connected by app or connect() not available', { error: e.message });
    }

    if (cmd === 'run') {
      runBackupOnce().then((r) => {
        lg.info('Backup finished', r);
        process.exit(r?.ok || r?.skipped ? 0 : 1);
      });
    } else if (cmd === 'schedule') {
      scheduleBackup().then((r) => {
        lg.info('Backup scheduler started', r);
      });
    } else {
      console.log('Usage: node jobs/backup.job.js [run|schedule]');
      process.exit(0);
    }
  })();
}

module.exports = {
  runBackupOnce,
  scheduleBackup,
  pruneOldBackups,
  BACKUP_DIR,
};
