#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="/opt/ttkmap"

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

command -v ssh >/dev/null || die "ssh is required"
command -v tar >/dev/null || die "tar is required"

read -r -p "VPS address (IP or DNS name): " VPS_HOST
[[ -n "$VPS_HOST" ]] || die "VPS address is required"
read -r -p "SSH user [root]: " VPS_USER
VPS_USER="${VPS_USER:-root}"

read -r -p "SSH private key/certificate path (leave empty for password): " SSH_KEY
SSH_AUTH=()
if [[ -n "$SSH_KEY" ]]; then
  [[ -f "$SSH_KEY" ]] || die "SSH key was not found: $SSH_KEY"
else
  command -v sshpass >/dev/null || die "Install sshpass or provide an SSH key"
  read -r -s -p "SSH password: " SSHPASS
  printf '\n'
  export SSHPASS
  SSH_AUTH=(sshpass -e)
fi

SSH_BASE=("${SSH_AUTH[@]}" ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "$SSH_KEY" ]]; then
  SSH_BASE+=( -i "$SSH_KEY" )
fi
REMOTE="$VPS_USER@$VPS_HOST"

run_remote() {
  "${SSH_BASE[@]}" "$REMOTE" "$@"
}

run_remote 'printf "SSH connection established on %s\\n" "$(hostname)"'

read -r -p "Domain or A record (leave empty for HTTP on the VPS address): " DOMAIN
if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  die "Use a plain domain name without a scheme or path"
fi
read -r -p "Certificate email (required when a domain is set): " CERT_EMAIL
if [[ -n "$DOMAIN" && -z "$CERT_EMAIL" ]]; then
  die "Certificate email is required for Let's Encrypt"
fi

if [[ -n "$DOMAIN" ]]; then
  APP_ORIGIN="https://$DOMAIN"
  COOKIE_SECURE=true
else
  APP_ORIGIN="http://$VPS_HOST"
  COOKIE_SECURE=false
fi

read -r -p "First organizer email: " ORGANIZER_EMAIL
[[ "$ORGANIZER_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "A valid organizer email is required"
read -r -s -p "First organizer password (12-128 characters): " ORGANIZER_PASSWORD
printf '\n'
(( ${#ORGANIZER_PASSWORD} >= 12 && ${#ORGANIZER_PASSWORD} <= 128 )) || die "Organizer password must contain 12-128 characters"

printf 'Installing Docker, Compose and nginx on %s...\n' "$REMOTE"
"${SSH_BASE[@]}" "$REMOTE" bash -s -- "$REMOTE_DIR" <<'REMOTE_SETUP'
set -Eeuo pipefail
APP_DIR="$1"
as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo -n "$@"
  fi
}
if [[ "$(id -u)" -ne 0 ]] && ! command -v sudo >/dev/null; then
  echo "The SSH user must be root or have sudo" >&2
  exit 1
fi
if [[ "$(id -u)" -ne 0 ]] && ! sudo -n true; then
  echo "The SSH user needs passwordless sudo for non-interactive deployment" >&2
  exit 1
fi
as_root apt-get update
as_root apt-get install -y ca-certificates curl nginx
if ! command -v docker >/dev/null; then
  as_root apt-get install -y docker.io
fi
as_root systemctl enable --now docker
if ! docker compose version >/dev/null 2>&1; then
  as_root apt-get install -y docker-compose-plugin 2>/dev/null || as_root apt-get install -y docker-compose-v2
fi
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is unavailable" >&2; exit 1; }
as_root install -d -m 0755 "$APP_DIR"
REMOTE_SETUP

printf 'Uploading application files...\n'
tar -czf - \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./backups' \
  --exclude='./data' \
  --exclude='./photos' \
  --exclude='./Update Design' \
  --exclude='./.agents' \
  --exclude='./.codex' \
  --exclude='./.aws' \
  --exclude='./.vibeteam' \
  --exclude='./backend/.pytest_cache' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='./android/.idea' \
  --exclude='./android/app/.idea' \
  --exclude='./android/.gradle' \
  --exclude='./android/app/.gradle' \
  --exclude='./android/build' \
  --exclude='./android/app/build' \
  --exclude='./frontend/node_modules' \
  --exclude='./frontend/dist' \
  -C "$ROOT_DIR" . | "${SSH_BASE[@]}" "$REMOTE" "APP_DIR='$REMOTE_DIR'; TMP=\$(mktemp); cat > \"\$TMP\"; if [ \$(id -u) -eq 0 ]; then install -d -m 0755 \"\$APP_DIR\"; tar -xzf \"\$TMP\" -C \"\$APP_DIR\"; else sudo -n install -d -m 0755 \"\$APP_DIR\"; sudo -n tar -xzf \"\$TMP\" -C \"\$APP_DIR\"; fi; rm -f \"\$TMP\""

ENV_CONTENT="APP_ORIGIN=$APP_ORIGIN
COOKIE_SECURE=$COOKIE_SECURE
DATABASE_PATH=/data/ttkmap.sqlite
MEDIA_PATH=/data/media
STITCH_DEADLINE_SECONDS=900
STITCH_THREADS=2"
printf '%s\n' "$ENV_CONTENT" | "${SSH_BASE[@]}" "$REMOTE" "APP_DIR='$REMOTE_DIR'; TMP=\$(mktemp); cat > \"\$TMP\"; if [ \$(id -u) -eq 0 ]; then install -m 0600 \"\$TMP\" \"\$APP_DIR/.env\"; else sudo -n install -m 0600 \"\$TMP\" \"\$APP_DIR/.env\"; fi; rm -f \"\$TMP\""

printf 'Building and starting TTKMap...\n'
run_remote "cd '$REMOTE_DIR' && docker compose build && docker compose run --rm api python -m backend.app.cli init-db && docker compose up -d api worker"

printf '%s\n' "$ORGANIZER_PASSWORD" | run_remote "cd '$REMOTE_DIR' && docker compose run --rm -T api python -m backend.app.cli create-organizer --email '$ORGANIZER_EMAIL'"

printf 'Configuring nginx...\n'
"${SSH_BASE[@]}" "$REMOTE" bash -s -- "$REMOTE_DIR" "$DOMAIN" "$CERT_EMAIL" <<'REMOTE_NGINX'
set -Eeuo pipefail
APP_DIR="$1"
DOMAIN="$2"
CERT_EMAIL="$3"
if [[ "$(id -u)" -eq 0 ]]; then SUDO=; else SUDO=sudo; fi
if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="$DOMAIN"
else
  SERVER_NAME="_"
fi
$SUDO tee /tmp/ttkmap.nginx >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
$SUDO install -m 0644 /tmp/ttkmap.nginx /etc/nginx/sites-available/ttkmap
$SUDO ln -sfn /etc/nginx/sites-available/ttkmap /etc/nginx/sites-enabled/ttkmap
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t
$SUDO systemctl enable --now nginx
$SUDO systemctl reload nginx
if [[ -n "$DOMAIN" ]]; then
  $SUDO apt-get install -y certbot python3-certbot-nginx
  $SUDO certbot --nginx --non-interactive --agree-tos --redirect --email "$CERT_EMAIL" -d "$DOMAIN"
fi
REMOTE_NGINX

printf '\nTTKMap is running at %s\n' "$APP_ORIGIN"
