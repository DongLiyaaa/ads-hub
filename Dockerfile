FROM --platform=linux/amd64 node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --registry=https://registry.npmmirror.com
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM --platform=linux/amd64 node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=80
ENV CODEX_CLI_PATH=/app/node_modules/.bin/codex
ENV CLAUDE_CLI_PATH=/app/node_modules/.bin/claude
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com \
    && CLAUDE_VERSION=$(node -p "require('./node_modules/@anthropic-ai/claude-code/package.json').version") \
    && npm install --omit=dev --no-save --package-lock=false --registry=https://registry.npmmirror.com "@anthropic-ai/claude-code-linux-x64-musl@${CLAUDE_VERSION}" \
    && node node_modules/@anthropic-ai/claude-code/install.cjs \
    && npm cache clean --force \
    && /app/node_modules/.bin/claude --version \
    && /app/node_modules/.bin/codex --version
COPY server ./server
COPY db ./db
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /home/node/.codex && chown node:node /home/node/.codex
USER node
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["sh", "server/docker-entrypoint.sh"]
