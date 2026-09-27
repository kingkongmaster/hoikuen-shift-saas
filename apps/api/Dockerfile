FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && find node_modules -type d \( -name test -o -name tests -o -name fixtures -o -name __tests__ \) -prune -exec rm -rf {} +
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts
COPY nest-cli.json tsconfig.json ./
RUN npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS production-artifacts
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# Strip only source maps before artifacts enter any runtime image layer.
RUN find dist node_modules/.prisma -type f -name '*.map' -delete

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional && find node_modules -type d \( -name test -o -name tests -o -name fixtures -o -name __tests__ \) -prune -exec rm -rf {} +
RUN find node_modules -type f -name '*.map' -delete

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS migration-dependencies
WORKDIR /app
COPY migration/package*.json ./
RUN npm ci --omit=dev && find node_modules -type d \( -name test -o -name tests -o -name fixtures -o -name __tests__ \) -prune -exec rm -rf {} +

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime-tools
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && addgroup -g 20001 operations && adduser -D -u 20001 -G operations operations

FROM scratch AS migration
COPY --from=runtime-tools / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY migration/package*.json ./
COPY --from=migration-dependencies /app/node_modules ./node_modules
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY scripts/migration.cjs ./scripts/migration.cjs
CMD ["node", "scripts/migration.cjs", "status"]

FROM scratch AS operations
COPY --from=runtime-tools / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NODE_ENV=production HOME=/home/operations
WORKDIR /app
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=operations:operations --from=production-artifacts /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=operations:operations scripts/bootstrap-admin.cjs scripts/import-musubi-beta.cjs scripts/apply-musubi-tenant-master.cjs scripts/apply-tenant-monthly-package.cjs scripts/verify-musubi-provisioning.cjs ./scripts/
COPY --chown=operations:operations scripts/lib ./scripts/lib
COPY --chown=operations:operations tenant-packages ./tenant-packages
RUN mkdir -p /var/lib/aen-shift/provisioning && chown operations:operations /var/lib/aen-shift/provisioning
USER 20001:20001
CMD ["node", "scripts/verify-musubi-provisioning.cjs", "--help"]

FROM scratch AS runtime
COPY --from=runtime-tools / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NODE_ENV=production HOME=/home/node
WORKDIR /app
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=production-artifacts /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=production-artifacts /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
