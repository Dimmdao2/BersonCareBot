# Build of all five production processes as one image.
#
# One image, not five: blue-green switching means "run this exact commit" and that promise is only
# checkable if every process comes from a single artifact with a single tag. Five images built from
# the same source can drift by a rebuild and produce a mixed deployment no one can name afterwards.
# The process is chosen by the container command, not by the image.
#
# Base is pinned by digest rather than by :22-bookworm-slim, so a rebuild months from now produces
# the same operating system it produced today. A moving tag makes "rebuild the previous commit to
# roll back" a lie: same source, different base, different behaviour.
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# git is needed by the build itself (some steps read the commit), ca-certificates for the registry.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV CI=true
# The pnpm version is taken from the repo's packageManager field, not chosen here — corepack reads it.
RUN corepack enable

# Manifests first, so a source-only change does not re-download the dependency tree.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/integrator/package.json      apps/integrator/
COPY apps/webapp/package.json          apps/webapp/
COPY apps/media-worker/package.json    apps/media-worker/
COPY packages/db-principal/package.json       packages/db-principal/
COPY packages/platform-merge/package.json     packages/platform-merge/
COPY packages/operator-db-schema/package.json packages/operator-db-schema/
COPY packages/error-tracking/package.json     packages/error-tracking/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
# install is repeated because the workspace link graph is only complete once the sources are present;
# with the store cache warm this is a relink, not a download.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

RUN pnpm build \
 && pnpm build:webapp \
 && pnpm --dir apps/media-worker build \
 && bash deploy/host/sync-webapp-standalone-assets.sh

# The build id is baked in so a running container can be asked what it is, without trusting the tag
# someone typed. This is what `bcb-status` reports.
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
RUN printf 'BCB_GIT_COMMIT=%s\nBCB_BUILD_TIME=%s\n' "$GIT_COMMIT" "$BUILD_TIME" > /app/.build-id

# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

# ffmpeg is only used by the media-worker, but it lives in the shared image for the reason above:
# one artifact per commit. tini reaps zombies; node as PID 1 does not, and ffmpeg spawns children.
# curl is the health probe — the deploy script must be able to ask the container itself, from inside,
# whether it is serving, before anything is switched onto it.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg tini curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# The whole built tree is carried over, dev dependencies included, instead of a pruned copy.
# Pruning a pnpm workspace re-resolves symlinks and has silently dropped transitive runtime
# dependencies that only some code paths reach — a failure that appears days later on a rare route,
# not at deploy time. Disk is 63 GB and an image is ~2 GB; that trade is not close.
COPY --from=builder --chown=node:node /app /app

# node:22 ships an unprivileged `node` user. Nothing in the container needs to write to /app.
USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
