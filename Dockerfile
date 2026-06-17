FROM node:20-bookworm-slim AS base
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y \
  openssl \
  fontconfig \
  fonts-dejavu-core \
  fonts-noto-core \
  fonts-liberation \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts --include=dev --include=optional

COPY . .
RUN npm run prisma:generate
RUN npm run build
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
