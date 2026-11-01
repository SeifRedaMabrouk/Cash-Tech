# Stage 1: build the site from source (works from a fresh GitHub checkout; dist/ is not needed in git).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: small runtime image.
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server ./server
COPY drizzle ./drizzle
COPY scripts/backup.mjs ./scripts/backup.mjs
# APP_ORIGIN must be set when running the container (the server refuses to start without it in production).
# TRUST_PROXY is OFF by default (safe if port 3000 is reachable directly). Behind ONE reverse proxy
# (nginx, Cloudflare, Railway, Render, Fly...) AND with port 3000 closed to the internet, run with -e TRUST_PROXY=1.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data TRUST_PROXY=0 NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN mkdir /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
