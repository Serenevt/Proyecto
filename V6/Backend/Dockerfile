FROM node:22.21.1-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM build AS test
COPY test ./test
COPY jest.config.cjs eslint.config.cjs .prettierrc.json ./
CMD ["npm", "test"]

FROM build AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY scripts/demo.cjs ./scripts/demo.cjs
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
