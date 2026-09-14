FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_RELEASE_CHANNEL=standard
ENV VITE_RELEASE_CHANNEL=$VITE_RELEASE_CHANNEL
ARG AEN_RELEASE_METADATA
RUN AEN_RELEASE_METADATA="$AEN_RELEASE_METADATA" npm run build

FROM nginx:1.27.5-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
ENV PORT=8080 API_UPSTREAM=http://api:3000 NGINX_ENVSUBST_FILTER=^(PORT|API_UPSTREAM)$
COPY docker-entrypoint.d/15-validate-runtime-env.sh /docker-entrypoint.d/15-validate-runtime-env.sh
RUN chmod 755 /docker-entrypoint.d/15-validate-runtime-env.sh
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
