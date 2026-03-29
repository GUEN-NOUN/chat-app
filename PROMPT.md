# Madarik Educational Platform — مدارك التعليمية · Full Project Prompt

> Developer/AI instructions in English. All UI strings must be in Arabic (RTL, Cairo font).

## 1. Identity
**Name:** مدارك التعليمية | **App ID:** `com.match.chat` | **Version:** `3` (bumped via `bump-version.py`)
**Target:** Arabic-speaking Moroccan students, all grades | **Platforms:** Browser PWA + Android/iOS (Capacitor v8)

## 2. What This Project Is
A full educational content platform — NOT just chat:
| Pillar | Description |
|---|---|
| Content Library | YouTube videos, PDFs, exercises, practice exams by grade + subject |
| Real-Time Chat | WS rooms + lesson threads, typing, ACK/delivered/seen, emoji |
| Admin Dashboard | CMS, user moderation, RBAC roles, audit logs, content reports (7-tab) |
| AI Assistant | GPT-4o-mini + Gemini 1.5 Flash, fallback chain, in-memory cache |
| User Registry | Device-ID directory, fuzzy search, online presence, optional avatars |
| RBAC | user → moderator → admin → superadmin permission matrix |
| PWA / Native | SW (network-first), Capacitor v8 bridge (Android/iOS) |

## 3. Stack
**Frontend:** Vanilla HTML/CSS/JS, IIFE pattern, CSS Custom Properties, IndexedDB (PDF blobs), localStorage, Service Worker, Capacitor v8
**Backend:** Node.js + Express (port 3000), `ws` on `/ws`, `better-sqlite3` WAL (`server/madarik.db`), `jsonwebtoken`, helmet, cors, express-rate-limit, morgan


## 4. File Structure
```
/ (Express static root)
├── index.html           ← first-middle level
├── admin.html, chat.html
├── first-primary.html … sixth-primary.html
├── second-middle.html, third-middle.html
├── first-bac-economic/islamic/math.html
├── second-bac-life-earth/physical/math.html
├── shared-curricula.html, sciences-literature.html, Xxxxx.html
├── version.json         ← {"version":"3"}
├── sw.js, capacitor.config.json, package.json
├── js/
│   ├── version.js       ← window.APP_VERSION
│   ├── config.js        ← window.APP_CONFIG
│   ├── bootstrap.js     ← DOMContentLoaded entry point
│   ├── app.js           ← SPA state & navigation
│   ├── storage.js       ← IDB + localStorage
│   ├── auth.js          ← /api/auth/* calls
│   ├── rbac.js          ← client-side RBAC
│   ├── audit-log.js, reports.js, user-registry.js
│   ├── admin-panel.js   ← 7-tab dashboard
│   ├── pages.js         ← section renderers
│   ├── navbar.js, modals.js, utils.js
│   ├── friends.js, groups.js
│   ├── chat.js          ← embedded chat widget
│   ├── ai-chat.js       ← floating AI widget
│   └── chat-app.js      ← standalone chat page
├── css/main.css (~800L), css/admin.css, css/chat.css (~650L)
├── assets/ (legacy copies)
├── server/index.js, auth.js, chat.js, db.js, ai.js, tests/api.test.js
├── www/   ← built mirror of root (for Capacitor)
└── android/
```


## 5. Curriculum Levels (18 pages — each page has `<body data-level="...">`, identical structure)

| data-level | file | label |
|---|---|---|
| first-primary … sixth-primary | first-primary.html … | السنة الأولى–السادسة ابتدائي |
| first-middle | index.html | الأولى إعدادي |
| second-middle, third-middle | second-middle.html, third-middle.html | الثانية/الثالثة إعدادي |
| first-bac-economic | first-bac-economic.html | الأولى باك اقتصاد |
| first-bac-islamic | first-bac-islamic.html | الأولى باك علوم إسلامية |
| first-bac-math | first-bac-math.html | الأولى باك رياضيات |
| second-bac-physical | second-bac-physical.html | الثانية باك فيزياء كيمياء |
| second-bac-life-earth | second-bac-life-earth.html | الثانية باك علوم الحياة والأرض |
| second-bac-math | second-bac-math.html | الثانية باك علوم رياضية |
| sciences-literature | sciences-literature.html | علوم وآداب |
| shared-curricula | shared-curricula.html | المشترك الأدبي والعلمي |


## 6. window.APP_CONFIG (js/config.js)
```js
window.APP_CONFIG = {
  APP_VERSION: window.APP_VERSION || '3',
  API_URL: location.hostname==='localhost' ? 'http://localhost:3000' : '',
  WS_URL:  location.hostname==='localhost' ? 'ws://localhost:3000/ws' : 'wss://'+location.host+'/ws',
  MAX_PDF_MB:20, MAX_IMG_MB:5, MAX_AUDIO_MB:10, MAX_UPLOAD_MB:50,
  ALLOWED_IMAGE_TYPES: ['image/png','image/jpeg','image/webp','image/gif'],
  ALLOWED_AUDIO_TYPES: ['audio/webm','audio/ogg','audio/mp4','audio/mpeg'],
  ALLOWED_VIDEO_TYPES: ['video/mp4','video/webm'],
  SESSION_TIMEOUT: 30*60*1000,
  STORAGE_KEYS: {
    ADMIN:'madarik_admin_session', CHAT_USER:'madarik_chat_user',
    CHAT_CONVOS:'madarik_chat_convos', CHAT_PROFILE:'madarik_chat_profile',
    CHAT_USERS_REGISTRY:'madarik_users_registry', CHAT_GROUPS:'madarik_chat_groups',
    MIC_PERMISSION_DENIED:'madarik_mic_denied', CAMERA_PERMISSION_DENIED:'madarik_camera_denied',
    VIDEOS:'madarik_videos', PDF_LIST:'madarik_pdf_list',
    EXERCISES_LIST:'madarik_exercises_list', TESTS_LIST:'madarik_tests_list',
    ADMIN_ROLES:'madarik_admin_roles', ADMIN_CREDENTIALS:'madarik_admin_credentials',
    AUDIT_LOGS:'madarik_audit_logs', REPORTS:'madarik_reports',
    USER_SUSPENSIONS:'madarik_suspensions', FRIENDS:'madarik_friends',
  },
  LEVELS: [{ id:'first-primary', file:'first-primary.html', label:'السنة الأولى ابتدائي' }, /* …18 total */],
  SUBJECTS: { primary:[/*{id,icon,label}*/], middle:[/*…*/], bac:[/*…*/] },
  SCHEDULE_TEMPLATE: { days:[], timeSlots:[] },
  getCurrentLevel: function(){ return document.body.getAttribute('data-level')||''; },
};
```


## 7. Script Load Order
**Curriculum pages:** `version.js` → `config.js` → `utils.js` → `storage.js` → `rbac.js` → `audit-log.js` → `reports.js` → `user-registry.js` → `admin-panel.js` → (`chat.js`, `ai-chat.js`, `navbar.js`, `bootstrap.js` at bottom)
**chat.html:** `version.js` → `config.js` → `utils.js` → `storage.js` → `chat-app.js`
**admin.html:** `version.js` → `config.js` → `utils.js` → `storage.js` → `rbac.js` → `audit-log.js` → `reports.js` → `user-registry.js` → `admin-panel.js`


## 8. REST API
`server/index.js`: port `process.env.PORT||3000`, static root `path.join(__dirname,'...')`, WebSocket on `/ws`

| Method | Path | Rate Limit | Input | Output |
|---|---|---|---|---|
| POST | `/api/auth/login` | 10/15min | `{email,password}` | `{ok,admin}` + HTTP-only cookie |
| POST | `/api/auth/logout` | — | — | `{ok}` + clear cookie |
| GET | `/api/auth/me` | — | cookie | `{ok,admin}` |
| POST | `/api/auth/chat-token` | 5/min | `{deviceId,username}` | `{ok,token}` JWT 2h |
| POST | `/api/ai/chat` | 30/min/IP | `{message,agentId?,history?}` | `{ok,reply,agent,cached?}` or `{ok:false,useLocal:true}` |
| GET | `/health` | — | — | `{ok,uptime,ts}` |
| GET | `/metrics` | — | — | `{ok,activeWs,rooms,ts}` |

JWT chat-token payload: `{sub:deviceId, username, type:'chat', iat, exp}` · Admin cookie name: `madarik_token` (HTTP-only, Secure in prod)
Agents: `chatgpt`=GPT-4o-mini (default), `gemini`=Gemini 1.5 Flash, `cloud`=GPT friendly
AI cache: Map TTL 5min max 500, key=`agent+message.toLowerCase()` · Fallback chain: primary → alternate → `{useLocal:true}`
History: last 20 entries, roles∈[user,assistant], message max 2000 chars · Env: `OPENAI_API_KEY`, `GEMINI_API_KEY`


## 9. WebSocket Protocol (server/chat.js)
Auth flow: connect → `{type:'auth',token}` → server validates JWT (type==='chat'), sets `ws.wsUserId`/`ws.wsNickname` → `{type:'auth',ok:true}` → client sends `join`

**Client → Server:**
```jsonc
{type:'auth', token:'<JWT>'}
{type:'join', room:'public', userId:'dev-abc', nickname:'أحمد', after:456}
{type:'message', room:'public', id:'cli-xyz', userId:'dev-abc', nickname:'أحمد', body:'مرحبا', msgType:'text'}
// msgType: 'text'|'image'|'audio'
{type:'ack', id:789, room:'public'}
{type:'typing', room:'public', userId:'dev-abc', nickname:'أحمد'}
{type:'rooms'}
{type:'history', room:'public', before:300}
```
**Server → Client:**
```jsonc
{type:'auth', ok:true}
{type:'rooms', rooms:[{id:'public',name:'الدردشة العامة',online:4}]}
{type:'history', room:'public', messages:[{id,sender_id,sender,body,ts,type,delivery_state}]}
{type:'message', room:'public', id:789, clientId:'cli-xyz', senderId:'dev-abc', sender:'أحمد', body:'مرحبا', ts:'…'}
{type:'ack', clientId:'cli-xyz', serverId:789, ts:'…'}
{type:'delivered', serverId:789, ts:'…'}
{type:'typing', room:'public', userId:'dev-x', nickname:'ليلى'}
{type:'joined'|'left', room:'public', userId, nickname, onlineCount}
{type:'error', error:'الملفات الثنائية تُرفع عبر /api/upload وليس عبر WebSocket'}
```
Server rules: block data-URIs (`isDataUri(body)`), typing ≤1/1.5s, ping/pong 30s, strip `<>"'` from body, max 4000 chars
Room state: `Map<roomId, Set<{ws,userId,nickname}>>`


## 10. Database (server/db.js — server/madarik.db, SQLite WAL)
```sql
CREATE TABLE admins (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT, -- bcrypt
  role TEXT DEFAULT 'superadmin', created TEXT);
-- Seed: achraf1258@gmail.com, anynhfm75@gmail.com (superadmin)

CREATE TABLE chat_rooms (
  id TEXT PRIMARY KEY, -- 'public'|'grp:<id>'|'lesson:<lvl>_<doc>'|'dm:<u1>_<u2>'
  name TEXT, type TEXT, -- 'public'|'group'|'lesson'|'dm'
  created TEXT);
-- Seed: {id:'public', name:'الدردشة العامة', type:'public'}

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY, room_id TEXT REFERENCES chat_rooms(id),
  sender_id TEXT, sender TEXT, type TEX هT DEFAULT 'text', -- 'text'|'image'|'audio'
  body TEXT, ts TEXT,
  delivery_state TEXT DEFAULT 'sent'); -- 'pending'|'sent'|'delivered'|'read'
-- delivery_state added via migration (try-catch ALTER TABLE)
CREATE INDEX idx_msg_room ON chat_messages(room_id, ts);
```
```js
findAdmin(email) → admin|null
verifyPassword(plain, hash) → bool          // bcrypt
saveMessage(roomId, senderId, name, type, body) → rowid
getMessages(roomId, limit, before) → arr    // newest first
getMessagesSince(roomId, afterId) → arr     // delta-sync
updateMessageState(id, state)
ensureRoom(roomId, name, type)              // INSERT OR IGNORE
```


## 11. Frontend JS Modules

**js/bootstrap.js** — `DOMContentLoaded`: `Modals.init` → login listeners → modal form bindings → populate subjects → `Navbar.init` → `Chat.init` → `App.init` → register SW

**js/app.js** (`window.App`) — SPA, sections: `home|video|pdf|exercises|tests`; storage key = `STORAGE_KEYS.VIDEOS+'_'+level`
```js
App.nav(section), App.render(), App.getCurrentLevel(), App.getLevelTitle()
App.getVideos/setVideos, App.getPdfList/setPdfList, App.getExercisesList/setExercisesList, App.getTestsList/setTestsList
```

**js/storage.js** (`window.Storage`) — IDB db=`MadarikPDFs` store=`blobs`
```js
Storage.putBlob/getBlob/deleteBlob(id) → Promise
Storage.getItem(key, fallback), Storage.setItem(key, val)
```

**js/rbac.js** (`window.RBAC`) — Roles: `user(0)<moderator(1)<admin(2)<superadmin(3)`. Session in `sessionStorage` only.
```
view:user_list/profile/reported_content · manage:reports · warn:user → moderator
suspend:user · ban:user · view:audit_logs → admin
manage:roles · manage:admin_accounts · purge:audit_logs → superadmin
```
```js
RBAC.createSession(id,role), RBAC.getSession(), RBAC.hasPermission(action), RBAC.requirePermission(action)
RBAC.verifyCredential(email,pass)→Promise, RBAC.bootstrapSuperadmin()
RBAC.assignRole/suspendUser/banUser/liftRestriction/warnUser(userId,…)
```

**js/audit-log.js** (`window.AuditLog`) — append-only, `localStorage.madarik_audit_logs` max 5000; entry: `{id,ts,adminId,adminRole,action,targetId,details}`
```js
AuditLog.append(adminId,role,action,targetId,details)
AuditLog.getAll(filters?)   // needs view:audit_logs
AuditLog.purge(adminId)     // superadmin only, logs itself
AuditLog.count(), AuditLog.labelFor(action) → Arabic string
```

**js/reports.js** (`window.Reports`) — privacy-first; content only revealed for reported messages
Report: `{id,ts,status,reporterId,reporterName,targetUserId,targetName,messageId,reason,contentType,_snapshot,resolution,resolvedBy,resolvedAt}`
`reason`: `'spam'|'harassment'|'inappropriate'|'violence'|'other'` · `status`: `'pending'|'reviewing'|'resolved'|'dismissed'`
```js
Reports.submit(opts), Reports.getReports(status?), Reports.revealContent(id) // audit-logged
Reports.updateStatus(id,status,resolution), Reports.getCount(status?), Reports.openReportModal(ctx)
```

**js/user-registry.js** (`window.UserRegistry`) — BroadcastChannel cross-tab sync; stale=5min
User: `{id,nickname,online,lastSeen,registeredAt,is_public,avatar,uid}` (uid=`MDK-XXXXXX`)
Fuzzy search: exact(100) > prefix(80) > substring(60) > char-seq(30)
```js
UserRegistry.registerUser/heartbeat/setOffline(id)
UserRegistry.search(query,selfId), UserRegistry.getAll(selfId), UserRegistry.isNicknameTaken(nick,selfId)
UserRegistry.setPublic/setAvatar(id,…), UserRegistry.getPublicUsers(), UserRegistry.onChange(cb)
```

**js/pages.js** (`window.Pages`) — renders `home|video|pdf|exercises|tests` into `#content-area`; subject filter; admin bar (auth-gated); view/download/delete per item
```js
Pages.openLessonChat(threadId, displayName)
// threadId: 'lesson:{level}_{docId}' or 'subj:{level}_{subjectId}'
```

**js/navbar.js** (`window.Navbar`) — brand→home, SPA nav, Lessons/Levels dropdowns (JS transitions), theme toggle (`data-theme` attr), hamburger (animated, body scroll lock, mobile fullscreen)

**js/chat.js** — embedded chat widget (FAB) on all curriculum pages; connects to same WS backend; lesson thread per content card

**js/chat-app.js** — standalone chat (`chat.html`), IIFE
State: `me{deviceId,username}`, `activeRoom`, `rooms{}`, `onlineUsers{}`, `wsChatToken`, `ws`, `lastKnownMsgId`
Flow: `fetchToken()→POST /api/auth/chat-token→sessionStorage.madarik_wt` → `wsConnect()→auth→rooms→join{after:lastKnownMsgId}`
Optimistic send: `status:'sending'` → on ack: clientId→serverId, `status:'sent'` → on delivered: `status:'delivered'`
Reconnect: backoff 1s→×2→30s cap · Typing: 1/1.5s · Render: `textContent` only, img src: `data:image/(png|jpeg|webp|gif);base64,…` or `https://` only

**js/ai-chat.js** — floating AI panel, agent selector (ChatGPT/Gemini), calls `POST /api/ai/chat`, graceful fallback

**js/utils.js** — `Utils.now()`, `Utils.esc(s)`, `Utils.sanitizeText(s,maxLen)`, `Utils.isAllowedDataUrl(url,kind)`

**js/modals.js** — `Modals.openM/closeM(id)`, `Modals.toast(msg,type)` (ok/err/inf, 3.4s), `Modals.init()` (overlay+Escape)


## 12. CSS
**css/main.css (~800L)** — navy dark, `[data-theme="light"]` override
```css
--color-bg:#050d1f; --color-bg2:#0b1629; --color-card:#0f2147;
--color-accent:#2563eb; --color-gold:#f59e0b; --color-teal:#0d9488;
--color-border:#1e3a5f; --color-text:#e2e8f0; --color-muted:#64748b;
```
Animations: `orbFloat`, `pageIn`, `cardIn`, `modalIn`, `backdropIn`

**css/chat.css (~650L)** — GitHub-style dark, `[data-theme="light"]` override
```css
--bg-app:#0d1117; --bg-sidebar:#161b22; --accent:#388bfd; --border:#30363d;
--bg-bubble-me:linear-gradient(135deg,#1f6feb,#388bfd); --bg-bubble-other:#21262d;
--text-primary:#e6edf3; --sidebar-w:300px;
```
Key selectors: `.msg-row.me` (flex-start RTL), `.msg-row.other` (flex-end), `.msg-status.sending/sent/delivered/seen` (color coded), `.emoji-panel` (abs grid above input), `.typing-dots span` (bounce 1.2s), `.scroll-btn.visible` (opacity:1)
Responsive: `<640px` sidebar=abs overlay+back btn; `641–900px` sidebar=240px · Animations: `fadeIn`, `slideUp`, `msgIn`, `bounce`

**css/admin.css** — flexbox sidebar(220px)+main; badge/chip colors per role/status; mobile→horizontal tab bar


## 13. Service Worker (sw.js)
Cache: `madarik-v3` (bumped by `bump-version.py`) · Strategy: network-first, fallback to cache
Bypass: `/api/*`, `/ws`, googleapis.com, youtube.com, ytimg.com, fonts.gstatic.com, openai.com, generativelanguage.googleapis.com

## 14. Capacitor
```json
{"appId":"com.match.chat","appName":"مدارك التعليمية","webDir":"www",
 "android":{"allowMixedContent":false,"webContentsDebuggingEnabled":false,"backgroundColor":"#0b1629"},
 "plugins":{"SplashScreen":{"launchDelay":2500},"StatusBar":{"style":"DARK","overlaysWebView":true},"Filesystem":{}}}
```
Build: `npm run build` → `npx cap sync android` → `npm run cap:open:android`

## 15. Security (Non-Negotiable)
- No `innerHTML` for user content (all frontend JS)
- Block data-URI in WS body: `isDataUri(body)` in `server/chat.js`
- Prepared statements for all SQL (`server/db.js`)
- HTTP-only cookie for admin JWT · Rate-limit: login, chat-token, AI, upload
- Helmet CSP (`server/index.js`) · Validate MIME+size on upload (`server/upload.js`)
- `isSafeImgSrc()` before any `img.src` assignment
- RBAC check + audit log before every admin action
- Reports content access gated + audit-logged
- No API keys in frontend · Reject `javascript:`, `file:`, untrusted URL schemes

## 16. Upload Endpoint (server/upload.js — TO IMPLEMENT)
```
POST /api/upload  multipart/form-data  field:file  optional:typeHint
Rate limit: 10/min/IP
MIME allowlist: image/png,jpeg,webp,gif | application/pdf | video/mp4,webm | audio/webm,ogg,mpeg
Size: image→5MB, audio→10MB, PDF→20MB, video→50MB
Process: uuid+ext → uploads/ · image: optional thumbnail (sharp) · video: optional poster (fluent-ffmpeg)
Returns: {ok,url:'/uploads/<file>',mime,size,poster_url?,id}
WS body after upload:
  image → '[img]https://…/uploads/<file>'
  pdf   → '[file]https://…/uploads/<file>;type=pdf;name=<orig>'
  video → '[file]https://…/uploads/<file>;type=video;name=<orig>;poster=<url>'
```


## 17. Storage Keys
| Key | Value | Module |
|---|---|---|
| `madarik_chat_user` | `{deviceId,username}` | chat-app.js, chat.js |
| `madarik_chat_convos` | messages by convo | chat.js |
| `madarik_chat_profile` | profile info | chat.js |
| `madarik_users_registry` | user dir array | user-registry.js |
| `madarik_chat_groups` | group objects | groups.js |
| `madarik_videos_{level}` | video metadata | app.js, pages.js |
| `madarik_pdf_list_{level}` | PDF metadata | app.js, pages.js |
| `madarik_exercises_list_{level}` | exercise metadata | app.js, pages.js |
| `madarik_tests_list_{level}` | test metadata | app.js, pages.js |
| `madarik_admin_roles` | `{userId→{role,assignedBy}}` | rbac.js |
| `madarik_admin_credentials` | `[{id,email,credHash,role}]` | rbac.js |
| `madarik_audit_logs` | log entries (max 5000) | audit-log.js |
| `madarik_reports` | content reports | reports.js |
| `madarik_suspensions` | `{userId→{status,reason}}` | rbac.js |
| `madarik_friends` | `{sent,received,accepted,rejected}` | friends.js |
| `madarik_theme` | `'dark'`\|`'light'` | navbar.js, chat-app.js |
| `madarik_my_uid` | `MDK-XXXXXX` | user-registry.js |
| `madarik_chat_rooms_local` | rooms cache | chat-app.js |
| **sessionStorage** `madarik_wt` | `{token,exp}` | chat-app.js |
| **sessionStorage** RBAC | `{adminId,role,sessionId,exp}` | rbac.js |
| **IDB** `MadarikPDFs.blobs` | `{id,blob}` | storage.js |


## 18. npm Packages
**Root:** `@capacitor/android|core|cli@^8`, `eslint@^8`, `prettier@^3`, `gh-pages@^6`
**Server (required):** `express`, `ws`, `better-sqlite3`, `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, `helmet`, `morgan`, `dotenv`, `cors`
**Server (recommended):** `multer`, `sharp`, `fluent-ffmpeg`, `prom-client`, `winston`/`pino`, `express-validator`, `multer-s3`/`@aws-sdk`

## 19. Environment Variables (server/.env)
```env
PORT=3000
JWT_SECRET=<256-bit-secret>
NODE_ENV=development
OPENAI_API_KEY=sk-…
GEMINI_API_KEY=AIza…
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=50
ALLOWED_ORIGINS=http://localhost:3000
```

## 20. Run Commands
```powershell
npm install ; cd server ; npm install ; cd ..
node server/index.js          # start server (npx nodemon for auto-restart)
cd server ; npm test          # integration tests
npm run build                 # copy to www/
npx cap sync android ; npm run cap:open:android
```
URLs: `localhost:3000` · `localhost:3000/chat.html` · `localhost:3000/admin.html`


## 21. Integration Tests (server/tests/api.test.js — 10 required)
1. `GET /health` → `{ok:true}`
2. `GET /metrics` → `{ok,activeWs,rooms}`
3. `POST /api/auth/chat-token` → valid JWT
4. Decoded JWT has `sub`, `username`, `type:'chat'`
5. WS auth with token → `{type:'auth',ok:true}`
6. WS join → `{type:'history',room,messages}`
7. WS send message → `{type:'ack',clientId,serverId}`
8. Second WS client receives `{type:'delivered',serverId}` after first client acks
9. `getMessagesSince(room,afterId)` returns only id>afterId
10. Rate limiter blocks >5 req/min to `/api/auth/chat-token`

## 22. Deliverables Checklist
- [ ] 18 HTML curriculum pages (identical structure, different `data-level`)
- [ ] `admin.html` (7-tab dashboard), `chat.html` (standalone chat)
- [ ] All 21 `js/` modules, `css/main.css`, `css/admin.css`, `css/chat.css`
- [ ] `server/index.js`, `auth.js`, `chat.js`, `db.js`, `ai.js`
- [ ] `server/upload.js` (missing — implement per §16)
- [ ] `server/tests/api.test.js` (10+ tests), `sw.js`, `capacitor.config.json`
- [ ] `server/.env` template, `www/` mirror of all static files
- [ ] OpenAPI spec for `/api/auth/chat-token`, `/api/upload`, `/api/ai/chat`
- [ ] i18n JSON file for all Arabic UI strings

*— مدارك التعليمية full specification*
