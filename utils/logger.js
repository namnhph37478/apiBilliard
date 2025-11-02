// utils/logger.js
const os = require('os');
const crypto = require('crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');
const LOG_PRETTY = process.env.LOG_PRETTY || (!isProd ? 'true' : 'false');

let pino = null;
let pinoPrettyTransport = null;

/** Thử nạp pino và pino-pretty (không bắt buộc) */
try {
  // eslint-disable-next-line global-require
  pino = require('pino');
  if (LOG_PRETTY === 'true') {
    // pino v8+ transport
    // eslint-disable-next-line global-require
    pinoPrettyTransport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        singleLine: true,
        ignore: 'pid,hostname',
      },
    });
  }
} catch (_e) {
  pino = null;
}

function createBaseLogger() {
  if (pino) {
    return pino({
      level: LOG_LEVEL,
      base: { app: 'apiBiliard', env: NODE_ENV, hostname: os.hostname() },
      redact: {
        paths: ['req.headers.authorization', 'password', '*.password'],
        remove: true,
      },
    }, pinoPrettyTransport || undefined);
  }

  // Fallback: console-based logger
  const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
  const allowIdx = levels.indexOf(LOG_LEVEL);
  const ok = (lvl) => levels.indexOf(lvl) <= allowIdx;

  const fmt = (lvl, msg, obj) => {
    const ts = new Date().toISOString();
    const base = `[${ts}] ${lvl.toUpperCase()}: ${msg}`;
    if (!obj) return base;
    try { return `${base} ${JSON.stringify(obj)}`; } catch { return `${base}`; }
  };

  return {
    level: LOG_LEVEL,
    fatal: (m, o) => ok('fatal') && console.error(fmt('fatal', m, o)),
    error: (m, o) => ok('error') && console.error(fmt('error', m, o)),
    warn:  (m, o) => ok('warn')  && console.warn(fmt('warn',  m, o)),
    info:  (m, o) => ok('info')  && console.log(fmt('info',  m, o)),
    debug: (m, o) => ok('debug') && console.debug(fmt('debug', m, o)),
    trace: (m, o) => ok('trace') && console.debug(fmt('trace', m, o)),
    child: (bindings = {}) => {
      return {
        ...this,
        info:  (m, o) => ok('info')  && console.log(fmt('info',  m, { ...bindings, ...o })),
        debug: (m, o) => ok('debug') && console.debug(fmt('debug', m, { ...bindings, ...o })),
        warn:  (m, o) => ok('warn')  && console.warn(fmt('warn',  m, { ...bindings, ...o })),
        error: (m, o) => ok('error') && console.error(fmt('error', m, { ...bindings, ...o })),
        trace: (m, o) => ok('trace') && console.debug(fmt('trace', m, { ...bindings, ...o })),
        fatal: (m, o) => ok('fatal') && console.error(fmt('fatal', m, { ...bindings, ...o })),
      };
    },
  };
}

const logger = createBaseLogger();

/** Lấy child logger cho module/feature */
function getLogger(bindings = {}) {
  try {
    return logger.child ? logger.child(bindings) : logger;
  } catch {
    return logger;
  }
}

/** Middleware gắn req.id (x-request-id) để trace log */
function requestId(req, res, next) {
  let id =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  id = String(id);
  req.id = id;
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/** HTTP logger (thay morgan), log sau khi response hoàn tất */
function httpLogger(options = {}) {
  const lg = getLogger({ scope: 'http' });
  const level = options.level || (isProd ? 'info' : 'debug');
  const getUser = (req) => {
    const u = req.user;
    if (!u) return null;
    return { id: String(u._id || u.id || ''), role: u.role, username: u.username, name: u.name };
  };

  return function (req, res, next) {
    const start = process.hrtime.bigint();
    const ip =
      (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
      req.ip || req.connection?.remoteAddress || null;

    // Khi kết thúc response
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durMs = Number(end - start) / 1e6;
      const payload = {
        id: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        length: Number(res.getHeader('content-length') || 0),
        durMs: Math.round(durMs),
        ip,
        ua: req.get('user-agent') || null,
        user: getUser(req),
      };

      if (lg[level]) lg[level]('HTTP', payload);
      else lg.info('HTTP', payload);
    });

    next();
  };
}

module.exports = {
  logger,
  getLogger,
  requestId,
  httpLogger,
};
