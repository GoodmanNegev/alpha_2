#!/usr/bin/env bash
# One-shot deployment for a small (1 CPU / 1 GB) Ubuntu/Debian server.
#
#   sudo ./deploy/deploy.sh docker   # (recommended) docker compose, game + leaderboard on :8001
#   sudo ./deploy/deploy.sh binary   # Go binary under systemd behind nginx (needs Go on the box or a prebuilt binary)
#   sudo ./deploy/deploy.sh static   # nginx only, no leaderboard — the smallest possible footprint
#
# Run it from the repository root.  Re-running is safe (idempotent-ish).
set -euo pipefail

MODE="${1:-docker}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MOTA_PORT:-8001}"

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "please run as root (sudo)"
[[ -f "$ROOT/index.html" ]] || die "run this script from the repository (index.html not found)"

apt_install() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "installing $2"
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$2"
  fi
}

copy_static() {
  local dest="$1"
  log "copying game files to $dest"
  mkdir -p "$dest"
  rm -rf "$dest/src" "$dest/css"
  cp -r "$ROOT/index.html" "$ROOT/css" "$ROOT/src" "$dest/"
}

install_nginx_site() {
  local api="$1"   # 1 = keep the /api/ proxy block, 0 = strip it
  apt_install nginx nginx
  local conf=/etc/nginx/sites-available/mota
  cp "$ROOT/deploy/nginx.conf" "$conf"
  if [[ "$api" == "0" ]]; then
    # drop the /api/ location for a pure static site
    sed -i '/location \/api\/ {/,/^    }/d' "$conf"
  fi
  ln -sf "$conf" /etc/nginx/sites-enabled/mota
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

case "$MODE" in
  docker)
    apt_install curl curl
    if ! command -v docker >/dev/null 2>&1; then
      log "installing docker (get.docker.com)"
      curl -fsSL https://get.docker.com | sh
    fi
    docker compose version >/dev/null 2>&1 || die "docker compose plugin missing (apt-get install docker-compose-plugin)"
    log "building image and starting container on port $PORT"
    cd "$ROOT"
    MOTA_PORT="$PORT" docker compose -p mota up -d --build
    log "waiting for health check"
    for _ in $(seq 1 20); do
      if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
        log "魔塔 is up: http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT/"
        exit 0
      fi
      sleep 1
    done
    die "container did not become healthy; check: docker compose logs"
    ;;

  binary)
    id -u mota >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mota
    mkdir -p /opt/mota/public /opt/mota/data
    if [[ -f "$ROOT/mota-server" ]]; then
      cp "$ROOT/mota-server" /opt/mota/mota-server
      chmod 755 /opt/mota/mota-server
    elif command -v go >/dev/null 2>&1; then
      log "building mota-server with $(go version | awk '{print $3}')"
      (cd "$ROOT/server" && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /opt/mota/mota-server .)
    else
      die "no ./mota-server binary and no Go toolchain; build one with: cd server && GOOS=linux go build -o ../mota-server ."
    fi
    copy_static /opt/mota/public
    chown -R mota:mota /opt/mota
    cp "$ROOT/deploy/mota.service" /etc/systemd/system/mota.service
    systemctl daemon-reload
    systemctl enable --now mota
    systemctl restart mota
    # nginx serves the files itself; keep a copy where the site config expects them
    copy_static /var/www/mota
    install_nginx_site 1
    log "魔塔 is up behind nginx on port 80 (API proxied to mota-server on 127.0.0.1:8001)"
    ;;

  static)
    copy_static /var/www/mota
    install_nginx_site 0
    log "魔塔 static site is up on port 80 (no leaderboard)"
    ;;

  *)
    die "unknown mode '$MODE' (docker | binary | static)"
    ;;
esac
