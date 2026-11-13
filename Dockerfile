FROM --platform=linux/amd64 node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM --platform=linux/amd64 node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=80
ENV CODEX_CLI_PATH=/app/node_modules/.bin/codex
ENV CLAUDE_CLI_PATH=/app/node_modules/.bin/claude
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY db ./db
COPY --from=build /app/dist ./dist
RUN mkdir -p /home/node/.codex && chown node:node /home/node/.codex
USER node
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["sh", "server/docker-entrypoint.sh"]
