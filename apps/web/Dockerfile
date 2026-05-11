FROM node:20-alpine

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry ${NPM_REGISTRY} \
 && npm config set audit false \
 && npm config set fund false \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm ci --verbose

COPY . .

WORKDIR /app/apps/web

RUN npx prisma generate && npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run start"]
