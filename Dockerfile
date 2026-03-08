FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENV NODE_ENV=development

CMD ["sh", "-lc", "npm install && npm run dev"]
