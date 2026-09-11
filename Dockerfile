# syntax=docker/dockerfile:1
# 魔塔 24层 网页版 — single tiny image: static game + Go leaderboard server.
# Build off-server when the target has only 1 CPU / 1 GB RAM.

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY server/go.mod ./server/
RUN --mount=type=cache,target=/go/pkg/mod cd server && go mod download
COPY server/ ./server/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    cd server && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/mota-server .

FROM alpine:3.20 AS runtime
RUN addgroup -S mota && adduser -S -G mota -H mota \
    && apk add --no-cache ca-certificates wget \
    && mkdir -p /app/public /app/data && chown -R mota:mota /app
WORKDIR /app
COPY --from=build /out/mota-server /app/mota-server
COPY --chown=mota:mota index.html /app/public/
COPY --chown=mota:mota css/ /app/public/css/
COPY --chown=mota:mota src/ /app/public/src/
USER mota
ENV MOTA_ADDR=:8001 MOTA_STATIC=/app/public MOTA_DATA=/app/data/leaderboard.json MOTA_TRUST_PROXY=0
EXPOSE 8001
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8001/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/mota-server"]
