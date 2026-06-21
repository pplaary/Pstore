FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci && npm prune --production

COPY src ./src
RUN npm run build

EXPOSE 3141
VOLUME ["/data"]
ENV DATA_DIR=/data

CMD ["node", "dist/index.js"]
