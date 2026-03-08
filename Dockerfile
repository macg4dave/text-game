FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["sh", "-lc", "mkdir -p /data && ln -sf /data/game.db /app/data/game.db && npm start"]
