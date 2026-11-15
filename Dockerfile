# Hearth container image.
#
# Stages:
#   deps     install all workspaces (cached until a lockfile or manifest changes)
#   build    compile the web app (Vite) and the server (tsc)
#   runtime  production dependencies plus compiled output only
#
# Layout matches server/src/index.ts, which serves ../../web/dist relative to
# server/dist. Running /app/server/dist/index.js therefore resolves /app/web/dist.

FROM node:22-slim AS deps
WORKDIR /app
# Manifests only, so this layer is reused while source code changes.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run build --workspace web && npm run build --workspace server

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
# The lockfile covers every workspace, so all workspace manifests must be present
# for `npm ci` to validate it, even though only the server's dependencies are installed.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace=server --include-workspace-root=false \
    && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# Drop root privileges; the node user ships with the official node images.
USER node
EXPOSE 8080
# No HEALTHCHECK: Cloud Run probes the container itself.
CMD ["node", "server/dist/index.js"]
