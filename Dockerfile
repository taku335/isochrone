FROM node:22-bookworm-slim

WORKDIR /workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable \
  && corepack prepare pnpm@10.13.1 --activate \
  && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json eslint.config.js ./
COPY apps/web/package.json apps/web/package.json
COPY packages/gtfs-types/package.json packages/gtfs-types/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/raptor/package.json packages/raptor/package.json

RUN pnpm install --frozen-lockfile

COPY . .
