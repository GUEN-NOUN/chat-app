# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for Madarik
#
# Stage 1 — build: installs Node deps and builds the React chat SPA
# Stage 2 — runtime: lean production image, only what's needed to run
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# --- server deps ---
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# --- client deps + build ---
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
COPY js/      ./js/

# Build React SPA → www/chat/
WORKDIR /app/client
RUN npm run build   # outputs to ../www/chat/

WORKDIR /app

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Non-root user for security
RUN addgroup -S madarik && adduser -S madarik -G madarik

# Copy server code + pre-installed production modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/server/node_modules ./server/node_modules

# Copy ALL static web assets (built React + HTML/JS/CSS)
COPY --from=builder /app/www ./www
COPY assets/  ./assets/
COPY css/     ./css/

# Uploads folder (runtime writes here, mount a volume in production)
RUN mkdir -p uploads && chown madarik:madarik uploads

USER madarik

EXPOSE 3000
WORKDIR /app/server
ENV NODE_ENV=production

CMD ["node", "index.js"]
