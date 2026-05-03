FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY tsconfig.base.json ./
RUN cd packages/shared && pnpm build || true
RUN cd packages/api && pnpm build

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules
COPY packages/api/package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
