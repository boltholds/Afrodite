# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS workspace
ARG VITE_GEFEST_PREVIEW_URL=http://localhost:3000
ENV VITE_GEFEST_PREVIEW_URL=$VITE_GEFEST_PREVIEW_URL
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @afrodite/verified-write build \
    && pnpm --filter @afrodite/studio exec vite build \
    && pnpm --filter @afrodite/preview-host exec vite build

FROM nginx:1.27-alpine AS studio
COPY deploy/nginx/studio.conf /etc/nginx/conf.d/default.conf
COPY --from=workspace /app/apps/studio/dist /usr/share/nginx/html
EXPOSE 8080

FROM nginx:1.27-alpine AS preview-host
COPY deploy/nginx/preview-host.conf /etc/nginx/conf.d/default.conf
COPY --from=workspace /app/apps/preview-host/dist /usr/share/nginx/html
EXPOSE 8080

FROM workspace AS node-runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM node-runtime AS project-bridge
COPY deploy/docker/project-bridge-entrypoint.sh /usr/local/bin/afrodite-project-bridge-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/afrodite-project-bridge-entrypoint \
    && chmod 0755 /usr/local/bin/afrodite-project-bridge-entrypoint
EXPOSE 4175
ENTRYPOINT ["afrodite-project-bridge-entrypoint"]

FROM node-runtime AS target-preview
COPY deploy/docker/target-preview-entrypoint.sh /usr/local/bin/afrodite-target-preview-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/afrodite-target-preview-entrypoint \
    && chmod 0755 /usr/local/bin/afrodite-target-preview-entrypoint
EXPOSE 3000
ENTRYPOINT ["afrodite-target-preview-entrypoint"]

FROM node-runtime AS agent-gateway
EXPOSE 8770
CMD ["pnpm", "--filter", "@afrodite/agent-gateway", "exec", "tsx", "src/http.ts"]
