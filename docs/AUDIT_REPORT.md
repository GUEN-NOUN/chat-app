# مدارك التعليمية — Full Project Audit Report

> Generated after a complete file-by-file analysis of the entire codebase.

---

## 1. Project Overview

| Property | Value |
|---|---|
| **Name** | مدارك التعليمية (Madarik) |
| **Type** | Arabic educational platform — static pages + real-time chat |
| **Stack** | Node.js/Express · Socket.io · SQLite (better-sqlite3) · React/Vite (client) · Capacitor v8 (Android) |
| **Server** | `server/` — Express REST API + Socket.io on port 3000 |
| **Frontend** | `www/` (built from root) + `client/` (React SPA for chat) |
| **Auth** | JWT for chat users (7-day), JWT in HTTP-only cookie for admin (2-hour) |
| **Deployment** | Docker + Nginx OR Bare PM2; static frontend → GitHub Pages |

---

## 2. Directory Structure

```
chat-app/
├── server/                  ← Node.js backend (Express + Socket.io)
│   ├── index.js             ← Main entry, Express config, Socket.io setup
│   ├── db.js                ← SQLite layer, schema, prepared statements
│   ├── auth.js              ← Admin auth routes + JWT (POST /api/auth/*)
│   ├── upload.js            ← File upload endpoint (POST /api/upload)
│   ├── middleware/
│   │   └── auth.js          ← requireAdmin / requireAuth / optionalAuth
│   ├── routes/
│   │   ├── users.js         ← User registration + profile
│   │   ├── chats.js         ← Room CRUD + membership
│   │   ├── messages.js      ← Message history + reactions + delete
│   │   ├── agents.js        ← AI agent CRUD + /agents/:id/chat
│   │   └── admin.js         ← Admin dashboard API
│   ├── socket/
│   │   └── index.js         ← Socket.io event handlers (core real-time logic)
│   ├── services/
│   │   └── ai.service.js    ← OpenAI, Gemini, OpenRouter (streaming + standard)
│   └── tests/
│       └── api.test.js      ← Basic integration tests (manual run)
├── js/                      ← Static frontend JS (loaded in HTML pages)
│   ├── config.js            ← APP_CONFIG: API_URL, WS_URL, levels, storage keys
│   ├── admin-panel.js       ← Admin dashboard UI logic
│   ├── chat.js              ← Legacy LocalStorage chat (pre-server)
│   ├── auth.js              ← Frontend auth helpers
│   └── ...                  ← rbac.js, friends.js, groups.js, etc.
├── css/                     ← Styles
├── assets/                  ← Shared assets (chat.js, navbar.js, styles.css)
├── client/                  ← React/Vite chat SPA
├── android/                 ← Capacitor Android wrapper
├── www/                     ← BUILD OUTPUT (gitignored, rebuilt by build-www.ps1)
├── sw.js                    ← Service Worker (Network-First strategy)
├── capacitor.config.json    ← Capacitor config
├── package.json             ← Root scripts (build, sync, deploy)
└── [HTML pages]             ← Static educational content pages
```

---

## 3. File-by-File Analysis

### `server/index.js` ✅ Good
- Express + Socket.io on same HTTP server
- Helmet CSP configured correctly — allows API origins (OpenAI, Gemini, OpenRouter)
- CORS: `null` (all) in dev, `ALLOWED_ORIGINS` list in production
- Gzip compression with 1KB threshold
- Morgan request logging (combined in prod, dev otherwise)
- Cache headers: `immutable` for Vite hashed assets, 24h for JS/CSS, 7d for fonts/images
- Socket.io: `perMessageDeflate`, `maxHttpBufferSize: 1MB`, Redis adapter optional
- **`/chat/*` SPA fallback and `/api/*` routing is correct**

### `server/db.js` ✅ Optimized
- 6 SQLite pragmas: WAL mode, foreign keys, synchronous=NORMAL, 8MB cache, temp in memory, 64MB mmap
- 9 indexes including `idx_msg_deleted`, `idx_users_status`, `idx_reactions_msg`
- 40+ pre-compiled `_stmts` statements — defined before seed section (ordering was fixed)
- Seed wrapped in `db.transaction()` — atomic and faster
- Non-destructive migration guard for `chat_messages.id` TEXT vs INTEGER
- `updateAgent()` uses dynamic `db.prepare()` at call time (unavoidable for partial updates)
- **Schema is complete**: admins, users, chat_rooms, room_members, chat_messages, reactions, read_receipts, ai_agents, ai_usage

### `server/auth.js` ⚠️ JWT Secret Issue
- Admin login (POST `/api/auth/login`) — correct bcrypt + rate limiter (10 attempts / 15 min)
- Defines its own `JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48)`
- **BUG**: `server/middleware/auth.js` also defines `JWT_SECRET` independently with the same fallback. If `JWT_SECRET` env variable is **not set**, these two modules generate **different random secrets** at startup. Admin tokens from `auth.js` cannot be verified by `middleware/auth.js` (`requireAuth`). See §4 for fix.

### `server/middleware/auth.js` ✅ Correct
- `requireAdmin` — checks cookie `madarik_token`
- `requireAuth` — checks Bearer header OR cookie
- `optionalAuth` — non-blocking version
- Exports `JWT_SECRET` for consumption by `upload.js` and `users.js`

### `server/upload.js` ✅ Secure
- Magic-byte validation (not just Content-Type header) — good OWASP practice
- UUID-named storage — prevents path traversal
- Per-type size limits (5MB image, 20MB PDF, 50MB video)
- Auth accepts both admin cookie and chat JWT Bearer
- Rate-limited: 30 uploads per 15 min per IP
- `audio/webm` vs `video/webm` container handled (WebM can carry audio or video)

### `server/routes/users.js` ⚠️ Minor Issues
- Registration endpoint correctly sanitizes `username` (strips `<>`, slices to 40 chars)
- Rate-limited: 20 register/min per IP
- **Double import**: imports `{ upsertUser, getUser }` at top AND re-does `require('../db')` inside search route — harmless but inconsistent  
- Username sanitization only strips `<>` — unicode lookalike attacks possible but low risk for this context

### `server/routes/chats.js` ⚠️ Authorization Gap
- GET `/api/chats/:id` returns full room info + member list
- **No membership check for private/group rooms** — any authenticated user can fetch another user's private room details by guessing/knowing the room ID
- `POST /api/chats/:id/members` allows any member to add anyone to any room they know the ID of

### `server/routes/messages.js` ⚠️ Performance Issue
- `annotateMedia()`: calls `fs.existsSync()` **synchronously for every message with media** — for 50 messages, that's up to 50 disk stat calls per request. See §4.
- `getReactions(m.id)` called individually per message (~50 extra SQLite queries per request) — should be a bulk query

### `server/routes/agents.js` ⚠️ Provider Validation Gap
- `POST /api/agents` validates provider ∈ `['openai', 'gemini', 'custom']` only
- Seeded agents use `'openrouter'` and `'auto'` providers — admin cannot create these via the API
- Missing `'openrouter'` and `'auto'` in the allowed list

### `server/socket/index.js` ✅ Well-Structured
- Per-socket sliding-window rate limiter (10 msgs / 10s) — good
- `annotateMedia()` duplicated from `routes/messages.js` — should be shared
- `sanitize()` strips `<>` and limits body to 4000 chars
- Data URI check (`/^data:/i`) blocks base64 image injection — good
- `media_url` validated with regex `^/uploads/[^/]+$` — prevents path traversal
- AI fallback: if primary agent has no API key, falls back to `agent-gemini-free`
- Daily AI quota enforced (default 50/day)
- Presence tracking via `roomPresence` Map — cleaned up on disconnect

### `server/services/ai.service.js` ✅ Optimized
- HTTP keep-alive agent reuses TCP connections across all 3 providers
- LRU cache (500 entries, 5-min TTL) for non-streaming calls
- Streaming implemented for all 3 providers (OpenAI, Gemini, OpenRouter)
- SSE buffer handled correctly (splits on `\n`, keeps incomplete last line)
- 30s timeout on all streaming requests
- **`HTTP-Referer: http://localhost:3000`** hardcoded in OpenRouter calls — send production URL instead

### `server/routes/admin.js` ✅ Well-Optimized
- 30+ pre-compiled `_adminStmts` statements
- `_getStats` transaction wraps all 15 stat queries atomically
- Dynamic search in `GET /api/admin/users` uses `db.prepare(sql).all()` at call time (unavoidable for variable WHERE clause) — acceptable
- **Ban/unban routes don't confirm user exists** — results in silent no-op on invalid ID
- Message delete is soft-delete (`deleted=1`) — correct, prevents data loss

### `server/tests/api.test.js` ✅ Useful
- Manual integration tests for `/health`, `/api/auth/chat-token`, `/api/users/register`
- Run with `node tests/api.test.js` while server is running
- No test framework dependency — pure Node.js

### `js/config.js` ⚠️ Dead Storage Keys
- `API_URL` and `WS_URL` correctly detect Capacitor native vs localhost vs production
- `STORAGE_KEYS` contains ~10 keys from the old localStorage-based auth system (`ADMIN_CREDENTIALS`, `AUDIT_LOGS`, `USER_SUSPENSIONS`, `ADMIN_ROLES`, `REPORTS`) — these are **dead code** since auth moved server-side
- LAN IP `192.168.5.1` in Capacitor path doesn't match actual Wi-Fi IP `192.168.1.141`

### `sw.js` ✅ Correct
- Network-First strategy — always fresh, then cache fallback
- Correctly skips `/api/`, `/chat/`, `/socket.io/` paths (never caches auth/chat data)
- Skips non-GET requests
- `skipWaiting()` + `clients.claim()` ensures immediate activation
- Version is kept in sync via `bump-version.py`

### `capacitor.config.json` ⚠️ IP Mismatch
- `allowMixedContent: true` — required for LAN HTTP (acceptable for local dev)
- `allowNavigation: ['192.168.5.1:3000']` — wrong IP (should be `192.168.1.141`)
- `server.url` not hardcoded — uses dynamic detection in `js/config.js`

### `package.json` (root) ✅ Clean
- Builds client (`npm run build` in client/) and syncs to Android via Capacitor
- `deploy` script targets `gh-pages -d www` (static frontend only — no server)
- Clean devDependencies: only `capacitor`, `concurrently`, `eslint`, `gh-pages`, `prettier`

### `server/package.json` ✅ Slimmed
- Production deps: bcryptjs, better-sqlite3, compression, cookie-parser, cors, express, express-rate-limit, helmet, jsonwebtoken, morgan, multer, socket.io, uuid
- `ws` removed (bundled in socket.io)
- Redis adapter moved to `optionalDependencies` — not installed by default

### `.gitignore` ✅ Comprehensive
- Correctly excludes: `.env`, `node_modules/`, `client/dist/`, `.venv/`, `www/`, `*.db`, `*.db-wal`, `*.db-shm`, `android/build/`, `*.log`

### `build-www.ps1` ✅ (from previous analysis)
- Builds client, copies 54 files to `www/` and syncs to Android
- Verified: all 54 files identical between source and www

---

## 4. Issues by Severity

### 🔴 Critical

#### C1 — Dual JWT_SECRET (Broken Cross-Module Token Verification)
**File**: `server/auth.js` line 15 + `server/middleware/auth.js` line 4

Both files do:
```js
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
```
If `JWT_SECRET` is not set, Node.js evaluates this **independently in each module**, producing **two different random secrets**. Admin login via `auth.js` signs tokens with secret A. When those tokens reach `requireAuth` in `middleware/auth.js`, they're verified against secret B → always rejected.

**Fix**: Export `JWT_SECRET` from ONE module only and import it everywhere else. `middleware/auth.js` already exports it — `auth.js` should import it from there.

```js
// In server/auth.js — REPLACE the local declaration:
const { JWT_SECRET, COOKIE_NAME } = require('./middleware/auth');
```

---

### 🟠 High

#### H1 — Hardcoded Admin Seed Credentials
**File**: `server/db.js` lines ~295-300

```js
} else {
  seedAdmin('achraf1258@gmail.com', 'achraf1258');
}
```
If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are not set in `.env`, a known admin account is created. Anyone who finds the repository can log in as admin.

**Fix**: In production, always set `ADMIN_EMAIL` + `ADMIN_PASSWORD` in the environment. As a safeguard, add a production guard:

```js
} else if (!IS_PROD) {
  seedAdmin('achraf1258@gmail.com', 'achraf1258');
} else {
  console.error('[SECURITY] No ADMIN_EMAIL/PASSWORD set in production — no admin account seeded!');
}
```

#### H2 — Real API Key in `.env`
**File**: `server/.env`

`OPENROUTER_API_KEY=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`

The `.env` file is gitignored (good), but this key was visible in session summaries. Rotate this key at [openrouter.ai/keys](https://openrouter.ai/keys) and generate a new one.

#### H3 — Private Room Info Leakable
**File**: `server/routes/chats.js` — `GET /api/chats/:id`

Any authenticated chat user can fetch the details + member list of ANY room (including private/group rooms) by ID. An attacker who obtains a room ID can enumerate members of private rooms.

**Fix**:
```js
router.get('/:id', requireAuth, (req, res) => {
  const room = getRoomById(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
  const userId = req.user.userId || req.user.id;
  if (room.type !== 'public') {
    const members = getRoomMembers(req.params.id);
    const isMember = members.some(m => m.id === userId);
    if (!isMember && !req.user.role) return res.status(403).json({ ok: false, error: 'Access denied' });
  }
  // ...
});
```

---

### 🟡 Medium

#### M1 — `annotateMedia()` — Synchronous Disk I/O Per Message
**Files**: `server/routes/messages.js` line 11 + `server/socket/index.js` line 50

Every message with a `media_url` triggers `fs.existsSync()` — synchronous disk access that blocks the Node.js event loop. For a room with 50 media messages, that's 50 blocking disk stats per request.

**Fix**: Store a `media_verified` INTEGER column in the DB, OR check file existence only at upload time and store the result. Alternatively use `fs.promises.stat()` and promiseAll.

#### M2 — `getReactions()` Called Per Message (N+1 Query)
**File**: `server/routes/messages.js` lines 36-40

```js
const enriched = annotateMedia(messages).map(m => ({
  ...m,
  reactions: getReactions(m.id)  // ← 1 query per message = up to 100 queries
}));
```

**Fix**: Use a single bulk query joining reactions grouped by `message_id`, then map results to messages by ID.

#### M3 — `annotateMedia()` Duplicated
**Files**: `routes/messages.js` and `socket/index.js` — identical implementations

**Fix**: Extract to `server/utils.js` or `server/db.js` and import in both places.

#### M4 — Agent Provider Whitelist Missing `openrouter` and `auto`
**File**: `server/routes/agents.js` line 38

```js
const allowed = ['openai', 'gemini', 'custom'];
```
Admin cannot create OpenRouter or Auto agents via the API, only the seeded ones exist.

**Fix**: Add `'openrouter'` and `'auto'` to the allowed list.

#### M5 — OpenRouter `HTTP-Referer` Hardcoded as Localhost
**File**: `server/services/ai.service.js` — `callOpenRouter()` and `streamOpenRouter()`

```js
'HTTP-Referer': 'http://localhost:3000',
```
In production, this should be your actual domain so OpenRouter's dashboard shows correct attribution.

**Fix**:
```js
'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
```

#### M6 — `POST /api/chats/:id/members` Has No ACL
**File**: `server/routes/chats.js` lines 56-63

Any authenticated user can add any other user to any room they know the ID of, including group/AI rooms owned by others.

---

### 🟢 Low / Informational

#### L1 — Dead Storage Keys in Config
**File**: `js/config.js`

`STORAGE_KEYS` contains keys for the old localStorage-based auth system (`ADMIN_CREDENTIALS`, `AUDIT_LOGS`, `USER_SUSPENSIONS`, `ADMIN_ROLES`, `REPORTS`) that are no longer used since server-side JWT replaced them. Safe to remove from config.

#### L2 — Ban/Unban Routes Don't Validate User Existence
**File**: `server/routes/admin.js`

`POST /api/admin/users/:id/ban` runs silently even if the user ID doesn't exist. No error is returned.

**Fix**: Check if the user exists before running the update, return 404 if not found.

#### L3 — `server/.env` Has `NODE_ENV=development` and Empty `ADMIN_PASSWORD`
When `ADMIN_PASSWORD` is empty/unset, the fallback hardcoded credentials (H1) will be used regardless of `ADMIN_EMAIL`. Confirm `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set before deploying.

#### L4 — LAN IP Mismatch in Capacitor Config
**File**: `capacitor.config.json`

`allowNavigation` and `js/config.js` use `192.168.5.1:3000` but the actual Wi-Fi IP is `192.168.1.141`. Android app cannot reach the server.

**Fix**: Update `capacitor.config.json` and `js/config.js`/`www/js/config.js` to use the correct IP, or use a script to inject it at build time.

#### L5 — `/api/auth/chat-token` Endpoint Not Defined
**File**: `server/tests/api.test.js` tests `POST /api/auth/chat-token` but no such route exists in `server/auth.js` (which only has `/login`, `/logout`, `/me`). The actual token endpoint is `POST /api/users/register`. Tests will fail on this route.

#### L6 — `updateAgent()` Uses Dynamic `db.prepare()` at Call Time
**File**: `server/db.js` — `updateAgent()` function

Dynamic field-update utility that creates a prepared statement at call time. Acceptable since it's admin-only and infrequent, but worth noting.

---

## 5. Redundant / Stale Files

| File | Issue | Action |
|---|---|---|
| `Xxxxx.html` | Unnamed test/placeholder page | Delete |
| `boot-test.log` | Log file committed to repo | Delete (covered by `*.log` in gitignore now) |
| `PROMPT.md` | Internal AI prompt file — should not be in public repo | Delete or move to `.gitignore` |
| `82617f228c27fd68fff847fec2acce94_1774801722.mp4` | Random video file in project root | Delete |
| `www/` | Build output — gitignored but still on disk | Run `git rm -r --cached www/` if committed |
| `server/.env` in session summary | Real API key exposed in session context | Rotate OpenRouter key |

---

## 6. Missing Features / Gaps

| Gap | Impact |
|---|---|
| No user profile update endpoint | Users can never change their username/avatar after registration |
| No message edit endpoint | Only soft-delete exists (`deleted=1`) |
| No upload file cleanup job | Files for deleted messages accumulate on disk forever |
| `/health` doesn't check DB | Server reports healthy even if DB is locked/corrupt |
| No room deletion endpoint | Rooms can only be created, never deleted via API |
| No pagination cursor for reactions | `getReactions()` returns all reactions for a message — could be large |
| No input validation on `replyTo` field | Socket handler passes `replyTo || null` without checking it's a valid message ID |

---

## 7. Security Posture Summary

| Category | Status | Notes |
|---|---|---|
| SQL Injection | ✅ Protected | All queries use prepared statements |
| XSS | ✅ Protected | `sanitize()` in socket, `<>` stripped in registration |
| CSRF | ✅ Protected | `sameSite: Lax` on admin cookie |
| Password Storage | ✅ Secure | bcrypt with cost factor 12 |
| Brute Force | ✅ Protected | Rate limiters on login (10/15min) and register (20/min) |
| Path Traversal | ✅ Protected | Uploads use UUID names, `media_url` validated with regex |
| File Upload Abuse | ✅ Protected | Magic-byte validation, per-type size limits |
| JWT Secret | 🔴 **BUG** | Dual independent declarations — see C1 |
| Admin Credentials | 🟠 Risky | Hardcoded fallback — see H1 |
| Info Disclosure | 🟠 Medium | Private room details accessible to any auth user — see H3 |
| API Keys | 🟠 Medium | Real OpenRouter key in `.env` (gitignored) — rotate |
| Rate Limiting | ✅ Present | Login, register, search, upload |
| Security Headers | ✅ Configured | Helmet with CSP, referrer policy, frame guard |
| CORS | ✅ Configured | Strict in production (`ALLOWED_ORIGINS`) |
| HTTPS | ✅ Enforced | Via nginx in Docker config; secure cookies in production |

---

## 8. Performance Overview

| Area | Status | Notes |
|---|---|---|
| SQLite DB layer | ✅ Optimized | Pragmas + 9 indexes + 40+ prepared statements |
| AI HTTP connections | ✅ Optimized | HTTP keep-alive agent for all providers |
| Static file caching | ✅ Tuned | Immutable for hashed assets, sensible TTLs |
| WebSocket compression | ✅ Enabled | `perMessageDeflate` with 1KB threshold |
| Reaction fetching | 🟡 N+1 | One DB query per message — see M2 |
| Media file checks | 🟡 Sync I/O | `fs.existsSync()` per message — see M1 |
| AI response caching | ✅ Present | LRU cache (500 entries, 5-min TTL) for non-streaming |

---

## 9. Recommended Action Plan

### Immediate (security-critical)

1. **Fix C1**: Import `JWT_SECRET` from `middleware/auth.js` in `server/auth.js` — prevents admin token rejection
2. **Fix H1**: Guard hardcoded seed behind `!IS_PROD` 
3. **Rotate H2**: Generate a new OpenRouter API key; update `.env`
4. **Fix H3**: Add membership check to `GET /api/chats/:id` for private rooms

### Short-term (quality)

5. **Fix L4**: Update LAN IP to `192.168.1.141` in `capacitor.config.json` and `js/config.js`
6. **Fix M4**: Add `'openrouter'` and `'auto'` to agent provider whitelist
7. **Fix M5**: Replace hardcoded `HTTP-Referer` with `process.env.SITE_URL`
8. **Clean up**: Delete `Xxxxx.html`, `boot-test.log`, `PROMPT.md`, `*.mp4` from root
9. **Fix L5**: Update `tests/api.test.js` — change `/api/auth/chat-token` to `/api/users/register`

### Medium-term (performance/completeness)

10. **Fix M1+M3**: Extract `annotateMedia()` to shared util, replace `fs.existsSync()` with async or DB flag
11. **Fix M2**: Bulk-fetch reactions in a single query instead of N+1
12. **Add**: `/health` DB connectivity check — `SELECT 1` from SQLite
13. **Add**: Orphan upload cleanup job — delete files for soft-deleted messages
14. **Add**: User profile update endpoint (`PUT /api/users/me`)
