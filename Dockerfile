# ============================================
# WordPress 全自動リライトツール
# マルチステージ Docker ビルド
# ============================================

# --- Stage 1: 依存関係インストール ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

# --- Stage 2: ビルド ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Stage 3: 本番 ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002

# セキュリティ: 非rootユーザー
RUN addgroup --system --gid 1001 rewriter \
 && adduser --system --uid 1001 rewriter

# 必要ファイルのみコピー
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.mjs ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prompts ./prompts

# データ・ログ用ディレクトリ（ボリュームマウント対象）
RUN mkdir -p data/sites logs \
 && chown -R rewriter:rewriter data logs .next

USER rewriter

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/ || exit 1

CMD ["node", "server.mjs"]
