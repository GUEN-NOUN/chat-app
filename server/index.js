'use strict';

/**
 * server/index.js — Main entry point
 *
 * Express (REST API) + Socket.io (realtime) on same HTTP port.
 *
 * Usage:
 *   cd server && npm install && node index.js
 *
 * Environment variables:
 *   PORT            HTTP port (default 3000)
 *   JWT_SECRET      Secret for signing JWTs
 *   NODE_ENV        'production' enables secure cookies + strict CORS
 *   OPENAI_API_KEY  For GPT agents
 *   GEMINI_API_KEY  For Gemini agents
 *   ADMIN_EMAIL     Seed admin email (optional)
 *   ADMIN_PASSWORD  Seed admin password (optional)
 */

const path         = require('path');
const http         = require('http');
const express      = require('express');
const { Server }   = require('socket.io');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const compression  = require('compression');
const morgan       = require('morgan');

// Load environment variables from .env BEFORE anything else imports process.env keys
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Routes
const { router: authRouter }         = require('./auth');
const { router: uploadRouter }        = require('./upload');
const usersRouter                     = require('./routes/users');
const chatsRouter                     = require('./routes/chats');
const messagesRouter                  = require('./routes/messages');
const agentsRouter                    = require('./routes/agents');
const adminRouter                     = require('./routes/admin');
const orientationRouter               = require('./routes/orientation');
const { requireAuth, requireNotBanned } = require('./middleware/auth');

// Realtime
const { attachSocket } = require('./socket/index');

const PORT    = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const app     = express();

/* ── Trust reverse proxy (nginx) — needed for real IPs + rate limiting ────── */
if (IS_PROD) app.set('trust proxy', 1);

/* ── HTTP request logging ─────────────────────────────────────────────────── */
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

/* ── Gzip compression ─────────────────────────────────────────────────────── */
app.use(compression({ threshold: 1024 }));

/* ── Security: warn about missing env vars in production ─────────────────── */
if (IS_PROD && !process.env.JWT_SECRET) {
  console.warn('[⚠️  SECURITY] JWT_SECRET not set — using random secret. Tokens will break on restart!');
  console.warn('   Set JWT_SECRET in your environment or .env file.');
}
if (IS_PROD && !process.env.ALLOWED_ORIGINS) {
  console.warn('[⚠️  CORS] ALLOWED_ORIGINS not set — all cross-origin requests will be blocked in production.');
  console.warn('   Set ALLOWED_ORIGINS=https://yourdomain.com in your environment.');
}

/* ── Security headers ── */
const prodOrigins = IS_PROD
  ? (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  : [];
const wsOrigins = prodOrigins.map(o => o.replace(/^https?/, 'wss'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https://img.youtube.com", "blob:", "http://localhost:3000"],
      connectSrc: [
        "'self'",
        "ws://localhost:*", "wss://localhost:*",
        ...wsOrigins,
        "https://api.openai.com",
        "https://generativelanguage.googleapis.com",
        "https://openrouter.ai"
      ],
      mediaSrc:   ["'self'", "blob:", "https:"],
      frameSrc:   ["'self'", "https://www.youtube.com", "https://*.soutiensco.com"]
    }
  },
  frameguard:     { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

/* ── CORS ─────────────────────────────────────────────────────────────────── */
const allowedOrigins = IS_PROD
  ? (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  : null; // null = allow all origins in dev

const corsOptions = {
  origin: IS_PROD
    ? (allowedOrigins.length > 0
        ? (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) cb(null, true);
            else cb(new Error('CORS: origin not allowed'));
          }
        : false)   // block all cross-origin in prod if no list provided
    : true,        // allow all in dev
  credentials: true
};
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

/* ── API routes ───────────────────────────────────────────────────────────── */
app.use('/api/auth',     authRouter);
app.use('/api/upload',   uploadRouter);
app.use('/api/users',    usersRouter);
app.use('/api/chats',    requireAuth, requireNotBanned, chatsRouter);
app.use('/api/messages', requireAuth, requireNotBanned, messagesRouter);
app.use('/api/agents',   requireAuth, requireNotBanned, agentsRouter);
app.use('/api/admin',       adminRouter);
app.use('/api/orientation', orientationRouter);

/* ── Uploads static serving ───────────────────────────────────────────────── */
// In production with Docker+nginx, nginx serves /uploads/ directly.
// Without Docker (bare PM2), Express serves it here.
if (!process.env.NGINX_SERVES_UPLOADS) {
  const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
  app.use('/uploads', express.static(UPLOAD_DIR, {
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }));
}

/* ── Health check ─────────────────────────────────────────────────────────── */
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()), ts: new Date().toISOString() });
});

/* ── Service Worker — always serve fresh, never cached ───────────────────── */
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, '..', 'www', 'sw.js'));
});

/* ── Serve built chat React app ─────────────────────────────────────────────*/
const CHAT_DIST = path.join(__dirname, '..', 'www', 'chat');
app.use('/chat', express.static(CHAT_DIST, {
  index: 'index.html',
  etag: true,
  lastModified: true,
  setHeaders(res, fp) {
    if (fp.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.[a-f0-9]{8}\.(js|css)$/.test(fp) || /assets\//.test(fp)) {
      // Hashed Vite assets — immutable forever cache
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(js|css)$/.test(fp)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (/\.(woff2?|ttf|eot|svg|png|jpg|webp|ico)$/.test(fp)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

/* ── Chat SPA fallback (handles React Router sub-routes like /chat/room/xyz) */
app.get('/chat/*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(CHAT_DIST, 'index.html'));
});

/* ── Serve main www frontend ──────────────────────────────────────────────── */
const WWW_ROOT = path.join(__dirname, '..', 'www');
app.use(express.static(WWW_ROOT, {
  extensions: ['html'],
  index: 'index.html',
  etag: true,
  lastModified: true,
  setHeaders(res, fp) {
    if (fp.endsWith('.html') || fp.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(js|css)$/.test(fp)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (/\.(woff2?|ttf|eot|svg|png|jpg|webp|ico|gif)$/.test(fp)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

/* ── General SPA fallback ─────────────────────────────────────────────────── */
app.get('*', (_req, res) => res.sendFile(path.join(WWW_ROOT, 'index.html')));

/* ── HTTP + Socket.io server ──────────────────────────────────────────────── */
const server = http.createServer(app);
const io     = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  /* ── Socket.io performance tuning ── */
  pingInterval: 25000,      // keep-alive every 25s (default)
  pingTimeout:  20000,      // wait 20s before disconnect
  maxHttpBufferSize: 1e6,   // 1 MB max message (prevents abuse)
  perMessageDeflate: {      // compress WebSocket frames
    threshold: 1024,        // only compress messages > 1 KB
    zlibDeflateOptions: { level: 6 },
  },
  httpCompression: true,    // compress HTTP long-polling
});
/* ── Optional Redis adapter (set REDIS_URL to enable) ────────────────────── */
if (process.env.REDIS_URL) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const Redis              = require('ioredis');
    const pubClient          = new Redis(process.env.REDIS_URL);
    const subClient          = pubClient.duplicate();
    pubClient.on('error', err => console.error('[Redis pub]', err.message));
    subClient.on('error', err => console.error('[Redis sub]', err.message));
    io.adapter(createAdapter(pubClient, subClient));
    if (!IS_PROD) console.log('  ✔ Redis adapter attached:', process.env.REDIS_URL);
  } catch (e) {
    console.warn('  ⚠ Redis packages not installed — running without Redis adapter.');
    if (!IS_PROD) console.warn('    Run: npm install @socket.io/redis-adapter ioredis');
  }
}

// Attach Socket.io handlers
attachSocket(io);

// Start HTTP + WebSocket server
server.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log('');
  console.log('────────────────────────────────────────────');
  console.log(`  HTTP server listening on ${base}`);
  console.log(`  REST API:   ${base}/api`);
  console.log(`  Chat UI:    ${base}/chat/`);
  console.log('────────────────────────────────────────────');
});

module.exports = { app, server, io };
