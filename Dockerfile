FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build -w web

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server

# Node 24 chạy thẳng .ts nên server không cần build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3701 STATIC_DIR=/app/web/dist
COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json server/
COPY server/src server/src
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 3701
LABEL io.floci.console.health-path=/api/health
CMD ["node", "server/src/index.ts"]
