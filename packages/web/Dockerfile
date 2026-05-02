FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --shamefully-hoist

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared packages/shared
COPY packages/web packages/web
COPY tsconfig.base.json ./
ENV VITE_API_URL=""
RUN cd packages/shared && npx tsc -p tsconfig.json 2>/dev/null || true
RUN cd packages/web && npx vite build

FROM nginx:alpine AS production
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
