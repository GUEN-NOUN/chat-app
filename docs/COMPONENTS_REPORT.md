# Components Report — مدارك التعليمية (Madarik Educational)

## 1. Button / Interactive Element Map

| Element ID / Selector | Location | Handler File | Handler Function | Role | Server-Required |
|---|---|---|---|---|---|
| `#admin-login-btn` | navbar | `navbar.js` | `handleAdminBtn()` → `Auth.doLogin()` or `Auth.doLogout()` | Toggle admin login/logout modal | **Yes** (JWT auth) |
| `#btn-do-login` | m-login modal | `bootstrap.js` | `doLogin()` → `Auth.doLogin(email, pass)` | Submit login form | **Yes** (POST /api/auth/login) |
| `#hamburger` | navbar | `navbar.js` | toggles `.menu-open` on body | Toggle mobile menu | No |
| `.theme-toggle` | navbar | `theme.js` | `Theme.toggle()` | Switch dark/light theme | No |
| `#nl-home` | nav-links | `navbar.js` | `App.nav('home')` | Navigate to home section | No |
| `#nl-lessons` | nav-links | `navbar.js` | Opens dropdown | Parent for video/pdf | No |
| `#nl-video` | dropdown | `navbar.js` | `App.nav('video')` | Navigate to videos section | No |
| `#nl-pdf` | dropdown | `navbar.js` | `App.nav('pdf')` | Navigate to PDFs section | No |
| `#nl-levels` | nav-links | `navbar.js` | Opens levels dropdown | List all 16 educational levels | No |
| `#nl-ex` | nav-links | `navbar.js` | `App.nav('exercises')` | Navigate to exercises | No |
| `#nl-tests` | nav-links | `navbar.js` | `App.nav('tests')` | Navigate to tests | No |
| `#chat-fab` | chat widget | `chat.js` | `toggleChat()` | Open/close chat panel | No (WS optional) |
| `#csb-back` | chat sidebar | `chat.js` | Closes sidebar on mobile | Mobile sidebar close | No |
| `#csb-new-chat` | chat sidebar | `chat.js` | `openSearchPanel()` | Opens user search for new chat | No |
| `.csb-filter-pill` | chat sidebar | `chat.js` | Sets `activeFilter`, re-renders | Filter messages by type | No |
| `#chat-username-submit` | m-chat-username modal | `chat.js` | `submitUsername()` | Register chat nickname | No |
| `#btn-submit-video` | m-video modal | `bootstrap.js` | `Pages.submitVideo()` | Add new video (admin) | No (localStorage) |
| `#btn-submit-pdf` | m-pdf modal | `bootstrap.js` | `Pages.submitPDF()` | Upload PDF (admin) | No (IndexedDB) |
| `#btn-submit-ex` | m-ex modal | `bootstrap.js` | `Pages.submitExercise()` | Add exercise (admin) | No (localStorage) |
| `#btn-submit-test` | m-test modal | `bootstrap.js` | `Pages.submitTest()` | Add test (admin) | No (localStorage) |
| `[data-close]` | All modals | `bootstrap.js` | `Modals.close(id)` | Close parent modal | No |
| `.video-card .btn-primary` | video section | `pages.js` | Opens YouTube embed | Play video | No |
| `.video-card .btn-danger` | video section | `pages.js` | `deleteVideo(i)` | Delete video (admin) | No |
| `.doc-item .btn-download` | pdf section | `pages.js` | Triggers PDF download | Download PDF blob | No |
| `.doc-item .btn-danger` | pdf section | `pages.js` | `deletePDF(i)` | Delete PDF (admin) | No |
| `#mob-admin-btn` | mobile menu | `navbar.js` | Same as `#admin-login-btn` | Mobile admin toggle | **Yes** |

## 2. Modals

| Modal ID | Trigger | Purpose |
|---|---|---|
| `m-login` | `#admin-login-btn` (when logged out) | Admin email/password login |
| `m-video` | "Add Video" button in video section (admin) | YouTube URL + metadata form |
| `m-pdf` | "Upload PDF" button in PDF section (admin) | File upload + metadata form |
| `m-ex` | "Add Exercise" button in exercises section (admin) | Exercise upload form |
| `m-test` | "Add Test" button in tests section (admin) | Test upload form |
| `m-chat-username` | First chat use | Register chat nickname |

## 3. Theme System

| Property | Dark (default) | Light |
|---|---|---|
| `--navy` (body bg) | `#050d1f` | `#f0f2f5` |
| `--text` | `rgba(255,255,255,0.88)` | `rgba(0,0,0,0.87)` |
| `--card-bg` | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.03)` |
| `--border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)` |
| `--shadow` | `0 4px 30px rgba(0,0,0,0.5)` | `0 4px 20px rgba(0,0,0,0.1)` |
| Navbar bg | `rgba(5,13,31,.88)` | `rgba(255,255,255,0.92)` |
| Persistence | `localStorage('madarik_theme')` | Same |
| Toggle | `.theme-toggle` button in navbar | Same |

## 4. Authentication Flow

```
[Frontend]                          [Backend]
btn-do-login click
  → Auth.doLogin(email, pass)
    → POST /api/auth/login  ──────→ Rate limiter (10/15min)
                                     → bcrypt.compare(pass, hash)
                                     → JWT signed, set HTTP-only cookie
    ← { ok: true, admin }  ←──────
    → updateAdminUI()
    → scheduleRefresh()

Page load
  → Auth.init()
    → GET /api/auth/me  ──────────→ Verify JWT from cookie
    ← { ok, admin }  ←────────────
    → updateAdminUI()

Logout
  → Auth.doLogout()
    → POST /api/auth/logout  ─────→ Clear cookie
    ← { ok }  ←───────────────────
    → updateAdminUI()
```

## 5. Chat Architecture

```
[Frontend chat.js]                  [Backend server/chat.js]
toggleChat()                        WebSocket server on /ws
  → openChatPanel()
  → wsConnect() ─── WS ──────────→ onConnection
selectContact(id)
  → wsJoinRoom(room) ────────────→ { type:'join', room, username }
                                     → ensureRoom(room)
                                     → send history
sendMsg()
  → push(msg) locally
  → wsSend({type:'message'}) ────→ saveMessage() → broadcast to room
                    ←────────────── { type:'message', room, content, sender }
  → ws.onmessage
    → deduplicate by mid
    → push to convos + renderMessages()
```

## 6. Script Loading Order

```html
1.  js/version.js      — sets window.APP_VERSION
2.  js/config.js        — APP_CONFIG (API_URL, WS_URL, STORAGE_KEYS, LEVELS)
3.  js/utils.js         — sanitizeText(), isAllowedDataUrl(), esc()
4.  js/storage.js       — IndexedDB + localStorage wrappers
5.  js/theme.js         — dark/light toggle (NEW)
6.  js/auth.js          — JWT auth via /api/auth (REWRITTEN)
7.  js/modals.js        — open/close/toast system
8.  js/app.js           — SPA routing + state
9.  js/navbar.js        — Navigation + hamburger
10. js/user-registry.js — BroadcastChannel user directory
11. js/reports.js       — Content reporting
12. js/friends.js       — Friend request system
13. js/groups.js        — Group chat management
14. js/chat.js          — Chat UI + WebSocket (UPDATED)
15. js/pages.js         — Section rendering + admin CRUD
16. js/bootstrap.js     — Event binding + init (UPDATED)
17. js/ai-chat.js       — AI agent personas
```

## 7. Security Improvements Summary

| Issue | Before | After |
|---|---|---|
| Hardcoded credentials | `APP_CONFIG.CREDS` in config.js | Removed; auth via server-side bcrypt + JWT |
| Client-side auth | localStorage comparison | HTTP-only cookie, server verification |
| Rate limiting | None | 10 attempts per 15 minutes (server) |
| XSS | Most safe via `textContent` | Unchanged (already good) + CSP via Helmet |
| CORS | N/A | Restricted to same-origin + localhost |
| WebSocket | None | Server-validated, sanitized messages |
| Service Worker | Cached everything | Excludes `/api/` and `/ws` routes |

## 8. File Structure

```
chat-app/
├── server/                    ← NEW: Backend
│   ├── package.json
│   ├── index.js              (Express + WS entry)
│   ├── auth.js               (JWT routes)
│   ├── chat.js               (WebSocket handlers)
│   └── db.js                 (SQLite schema + queries)
├── js/
│   ├── theme.js              ← NEW: Dark/light toggle
│   ├── auth.js               ← REWRITTEN: Server-side JWT
│   ├── chat.js               ← UPDATED: WebSocket layer
│   ├── config.js             ← UPDATED: CREDS removed, API_URL/WS_URL added
│   └── bootstrap.js          ← UPDATED: Async login handler
├── css/
│   └── main.css              ← UPDATED: Light theme variables
├── sw.js                     ← UPDATED: Excludes /api/ from cache
├── .eslintrc.json            ← NEW
├── .prettierrc               ← NEW
├── package.json              ← UPDATED: lint/format/server scripts
└── *.html                    ← UPDATED: Theme toggle + theme.js script tag
```
