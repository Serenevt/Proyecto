# =============================================================================
# FuelFlow Autónomo · Primax  —  Frontend
# -----------------------------------------------------------------------------
# Sitio estático puro: HTML + CSS + JS + imágenes. No hay build (no hay
# npm, ni bundler, ni node_modules), así que Nginx sirve los archivos tal cual
# y por eso basta una sola etapa.
#
# IMPORTANTE sobre las rutas:
#   index.html vive en  src/
#   y desde ahí sube a     assets/img/  con  "../assets/img/..."
#   Nginx NO reescribe el HTML, así que el sitio abre igual que en file://
# =============================================================================

FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="FuelFlow Frontend" \
      org.opencontainers.image.description="Frontend kiosk FuelFlow - Primax (Nginx Alpine)" \
      org.opencontainers.image.version="1.0"

# --- Zona horaria y permisos de los assets estáticos ---
RUN set -eux; \
    apk add --no-cache tzdata; \
    ln -snf /usr/share/zoneinfo/America/Lima /etc/localtime; \
    echo "America/Lima" > /etc/timezone; \
    mkdir -p /var/cache/nginx /var/run; \
    chown -R nginx:nginx /var/cache/nginx /var/run

# --- Copia del sitio ---
# El .dockerignore ya excluye .git, editores, logs, etc.
COPY src/   /usr/share/nginx/html/src/
COPY assets/ /usr/share/nginx/html/assets/

# --- Configuración del sitio ---
# `root` apunta a la CARPETA PADRE de src/ porque el HTML usa rutas
# relativas con "..": así / y /src/index.html resuelven bien.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# --- Healthcheck: usa wget porque la imagen alpine no trae curl ---
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

EXPOSE 80

# --- Nginx en primer plano (no demonio) para que Docker lo gestione ---
CMD ["nginx", "-g", "daemon off;"]