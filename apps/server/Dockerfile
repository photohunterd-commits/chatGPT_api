FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/package.json

RUN npm install --workspace apps/server

COPY apps/server ./apps/server

RUN npm run build --workspace apps/server \
    && npm prune --omit=dev --workspace apps/server

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist

EXPOSE 3030

CMD ["node", "apps/server/dist/index.js"]
