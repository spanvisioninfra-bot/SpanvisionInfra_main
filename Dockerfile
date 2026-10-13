FROM node:24-bookworm-slim AS frontend
ARG SPANVISION_SERVICE=bim
WORKDIR /build
COPY vision-bim-validator/viewer/package*.json ./
RUN if [ "$SPANVISION_SERVICE" = "bim" ]; then npm ci; fi
COPY vision-bim-validator/viewer/ ./
COPY deployment/browser-identity.mjs /browser-identity.mjs
COPY deployment/browser-icons/ /browser-icons/
COPY deployment/browser-ui.mjs /browser-ui.mjs
COPY deployment/browser-ui/ /browser-ui/
RUN if [ "$SPANVISION_SERVICE" = "bim" ]; then npm run build && node /browser-identity.mjs dist; else mkdir -p dist; fi
COPY spanvision-stl-3d-map-workspace/web/ /build-stl/
RUN node /browser-identity.mjs /build-stl /static/__spanvision-brand/

FROM python:3.12-slim-bookworm
ARG SPANVISION_SERVICE=bim
ENV SPANVISION_SERVICE=${SPANVISION_SERVICE} \
    SPANVISION_CLOUD=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    DATABASE_URL=sqlite+aiosqlite:////tmp/spanvision-bim.db \
    PROJECT_FILES_DIR=/tmp/spanvision-bim-projects \
    SPANVISION_STL_DATA_DIR=/tmp/spanvision-stl
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /suite
COPY deployment/ ./deployment/
COPY vision-bim-validator/server/ ./vision-bim-validator/server/
COPY vision-bim-validator/src/ ./vision-bim-validator/src/
COPY vision-bim-validator/pyproject.toml vision-bim-validator/README.md ./vision-bim-validator/
COPY spanvision-stl-3d-map-workspace/app/ ./spanvision-stl-3d-map-workspace/app/
COPY --from=frontend /build-stl/ ./spanvision-stl-3d-map-workspace/web/
COPY spanvision-stl-3d-map-workspace/legal/ ./spanvision-stl-3d-map-workspace/legal/
COPY spanvision-stl-3d-map-workspace/LICENSE spanvision-stl-3d-map-workspace/requirements.txt spanvision-stl-3d-map-workspace/brand.json ./spanvision-stl-3d-map-workspace/
RUN if [ "$SPANVISION_SERVICE" = "bim" ]; then \
      pip install --no-cache-dir -r vision-bim-validator/server/requirements.txt ./vision-bim-validator; \
    else pip install --no-cache-dir -r spanvision-stl-3d-map-workspace/requirements.txt; fi
COPY --from=frontend /build/dist/ ./vision-bim-validator/viewer/dist/
RUN useradd --create-home --uid 10001 spanvision && chown -R spanvision:spanvision /suite
USER spanvision
EXPOSE 10000
CMD ["sh", "-c", "exec python -m uvicorn deployment.cloud_app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --proxy-headers"]
