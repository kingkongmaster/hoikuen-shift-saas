FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=8080 API_UPSTREAM=http://api:3000 NGINX_ENVSUBST_FILTER=^(PORT|API_UPSTREAM)$
COPY docker-entrypoint.d/15-validate-runtime-env.sh /docker-entrypoint.d/15-validate-runtime-env.sh
RUN chmod 755 /docker-entrypoint.d/15-validate-runtime-env.sh
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
