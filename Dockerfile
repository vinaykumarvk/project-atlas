FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --shamefully-hoist
COPY packages/shared packages/shared
COPY packages/api packages/api
RUN cd packages/api && npx prisma generate
RUN pnpm --filter @atlas/shared build 2>/dev/null || true
RUN pnpm --filter @atlas/api build

FROM node:20-slim AS production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/package.json ./
COPY --from=build /app/packages/api/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
