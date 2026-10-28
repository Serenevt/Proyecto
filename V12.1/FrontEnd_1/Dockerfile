FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS build
ARG FUELFLOW_KIOSK_AUTH=false
WORKDIR /app
# The static build has no npm dependencies.
COPY package.json ./
COPY tools/build.cjs ./tools/build.cjs
COPY src ./src
COPY assets ./assets
RUN npm run build

FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS gateway
WORKDIR /app
COPY package.json ./
COPY server ./server
USER node
EXPOSE 3001
CMD ["node", "server/local.js"]

FROM nginx:alpine AS runtime
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
ENV PRIME_WEB_PORT=11082
ENV FUELFLOW_GATEWAY_UPSTREAM=http://fuelflow-gateway:3001
ENV NGINX_ENVSUBST_FILTER="^(PRIME_WEB_PORT|FUELFLOW_GATEWAY_UPSTREAM)$"
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
