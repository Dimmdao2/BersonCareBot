FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

EXPOSE 3000
CMD ["node", "dist/main.js"]
