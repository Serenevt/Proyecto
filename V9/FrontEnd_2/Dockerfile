FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN test "$(npm --version)" = "10.9.4" && npm ci --no-audit --no-fund
COPY tools/build.cjs ./tools/build.cjs
COPY index.html ./
COPY styles ./styles
COPY js ./js
COPY assets ./assets
# La cuenta de demostración (correo + contraseña) solo se incrusta en el
# bundle cuando el despliegue es local. Un build de producción no publica
# ninguna credencial. Compose lo activa con FUELFLOW_DEMO=1.
ARG FUELFLOW_DEMO=0
ENV FUELFLOW_DEMO=$FUELFLOW_DEMO
RUN npm run build

FROM nginx:alpine AS runtime
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/www/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
