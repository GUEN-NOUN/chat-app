# مدارك التعليمية — Full Project Audit Report (v2)

**Date:** 2025  
**Scope:** Complete file-by-file, folder-by-folder analysis  
**Project:** Arabic educational platform with real-time chat, AI agents, admin dashboard  
**Stack:** Node.js/Express + Socket.io + SQLite + React/Vite SPA + Capacitor + Static HTML pages

---

## Table of Contents

1. [Root Configuration Files](#1-root-configuration-files)
2. [Build & Utility Scripts](#2-build--utility-scripts)
3. [Service Worker](#3-service-worker)
4. [Static HTML Pages (16 files)](#4-static-html-pages)
5. [Frontend JS Modules (js/)](#5-frontend-js-modules-js)
6. [CSS Stylesheets (css/)](#6-css-stylesheets-css)
7. [Assets (assets/)](#7-assets-assets)
8. [Client React SPA (client/)](#8-client-react-spa-client)
9. [Server — Core (server/)](#9-server--core)
10. [Server — Routes (server/routes/)](#10-server--routes)
11. [Server — Middleware (server/middleware/)](#11-server--middleware)
12. [Server — Services (server/services/)](#12-server--services)
13. [Server — Socket (server/socket/)](#13-server--socket)
14. [Server — Tests (server/tests/)](#14-server--tests)
15. [Deployment Configs](#15-deployment-configs)
16. [Android (Capacitor)](#16-android-capacitor)
17. [Critical Findings Summary](#17-critical-findings-summary)
18. [Recommendations](#18-recommendations)

---

## 1. Root Configuration Files

### package.json
**Purpose:** Root project manifest — scripts, Capacitor dependencies, dev tooling.  
**Issues:**
- No lock file consistency enforcement (`.npmrc` missing)
- `eslint` and `prettier` in devDeps but no `.eslintrc` at root level
- `gh-pages` deploy targets `www/` only (no server deploy script)

**Suggestions:** Add `engines` field to pin Node.js version. Add `.npmrc` with `save-exact=true`.

---

### version.json
**Purpose:** Single source version number (`{"version": "3"}`).  
**Issues:** None — clean single-field JSON.  
**Suggestions:** Consider semver format (`"3.0.0"`) for better tooling integration.

---

### capacitor.config.json
**Purpose:** Capacitor v8 config — Android/iOS builds, LAN server URL.  
**Issues:**
- 🔴 **WRONG IP:** `server.url` set to `192.168.5.1:3000` but actual dev machine is `192.168.1.141` — **Android app cannot connect to dev server**
- `server.cleartext: true` allows HTTP — acceptable for dev but must be removed for production builds
- Splash screen `launchShowDuration: 2000` (2s) may feel slow on fast devices

**Suggestions:** Use environment-based config or Capacitor CLI flags to switch URLs between dev/prod.

---

### .gitignore
**Purpose:** Version control exclusions.  
**Issues:**
- `node_modules/` listed twice (redundant)
- Missing `.DS_Store` (macOS artifacts)
- Missing `dist/` and `build/` directories

**Suggestions:** Deduplicate entries. Add platform-specific ignores.

---

## 2. Build & Utility Scripts

### build-www.ps1 (170 lines)
**Purpose:** 10-step PowerShell build pipeline — clean www/, build React SPA, copy static files, strip BOM, Capacitor sync, verify encoding.  
**Issues:**
- Hardcoded paths (`www/`, `client/dist/`) — no configurable variables
- Step 9 (Capacitor sync) runs even if no Android project exists — may error
- No error handling on `Copy-Item` operations (silent failures possible)

**Suggestions:** Add `$ErrorActionPreference = 'Stop'` at top. Parameterize paths.

---

### bump-version.py
**Purpose:** Atomically updates version across `js/version.js`, `sw.js`, `version.json`, and all HTML `?v=` cache-bust strings.  
**Issues:** None — well-structured with dry-run support.  
**Suggestions:** Add `--check` mode to verify all files are in sync without modifying.

---

### strip-bom.ps1
**Purpose:** Removes UTF-8 BOM markers from source files to prevent Android WebView Arabic encoding issues.  
**Issues:** None — includes `-Strict` CI mode.

---

### verify-encoding.ps1
**Purpose:** Byte-level comparison of www/ vs android assets, Arabic UTF-8 validation, BOM detection.  
**Issues:** None — thorough with `-Strict` CI mode.

---

## 3. Service Worker

### sw.js
**Purpose:** Network-first caching strategy for offline support.  
**Issues:**
- Manual cache version (`CACHE_VERSION = 'madarik-v4'`) — if not bumped, stale caches persist
- Third-party origins hardcoded (googleapis.com, gstatic.com, youtube.com)
- No cache size limit — could grow unbounded on devices with limited storage

**Security Concerns:** None — correctly skips `/api/`, `/chat/`, `/socket.io/`.  
**Suggestions:** Add cache eviction policy (max entries). Auto-bump via `bump-version.py` already handles version.

---

## 4. Static HTML Pages

### Structure: 16 identical HTML files
Files: `index.html`, `first-primary.html`, `second-primary.html`, `third-primary.html`, `fourth-primary.html`, `fifth-primary.html`, `sixth-primary.html`, `second-middle.html`, `third-middle.html`, `shared-curricula.html`, `first-bac-islamic.html`, `first-bac-math.html`, `first-bac-economic.html`, `second-bac-physical.html`, `second-bac-life-earth.html`, `second-bac-math.html`

**Purpose:** Each file is a curriculum landing page for a specific educational level.

**Issues:**
- 🔴 **MASSIVE CODE DUPLICATION:** All 16 files share identical boilerplate (navbar, modals, script imports, CSS links). Only `data-level` attribute differs. **~95% duplicated code across 16 files.**
- 🔴 **NO BACKEND INTEGRATION:** Static pages store data in `localStorage` only — no server persistence. Data lost on browser clear.
- Multiple DOM-heavy modals (login, video upload, PDF upload, exercises, tests) loaded in initial HTML — slow initial parse
- No form validation in HTML (relies entirely on JS)

**Security Concerns:**
- Admin login modal visible in source — can be inspected
- No CSP meta tags in HTML

**Suggestions:**
- Use a template engine or build step to generate all 16 pages from a single template
- Move admin modals to server-rendered partials or lazy-load them

---

### admin.html
**Purpose:** Admin dashboard — user management, content moderation, analytics.  
**Issues:**
- 🟡 **CLIENT-SIDE RBAC ONLY:** Role checks happen in browser JS. A user can bypass by editing localStorage.
- Duplicate stylesheet loading (both `main.css` and `admin.css` import similar base styles)
- Server-side admin routes exist (`/api/admin/*`) but this HTML page doesn't use them consistently

**Suggestions:** Ensure all admin actions go through `/api/admin/*` endpoints which enforce `requireAdmin` middleware.

---

### Xxxxx.html
**Purpose:** Standalone educational page — appears to be an older/experimental version.  
**Issues:**
- 🔴 **CRITICAL — 3000+ LINES OF DUPLICATED CSS:** Entire `main.css` content is copy-pasted inline
- 🔴 **HARDCODED CREDENTIALS:** Admin email/password visible in source code
- 🔴 **XSS:** Chat messages rendered with unescaped `innerHTML`
- No backend integration — all data client-side only
- No persistence — data lost on page refresh

**Suggestions:** Delete this file or refactor to use shared CSS/JS imports.

---

## 5. Frontend JS Modules (js/)

### js/version.js
**Purpose:** Single source of truth for `APP_VERSION = '3'`.  
**Issues:** None.

---

### js/config.js
**Purpose:** Global `APP_CONFIG` — API URLs, storage keys, educational levels, subjects.  
**Issues:**
- Dead storage keys from old localStorage auth system (e.g., `ADMIN_CREDENTIALS`, `CHAT_USER`)
- API_URL detection uses hardcoded IP `192.168.5.1` for Capacitor — **wrong IP**
- No environment-based overrides

**Suggestions:** Remove dead storage keys. Use `.env` or build-time injection for URLs.

---

### js/app.js
**Purpose:** SPA routing, level-aware content storage, state management.  
**Issues:**
- Complex state machine for content rendering — could benefit from simplification
- No error boundaries — unhandled promise rejections crash silently

**Suggestions:** Add global error handler (`window.onerror`).

---

### js/auth.js
**Purpose:** Server-side JWT auth via `/api/auth/*`, session management.  
**Issues:**
- Session refresh timer (15min) runs even when user is idle — unnecessary network traffic
- Token stored in both `sessionStorage` and `localStorage` (redundant)

**Suggestions:** Use `document.visibilitychange` to pause refresh when tab is hidden.

---

### js/admin-panel.js
**Purpose:** Admin dashboard with stats, user management, AI usage metrics.  
**Issues:**
- Dead `renderMedia()` function (defined but never called)
- Inconsistent naming conventions (`renderUsers` vs `showUserList`)
- No pagination for user list (loads all users at once)

**Suggestions:** Remove dead code. Add pagination.

---

### js/audit-log.js
**Purpose:** Append-only audit trail for admin actions.  
**Issues:** None — well-architected.

---

### js/bootstrap.js
**Purpose:** Entry point — modal binds, form handlers, SW registration.  
**Issues:**
- 🟡 **UTF-8 encoding probe runs on EVERY page load** — unnecessary performance hit after first successful check
- SW registration happens synchronously before DOMContentLoaded handler returns

**Suggestions:** Cache the encoding probe result in `sessionStorage` and skip if already verified.

---

### js/friends.js
**Purpose:** Friend request system via localStorage + BroadcastChannel.  
**Issues:** None — clean implementation.

---

### js/groups.js
**Purpose:** Group chat management via localStorage + BroadcastChannel.  
**Issues:** None — clean implementation.

---

### js/modals.js
**Purpose:** Lightweight overlay modal + toast notification system.  
**Issues:** None — simple and effective.

---

### js/navbar.js
**Purpose:** SPA navbar — responsive, animated hamburger menu.  
**Issues:**
- Complex animation logic with potential state desynchronization
- No debounce on resize handlers

**Suggestions:** Add resize debounce. Simplify animation state machine.

---

### js/pages.js
**Purpose:** Educational content rendering — videos, PDFs, exercises, tests.  
**Issues:**
- Incomplete functions (some render methods stubbed but not implemented)
- No file validation beyond MIME type (no size check on client side)
- YouTube embed URLs not sanitized

**Suggestions:** Complete stub functions. Add client-side file size validation.

---

### js/rbac.js
**Purpose:** Client-side Role-Based Access Control.  
**Issues:**
- 🟡 **SRP VIOLATION:** Contains RBAC logic AND credential hashing AND session management
- No HTTPS fallback for `crypto.subtle` — fails silently on HTTP
- Weak UUID generation fallback (Math.random-based)

**Suggestions:** Split into separate modules. Add HTTPS requirement check.

---

### js/reports.js
**Purpose:** Content reporting system.  
**Issues:**
- Inconsistent permission patterns (sometimes checks role, sometimes doesn't)
- Base64 encoding used as "security" for report data — provides no actual security

**Suggestions:** Use server-side API for report storage and access control.

---

### js/storage.js
**Purpose:** IndexedDB + localStorage abstraction.  
**Issues:** None — clean implementation.

---

### js/user-registry.js
**Purpose:** User directory and status management.  
**Issues:**
- Stale user cleanup doesn't broadcast changes to other tabs
- Search inconsistency (case-sensitive in some methods, case-insensitive in others)

**Suggestions:** Normalize search to always be case-insensitive.

---

### js/utils.js
**Purpose:** HTML escaping, data URL validation, text sanitization.  
**Issues:**
- `esc()` function doesn't escape single quotes (`'`) — incomplete XSS prevention for attribute contexts
- `sanitizeText()` strips `<>` but allows other HTML-significant chars

**Suggestions:** Add single-quote escaping to `esc()`. Consider DOMPurify for complex sanitization.

---

## 6. CSS Stylesheets (css/)

### css/main.css (~3000+ lines)
**Purpose:** Primary stylesheet for all static HTML pages.  
**Issues:**
- 🟡 **MASSIVE FILE:** 3000+ lines in a single file — difficult to maintain
- 🟡 **DEAD CSS:** Classes for unimplemented features (`.ai-agent-pill`, `.cam-*`, `.call-*`, `.ai-sidebar-*`) — ~500 lines of dead code
- Accessibility: some buttons use `opacity: 0` — inaccessible to keyboard navigation
- RTL bugs: some `margin-left` should be `margin-inline-start`
- No `prefers-color-scheme` media query (relies on `data-theme` attribute only)
- Missing Firefox scrollbar styling

**Suggestions:** Split into component files. Remove dead CSS. Use logical properties for RTL.

---

### css/admin.css
**Purpose:** Admin dashboard styles.  
**Issues:**
- Some unused badge variant classes
- Responsive sidebar issues on narrow screens

**Suggestions:** Audit and remove unused classes.

---

### assets/styles.css
**Purpose:** Unknown — **FILE IS EMPTY (0 bytes)**.  
**Issues:**
- 🔴 **EMPTY FILE** — serves no purpose, wastes a network request if imported

**Suggestions:** Delete this file and remove any imports referencing it.

---

## 7. Assets (assets/)

### assets/navbar.js
**Purpose:** Navbar initialization for `www/` build pages.  
**Issues:**
- 🔴 **CRITICAL BUG:** Single line `document.getElementById('navbar').textContent = '...'` — **destroys entire navbar HTML structure** by replacing innerHTML with plain text. Every page that loads this script will have a broken navbar.

**Suggestions:** Fix immediately — should use `innerHTML` and contain the full navbar HTML, or better yet, import/clone a template element.

---

### assets/chat.js (chat-overlay.js)
**Purpose:** Iframe-based chat sidebar widget — overlays on static HTML pages.  
**Issues:**
- 🟡 **URL detection bug:** Defaults to `localhost:3000` in production when `window.Capacitor` is undefined
- Dangerous service worker unregistration logic — could clear user's chat SW cache
- No error handling for iframe load failure

**Suggestions:** Fix URL detection to use same-origin in production. Remove SW unregistration.

---

## 8. Client React SPA (client/)

### client/package.json
**Purpose:** React SPA dependencies.  
**Issues:**
- No testing framework (Jest, Vitest, etc.)
- No linting (ESLint) or formatting (Prettier) for client code
- React 18.3 — current version ✅

**Suggestions:** Add Vitest for testing. Share ESLint config from root.

---

### client/vite.config.js
**Purpose:** Vite build configuration.  
**Issues:**
- Proxy hardcoded to `localhost:3000` (should read from `.env`)
- Output to `../www/chat/` — correct for project structure

**Suggestions:** Use `VITE_API_URL` env var for proxy target.

---

### client/.env.production
**Purpose:** Production server URL for Capacitor builds.  
**Issues:**
- 🔴 **WRONG IP:** `VITE_SERVER_URL=http://192.168.5.1:3000` — same wrong IP as `capacitor.config.json`
- Uses HTTP, not HTTPS — insecure for production

**Suggestions:** Update to actual server URL. Use HTTPS.

---

### client/index.html
**Purpose:** React SPA entry point.  
**Issues:**
- Multiple modals pre-loaded in DOM (admin login, upload modals) — unnecessary for chat SPA
- No CSP meta tag

**Suggestions:** Remove unused modals. Add CSP meta tag.

---

### client/src/main.jsx
**Purpose:** React root mount — clean StrictMode wrapper.  
**Issues:** None.

---

### client/src/App.jsx
**Purpose:** React Router setup with auth-gated layout, bottom navigation, room routing.  
**Issues:**
- `BottomNav` component defined inline — should be extracted to its own file
- No 404/error boundary page
- `ChatApp` shows "server unreachable" with no retry logic beyond manual button

**Suggestions:** Extract `BottomNav`. Add `<ErrorBoundary>` wrapper. Add auto-retry with backoff.

---

### client/src/services/api.js
**Purpose:** REST API wrapper — fetch-based with auth token injection.  
**Issues:**
- `BASE` URL detection duplicates logic from `js/config.js` — DRY violation
- No request timeout — hung requests block indefinitely
- No retry logic for transient network failures
- `uploadFile()` uses XMLHttpRequest (for progress) while rest uses fetch — inconsistent
- Error responses parsed to empty object on JSON parse failure — swallows error details

**Suggestions:** Add `AbortController` timeout (30s). Add retry for GET requests. Unify XHR/fetch.

---

### client/src/services/socket.js
**Purpose:** Socket.io client singleton with token-aware reconnection.  
**Issues:**
- `reconnectionAttempts: Infinity` — will never stop trying, even if server is permanently down
- `BASE` URL detection duplicates `api.js` logic

**Suggestions:** Add max reconnection attempts with user notification after threshold. Extract URL detection to shared util.

---

### client/src/context/AuthContext.jsx
**Purpose:** Auth state management — auto-register guests, session persistence.  
**Issues:**
- `getDeviceId()` fallback uses `Math.random()` — weak entropy for device identification
- Guest names follow predictable pattern (`طالب_NNNN`) — could be enumerated
- `login()` function re-registers (creates new user) instead of updating — misleading name

**Security Concerns:**
- Device ID stored in localStorage — accessible to any JS on the page
- No CSRF protection on registration endpoint

**Suggestions:** Use `crypto.randomUUID()` exclusively (supported in all modern browsers). Rename `login` to `updateUsername`.

---

### client/src/context/ChatContext.jsx (~300 lines)
**Purpose:** Central state management for rooms, messages, typing, reactions, AI streaming, presence.  
**Issues:**
- 🟡 **LARGE CONTEXT:** Single context handles 15+ action types — could benefit from splitting
- `joinRoom` closure captures stale `state.messages` — may cause unnecessary REST fetches
- `pendingIds` ref grows indefinitely (never fully cleared if server echoes are missed)
- No message count limit — very active rooms accumulate unbounded messages in memory
- `loadMore` doesn't prevent duplicate requests while one is in-flight

**Performance Concerns:**
- Every message update triggers re-render of all consumers
- No memoization on filtered/sorted room lists

**Suggestions:** Split into `RoomContext` + `MessageContext`. Add message cap (keep last 500). Add loading guard to `loadMore`. Memoize derived state.

---

### client/src/components/Chat/ChatWindow.jsx
**Purpose:** Message list with auto-scroll, infinite scroll, typing indicator.  
**Issues:**
- `markRead` called on every `msgs.length` change — excessive API calls
- `handleScroll` checks `scrollTop === 0` exactly — may miss on subpixel rendering
- No virtualization — 1000+ messages will cause performance issues

**Suggestions:** Debounce `markRead`. Use `scrollTop < 10` instead of `=== 0`. Consider `react-window` for virtualization.

---

### client/src/components/Chat/MessageBubble.jsx
**Purpose:** Individual message rendering — text, image, video, audio, file with reactions.  
**Issues:**
- ✅ **XSS SAFE:** Uses React's JSX text interpolation (auto-escapes)
- Lightbox overlay has no scroll lock
- Emoji picker has only 6 emojis
- Double-click to open emoji picker is not discoverable

**Suggestions:** Add scroll lock to lightbox. Show emoji picker hint.

---

### client/src/components/Chat/MessageInput.jsx (~200 lines)
**Purpose:** Text input, file upload with drag-and-drop, camera capture, voice recording.  
**Issues:**
- Voice recording `mimeType` detection may fail on Safari (no `audio/webm` support)
- No visual feedback for drag-and-drop zone until hover
- Camera input not available on desktop — button shows but doesn't work

**Suggestions:** Hide camera button on desktop. Add Safari-compatible mime type. Show drop zone hint.

---

### client/src/components/Chat/Sidebar.jsx
**Purpose:** Room list, search, room creation.  
**Issues:**
- Room search is case-sensitive — unexpected for Arabic users
- Logout button (`✕`) is too small and ambiguous

**Suggestions:** Make search case-insensitive. Use explicit logout icon.

---

### client/src/components/Chat/TypingIndicator.jsx
**Purpose:** "X is typing..." with animated dots.  
**Issues:** None — clean, accessible with `aria-live="polite"` ✅.

---

### client/src/components/Agents/AgentSelector.jsx
**Purpose:** Dropdown to select AI agent.  
**Issues:**
- Dropdown doesn't close on outside click
- No keyboard navigation

**Suggestions:** Add click-outside handler. Add keyboard navigation.

---

### client/src/components/Auth/LoginModal.jsx
**Purpose:** Guest name input for chat registration.  
**Issues:**
- Error messages mix Arabic and English (server sends English)

**Suggestions:** Ensure all error messages are in Arabic.

---

### client/src/components/Auth/EditNameModal.jsx
**Purpose:** Change display name modal.  
**Issues:**
- Uses `window.addEventListener('open:editname')` — fragile custom DOM events
- Inline styles in JSX

**Suggestions:** Use React context instead of DOM events. Move styles to CSS.

---

### client/src/components/Pages/HomePage.jsx (~200 lines)
**Purpose:** Room list, user search, group creation wizard.  
**Issues:**
- `allUsers` loaded on mount (entire user list) — doesn't scale
- DM room detection relies on `description` containing both user IDs — fragile

**Suggestions:** Paginate user list. Use structured metadata for DM identification.

---

### client/src/components/Pages/ChatPage.jsx
**Purpose:** Active conversation view.  
**Issues:**
- Call buttons show "coming soon" alert — misleading
- Duplicates `ChatWindow.jsx` logic

**Suggestions:** Remove call buttons until feature exists. Reuse `ChatWindow`.

---

### client/src/components/Pages/ProfilePage.jsx
**Purpose:** User profile — avatar, name edit, settings.  
**Issues:**
- Avatar stored in localStorage only — not synced with server
- Notification toggle non-functional (writes to localStorage but doesn't control anything)
- Device ID fragment shown to user

**Suggestions:** Sync avatar with server. Implement actual notification control. Don't display device ID.

---

### client/src/components/Pages/AgentsPage.jsx
**Purpose:** AI agent marketplace.  
**Issues:**
- `AUTO_AGENT` hardcoded in client — duplicated from server seed
- No loading skeleton

**Suggestions:** Fetch auto-agent config from server. Add skeleton loading UI.

---

### client/src/styles/chat.css
**Purpose:** WhatsApp-inspired chat UI styles.  
**Issues:**
- No dark mode support
- Complex inline SVG pattern for chat background
- No `prefers-reduced-motion` media query

**Suggestions:** Add dark mode. Add `prefers-reduced-motion` query.

---

## 9. Server — Core

### server/index.js (~200 lines)
**Purpose:** Express + Socket.io on same HTTP port. Static serving, API routing, cache headers, security middleware.  
**Issues:**
- ✅ Production warnings for missing `JWT_SECRET` and `ALLOWED_ORIGINS`
- ✅ Helmet CSP configured
- ✅ Compression (threshold: 1KB)
- ✅ Cache headers: immutable for hashed Vite assets, 24h JS/CSS, 7d fonts/images
- 🟡 SPA fallback serves `index.html` for all unknown routes — could mask 404s for API typos
- `NGINX_SERVES_UPLOADS` not documented in `.env.example`

**Suggestions:** Document `NGINX_SERVES_UPLOADS`. Add explicit 404 handler before SPA fallback.

---

### server/db.js (~400 lines)
**Purpose:** SQLite database layer — schema, migrations, prepared statements, seed data.  
**Issues:**
- ✅ WAL mode, pre-compiled prepared statements, admin seed guarded
- 🟡 Agent seed updates `model` on every startup — could overwrite admin customizations
- No backup strategy for SQLite file
- No database migration versioning

**Suggestions:** Add opt-out for agent seed updates. Consider migration system.

---

### server/auth.js
**Purpose:** Admin authentication — login, logout, session verification.  
**Issues:**
- ✅ JWT from `middleware/auth.js` (single source), rate limiting, bcrypt, HTTP-only cookies
- 🟡 Duplicate `requireAuth` function — also exists in `middleware/auth.js`

**Suggestions:** Remove the duplicate `requireAuth` from this file.

---

### server/upload.js (~150 lines)
**Purpose:** Secure file upload with magic-byte validation.  
**Issues:**
- ✅ Magic-byte detection, memory storage (validate before disk), rate limiting, UUID filenames
- 🟡 WebM/MP4 container can't distinguish audio vs video from magic bytes alone

**Suggestions:** Add audio/video disambiguation based on Content-Type header.

---

## 10. Server — Routes

### server/routes/admin.js
**Purpose:** Admin dashboard API — stats, user management, moderation.  
**Issues:**
- ✅ All routes behind `requireAdmin`, prepared statements, transaction-wrapped stats
- 🟡 POST endpoints don't verify DB operation succeeded
- 🟡 No audit logging for destructive operations

**Suggestions:** Check `changes` from DB operations. Add audit logging.

---

### server/routes/agents.js
**Purpose:** AI agent CRUD and chat endpoint.  
**Issues:**
- 🟡 No rate limiting on `/agents/:id/chat` — cost abuse risk
- PUT accepts `api_key_env` without validation

**Suggestions:** Add rate limiting to chat endpoint. Validate `api_key_env`.

---

### server/routes/chats.js
**Purpose:** Room lifecycle — create, join, leave, members.  
**Issues:**
- 🟡 **AUTH CONTEXT MIXUP:** ACL uses `req.user.role` to detect admins, but chat tokens don't have `role`
- `ensureRoom()` imported but unused
- No room deletion/archival endpoint

**Suggestions:** Fix ACL check. Remove dead import. Add archival endpoint.

---

### server/routes/messages.js
**Purpose:** Message retrieval, reactions, deletion.  
**Issues:**
- ✅ Async `annotateMedia()`, bulk reactions
- 🟡 Emoji validation uses `length > 8` — incorrect for multi-codepoint emoji
- No emoji whitelist

**Suggestions:** Use grapheme cluster counting. Consider emoji whitelist.

---

### server/routes/users.js
**Purpose:** Registration, search, profile lookup.  
**Issues:**
- ✅ Rate limiting on register and search
- 🟡 Username sanitization doesn't prevent Unicode homoglyphs
- `require('../db')` inside handler instead of top-level

**Suggestions:** Add homoglyph normalization. Hoist `require`.

---

### server/routes/orientation.js
**Purpose:** Admin announcement board.  
**Issues:**
- 🟡 No HTML sanitization on `body` field
- `createdBy` likely always falls back to `'admin'` string
- No update endpoint

**Suggestions:** Sanitize HTML. Fix `createdBy`. Add PUT endpoint.

---

## 11. Server — Middleware

### server/middleware/auth.js
**Purpose:** JWT verification, `requireAdmin`, `requireAuth`, `optionalAuth`.  
**Issues:** None — well-structured, single source of `JWT_SECRET` ✅.

---

## 12. Server — Services

### server/services/ai.service.js
**Purpose:** Multi-provider AI — OpenAI, Gemini, OpenRouter with streaming + keep-alive.  
**Issues:**
- ✅ HTTP keep-alive, LRU cache (500 entries, 5min TTL), streaming
- 🟡 Cache key truncated to 200 chars — could cause false cache hits
- No circuit breaker for provider outages
- 20s timeout may be too short for complex queries

**Suggestions:** Add circuit breaker. Increase streaming timeout to 60s. Use full message hash for cache key.

---

## 13. Server — Socket

### server/socket/index.js (~200+ lines)
**Purpose:** Socket.io events — join, message, typing, reactions, read receipts, AI streaming.  
**Issues:**
- ✅ JWT auth, per-socket rate limiter, message sanitization, media URL validation, room ACL, AI quota
- 🟡 `annotateMedia()` uses sync `fs.existsSync` — blocks event loop (routes version already fixed to async)
- Room presence uses in-memory `Map` — not shared across instances

**Suggestions:** Convert `annotateMedia()` to async. Document single-instance limitation.

---

## 14. Server — Tests

### server/tests/api.test.js
**Purpose:** Basic integration tests — health, registration, AI chat.  
**Issues:**
- Only 3 endpoints tested — **very low coverage**
- Requires running server — no mock/stub
- No timeout on requests
- Uses `console.warn()` instead of test reporter

**Missing Tests:** Chat rooms, messages, admin, upload, WebSocket, error cases.  
**Suggestions:** Adopt Vitest or Jest. Add supertest. Aim for >60% route coverage.

---

### server/.eslintrc.json
**Purpose:** ESLint rules for server code.  
**Issues:**
- Missing `no-var`, `prefer-const`, `require-await` rules
- `no-unused-vars: warn` should be `error`
- `ecmaVersion: 2022` — update to 2025

---

## 15. Deployment Configs

### Dockerfile
**Purpose:** Multi-stage Docker build.  
**Issues:**
- ✅ Non-root user, multi-stage build, `NODE_ENV=production`
- 🟡 No `.dockerignore`
- No `.env` copied — must provide at runtime

**Suggestions:** Add `.dockerignore`. Pin Alpine version.

---

### docker-compose.yml
**Purpose:** Orchestrates Node app + Nginx.  
**Issues:**
- ✅ Health checks, volume persistence
- 🟡 `depends_on` doesn't use `service_healthy` condition
- If `madarik.db` doesn't exist locally, Docker creates directory instead of file

**Suggestions:** Use `depends_on.condition: service_healthy`. Create empty `.db` before first run.

---

### ecosystem.config.js
**Purpose:** PM2 config for VPS deployment.  
**Issues:**
- ✅ Single instance (correct for SQLite), memory limit, graceful shutdown
- 🟡 Log directories not created automatically
- No log rotation configured

**Suggestions:** Add `mkdir -p /var/log/madarik` to deploy script. Configure log rotation.

---

### nginx/nginx.conf
**Purpose:** Reverse proxy, TLS, static serving, WebSocket support.  
**Issues:**
- ✅ Security headers, HTTP→HTTPS redirect, WebSocket handling
- 🔴 **PLACEHOLDER DOMAIN:** `server_name YOUR_DOMAIN_HERE`
- TLS cert paths must exist or Nginx fails — no fallback
- `proxy_read_timeout 86400` (24h) — could exhaust connections

**Suggestions:** Update domain. Add Nginx-level rate limiting. Shorter WebSocket timeout (4h).

---

## 16. Android (Capacitor)

### android/app/build.gradle
**Purpose:** Android app build config.  
**Issues:**
- `android:usesCleartextTraffic="true"` — insecure for production

**Suggestions:** Create separate build flavors for dev (cleartext=true) and prod (cleartext=false).

---

## 17. Critical Findings Summary

### 🔴 CRITICAL (Immediate Action Required)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | **assets/navbar.js destroys navbar HTML** | `assets/navbar.js` | Every www/ page has broken navigation |
| C2 | **Xxxxx.html hardcoded credentials** | `Xxxxx.html` | Admin credentials exposed in browser source |
| C3 | **Wrong Capacitor IP address** | `capacitor.config.json`, `client/.env.production` | Android app cannot connect to dev server |
| C4 | **Empty assets/styles.css** | `assets/styles.css` | Wasted network request |
| C5 | **nginx placeholder domain** | `nginx/nginx.conf` | Deployment will fail if not updated |

### 🟠 HIGH (Should Fix Soon)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | **16 HTML files with 95% duplication** | All root `.html` files | Massive maintenance burden |
| H2 | **Client-side RBAC only on admin.html** | `admin.html`, `js/rbac.js` | Admin bypass via DevTools |
| H3 | **No test coverage** | `server/tests/` | Regressions undetected |
| H4 | **ChatContext too large (15+ actions)** | `client/src/context/ChatContext.jsx` | Performance issues |
| H5 | **Auth context mixup in chats ACL** | `server/routes/chats.js` | Admin bypass or false denials |
| H6 | **Sync fs.existsSync in socket** | `server/socket/index.js` | Blocks event loop |

### 🟡 MEDIUM

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| M1 | Dead CSS (~500 lines) | `css/main.css` | Bloated CSS |
| M2 | No audit logging | `server/routes/admin.js` | Accountability gap |
| M3 | Emoji validation incorrect | `server/routes/messages.js` | Multi-codepoint emoji rejected |
| M4 | No .dockerignore | Root | Large Docker builds |
| M5 | Username homoglyph attack | `server/routes/users.js` | Impersonation possible |
| M6 | AI cache key collision | `server/services/ai.service.js` | Wrong cached responses |
| M7 | No dark mode | `client/src/styles/chat.css` | Poor low-light UX |
| M8 | No request timeout in api.js | `client/src/services/api.js` | Hung UI |
| M9 | Socket.io single-instance | `server/socket/index.js` | Can't scale horizontally |
| M10 | Duplicate requireAuth | `server/auth.js` | Code confusion |
| M11 | chat-overlay URL bug | `assets/chat.js` | Wrong URL in production |
| M12 | No rate limit on AI chat route | `server/routes/agents.js` | Cost abuse |

### 🟢 LOW

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| L1 | No prefers-reduced-motion | CSS files | Accessibility |
| L2 | Call buttons "coming soon" | `ChatPage.jsx` | Misleading UI |
| L3 | Device ID shown to user | `ProfilePage.jsx` | Info leak |
| L4 | Notification toggle fake | `ProfilePage.jsx` | Misleading setting |
| L5 | version.json not semver | `version.json` | Convention |
| L6 | No .npmrc | Root | Dependency drift |
| L7 | ESLint ecmaVersion old | `server/.eslintrc.json` | Missing syntax |
| L8 | EditNameModal uses DOM events | `EditNameModal.jsx` | Fragile coupling |
| L9 | AgentSelector no click-outside | `AgentSelector.jsx` | UX issue |

---

## 18. Recommendations

### Immediate (Week 1)
1. **Fix `assets/navbar.js`** — Replace `.textContent` with proper `.innerHTML` or template cloning
2. **Delete or gut `Xxxxx.html`** — Remove hardcoded credentials, either delete or refactor
3. **Fix Capacitor IP** — Update `192.168.5.1` to actual IP in `capacitor.config.json` and `client/.env.production`
4. **Delete empty `assets/styles.css`** — Remove file and any references
5. **Fix `annotateMedia()` in `socket/index.js`** — Convert to async like the routes version

### Short-term (Month 1)
6. **Template the 16 HTML pages** — Generate from single template with level-specific data
7. **Add `.dockerignore`** — Exclude `node_modules/`, `.git/`, `*.db`, `android/`
8. **Fix auth context in `chats.js`** — Properly detect admin vs chat user tokens
9. **Add test coverage** — At minimum: auth, rooms, messages, upload endpoints
10. **Split `ChatContext`** — Separate rooms, messages, and UI state

### Medium-term (Quarter 1)
11. **Remove dead CSS** — Audit and remove unused classes from `main.css`
12. **Add audit logging** — Log all admin actions server-side
13. **Add dark mode** — CSS custom properties with `prefers-color-scheme`
14. **Add request timeouts** — `AbortController` in `api.js` with 30s timeout
15. **Add Redis adapter** — For Socket.io horizontal scaling readiness

---

**End of Audit Report**
