FROM node:22.21.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tools/build.cjs ./tools/build.cjs
COPY index.html ./
COPY styles ./styles
COPY js ./js
COPY assets ./assets
RUN npm run build

FROM nginx:alpine AS runtime
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/www/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
