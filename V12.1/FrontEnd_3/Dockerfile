FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS build
WORKDIR /app
COPY package.json ./
COPY tools/build.cjs ./tools/build.cjs
COPY index.html ./index.html
COPY styles ./styles
COPY js ./js
COPY assets ./assets
RUN npm run build

FROM nginx:alpine AS runtime
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_UPSTREAM=http://backend:3000
ENV NGINX_ENVSUBST_FILTER="^BACKEND_UPSTREAM$"
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD wget -q --spider http://127.0.0.1/healthz || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
