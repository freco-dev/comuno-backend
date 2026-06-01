# Stage 1: Build
FROM node:20-alpine AS builder

RUN apk update && apk upgrade && \
    apk add --no-cache ffmpeg

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install && npm audit fix --force

COPY . .

RUN npx prisma generate
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache ffmpeg

WORKDIR /usr/src/app

# Default Environment Variables
ENV DATABASE_URL="postgresql://postgres:password@172.17.0.1:5433/comunoactive?schema=public"
ENV JWT_SECRET="super-secret-key"
ENV STORAGE_PATH="/usr/src/app/storage/records"
ENV PORT=3000

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
