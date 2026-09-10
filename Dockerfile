# syntax=docker/dockerfile:1
# SvelteKit (adapter-node) image

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
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3000
CMD ["node", "build"]
