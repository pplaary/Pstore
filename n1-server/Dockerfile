# Stage 1: Build web frontend
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build n1-server backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY n1-server/package.json n1-server/package-lock.json ./
RUN npm ci
COPY n1-server/tsconfig.json ./
COPY n1-server/src ./src
RUN npm run build

# Stage 3: Production deps only
FROM node:20-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY n1-server/package.json n1-server/package-lock.json ./
RUN npm ci --omit=dev

# Stage 4: Runtime
FROM node:20-alpine
RUN apk add --no-cache tzdata
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist
COPY --from=web-builder /app/web/dist ./web/dist
COPY n1-server/package.json ./

# APK download (optional — skip if not built yet)
RUN mkdir -p /app/web/dist/apk
COPY android/app/build/outputs/apk/release/app-release.apk ./web/dist/apk/

RUN mkdir -p /data

ENV PORT=3141
ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3141
CMD ["node", "dist/index.js"]
