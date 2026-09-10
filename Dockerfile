# syntax=docker/dockerfile:1
# SvelteKit (adapter-node) image + Go-парсер цен (parsers-bin).

FROM golang:1.27-alpine AS prices
WORKDIR /src/parsers
COPY parsers/go.mod parsers/go.sum ./
RUN go mod download
COPY parsers/ ./
RUN CGO_ENABLED=0 go build -o /out/parsers-bin ./cmd/prices

FROM node:26-slim AS build
# Public-facing origin for CSRF checks when behind a reverse proxy (SvelteKit 3
# reads it from paths.origin at build time, the ORIGIN env var no longer exists):
# docker build --build-arg APP_ORIGIN=https://example.com .
ARG APP_ORIGIN
ENV APP_ORIGIN=$APP_ORIGIN
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11.25.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:26-slim AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Go-парсер (CGO_ENABLED=0) проверяет TLS системным CA-бандлом через
# crypto/x509 — в node:slim его нет, без этого все HTTPS-запросы падают
# с "x509: certificate signed by unknown authority".
# За MITM-прокси с собственным CA: смонтируйте сертификат и задайте
# SSL_CERT_FILE=/path/to/ca.crt (Go его подхватывает).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists
# SQLite (drizzle + node:sqlite): файл БД и миграции.
# Remote-функции сверяют Origin с origin из сборки (см. APP_ORIGIN выше):
# за reverse proxy с TLS соберите с APP_ORIGIN=https://example.com,
# при прямой раздаче HTTP — с APP_ORIGIN=http://host:port.
ENV DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/node_modules ./node_modules
COPY --from=prices /out/parsers-bin ./parsers-bin
# Копия для явного --mapping (по умолчанию бинарь использует встроенный).
COPY parsers/mappings/ ./mappings/
COPY package.json ./
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
