FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts
COPY nest-cli.json tsconfig.json ./
RUN npm run build

FROM node:22-alpine AS migration
WORKDIR /app
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY scripts/migration.cjs ./scripts/migration.cjs
CMD ["node", "scripts/migration.cjs", "status"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional
COPY --chown=node:node --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
