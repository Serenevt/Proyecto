FROM node:22.21.1-bookworm-slim AS build
WORKDIR /app
# The static build has no npm dependencies.
COPY package.json ./
COPY tools/build.cjs ./tools/build.cjs
COPY src ./src
COPY assets ./assets
RUN npm run build

FROM nginx:alpine AS runtime
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
COPY nginx/15-kiosk-key.sh /docker-entrypoint.d/15-kiosk-key.sh
RUN chmod +x /docker-entrypoint.d/15-kiosk-key.sh
ENV NGINX_ENVSUBST_FILTER="^KIOSK_API_KEY$"
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
