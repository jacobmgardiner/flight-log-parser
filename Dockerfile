# ---- Stage 1: build DJI sample binary (FRSample) ----------------------------
FROM ubuntu:20.04 AS dji-build

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git curl libssl-dev libcurl4-openssl-dev zlib1g-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pin the upstream repo + ref for reproducible builds
ARG DJI_REPO=https://github.com/dji-sdk/FlightRecordParsingLib.git
ARG DJI_REF=v1.0.6

WORKDIR /src
RUN set -eux; \
  git clone --depth 1 --branch "${DJI_REF}" "${DJI_REPO}" dji || ( \
    git clone "${DJI_REPO}" dji && cd dji && git checkout "${DJI_REF}" \
  ); \
  cd dji; \
  # Locate FRSample across possible layouts
  if [ -f dji-flightrecord-kit/build/Ubuntu/FRSample/generate.sh ]; then \
    SAMPLE_DIR="dji-flightrecord-kit/build/Ubuntu/FRSample"; \
  elif [ -f v1.0.6/dji-flightrecord-kit/build/Ubuntu/FRSample/generate.sh ]; then \
    SAMPLE_DIR="v1.0.6/dji-flightrecord-kit/build/Ubuntu/FRSample"; \
  else \
    echo "Could not find generate.sh. Tree:"; ls -R; exit 1; \
  fi; \
  cd "$SAMPLE_DIR"; \
  sed -i 's/\r$//' generate.sh || true; \
  printf "0\n" | sh ./generate.sh; \
  cp ./FRSample /usr/local/bin/FRSample

# ---- Stage 2: build TS server ----------------------------------------------
FROM node:20 AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm i
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Stage 3: runtime: tiny HTTP server + FRSample -------------------------
FROM node:20-slim AS runtime
COPY --from=dji-build /src/dji/LICENSE.txt /licenses/dji-flightrecordparsinglib-LICENSE.txt
COPY LICENSE /licenses/our-project-LICENSE.txt
COPY NOTICE /licenses/NOTICE.txt

# Runtime libs FRSample typically uses
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 openssl ca-certificates libstdc++6 zlib1g \
 && rm -rf /var/lib/apt/lists/*

# Parser binary
COPY --from=dji-build /usr/local/bin/FRSample /usr/local/bin/FRSample

# Server runtime (prod deps + dist)
WORKDIR /app
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/package.json ./package.json
COPY --from=server-build /app/dist ./dist

ENV NODE_ENV=production
# App key at RUNTIME (safer)
ENV SDK_KEY=
# Concurrency + timeout guardrails
ENV MAX_CONCURRENCY=2
ENV PARSE_TIMEOUT_MS=180000

EXPOSE 8080
CMD ["node","/app/dist/server.js"]
