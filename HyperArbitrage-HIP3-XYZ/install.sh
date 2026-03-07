#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/HyperArbitrage-HIP3-XYZ"
SERVICE_NAME="hyperarbitrage"
APP_USER="hyperarb"

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }

if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

log_step "Step 1/15: Updating system packages"
apt-get update -qq
apt-get install -y -qq curl git ufw openssl python3 > /dev/null 2>&1
log_info "System packages installed"

log_step "Step 2/15: Installing Docker + Docker Compose"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    log_info "Docker installed"
else
    log_info "Docker already installed: $(docker --version)"
fi

if ! docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    log_info "Docker Compose installed"
else
    log_info "Docker Compose already installed: $(docker compose version)"
fi

log_step "Step 3/15: Configuring firewall (UFW)"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow 22/tcp > /dev/null 2>&1
ufw allow 80/tcp > /dev/null 2>&1
ufw allow 443/tcp > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1
log_info "UFW configured: ports 22, 80, 443 open"

log_step "Step 4/15: Creating application user"
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
    usermod -aG docker "$APP_USER"
    log_info "User '$APP_USER' created and added to docker group"
else
    usermod -aG docker "$APP_USER"
    log_info "User '$APP_USER' already exists, ensured docker group membership"
fi

log_step "Step 5/15: Setting up application directory"
if [ -d "$INSTALL_DIR" ]; then
    log_warn "Directory $INSTALL_DIR already exists"
else
    cp -r "$(dirname "$(readlink -f "$0")")" "$INSTALL_DIR"
    log_info "Application copied to $INSTALL_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR"

log_step "Step 6/15: Configuring environment variables"
cd "$INSTALL_DIR"
if [ ! -f .env ]; then
    cp .env.example .env

    read -rp "Enter PostgreSQL password: " pg_pass
    sed -i "s/<strong-password>/$pg_pass/g" .env
    sed -i "s/<password>/$pg_pass/g" .env

    read -rp "Enter Redis password: " redis_pass
    sed -i "s/<redis-password>/$redis_pass/g" .env

    APP_SECRET=$(openssl rand -hex 32)
    sed -i "s/<generate-256bit-random>/$APP_SECRET/g" .env

    read -rp "Enter your domain (e.g. arb.example.com): " domain
    sed -i "s/your-domain.com/$domain/g" .env

    read -rp "Enter SSL email: " ssl_email
    sed -i "s/admin@your-domain.com/$ssl_email/g" .env

    log_info ".env configured with your settings"
else
    log_info ".env already exists, skipping"
fi

log_step "Step 7/15: Generating Fernet master encryption key"
FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || echo "GENERATE_MANUALLY")
if [ "$FERNET_KEY" = "GENERATE_MANUALLY" ]; then
    log_warn "cryptography not installed on host. Install it or generate key manually."
    log_warn "Run: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
else
    sed -i "s|<fernet-key>|$FERNET_KEY|g" .env
    log_info "Fernet key generated and saved"
fi

log_step "Step 8/15: Generating RS256 JWT keypair"
mkdir -p "$INSTALL_DIR/secrets"
if [ ! -f "$INSTALL_DIR/secrets/jwt_rs256.pem" ]; then
    openssl genpkey -algorithm RSA -out "$INSTALL_DIR/secrets/jwt_rs256.pem" -pkeyopt rsa_keygen_bits:2048 2>/dev/null
    openssl rsa -pubout -in "$INSTALL_DIR/secrets/jwt_rs256.pem" -out "$INSTALL_DIR/secrets/jwt_rs256.pub" 2>/dev/null
    chmod 600 "$INSTALL_DIR/secrets/jwt_rs256.pem"
    chmod 644 "$INSTALL_DIR/secrets/jwt_rs256.pub"
    sed -i "s|/secrets/jwt_rs256.pem|$INSTALL_DIR/secrets/jwt_rs256.pem|g" .env
    sed -i "s|/secrets/jwt_rs256.pub|$INSTALL_DIR/secrets/jwt_rs256.pub|g" .env
    log_info "RS256 keypair generated"
else
    log_info "JWT keypair already exists"
fi

log_step "Step 9/15: Building Docker images"
docker compose build --no-cache
log_info "Docker images built"

log_step "Step 10/15: Starting services"
docker compose up -d
log_info "Services starting..."

log_step "Step 11/15: Waiting for healthchecks"
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    PG_HEALTHY=$(docker compose ps postgres --format '{{.Health}}' 2>/dev/null || echo "unknown")
    REDIS_HEALTHY=$(docker compose ps redis --format '{{.Health}}' 2>/dev/null || echo "unknown")

    if [ "$PG_HEALTHY" = "healthy" ] && [ "$REDIS_HEALTHY" = "healthy" ]; then
        log_info "PostgreSQL and Redis are healthy"
        break
    fi

    echo -ne "\r  Waiting... ${ELAPSED}s / ${TIMEOUT}s (pg: $PG_HEALTHY, redis: $REDIS_HEALTHY)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    log_error "Healthcheck timeout after ${TIMEOUT}s. Check: docker compose logs"
    exit 1
fi

log_step "Step 12/15: Running database migrations"
docker compose exec -T backend alembic upgrade head
log_info "Migrations complete"

log_step "Step 13/15: Installing systemd service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << SERVICEEOF
[Unit]
Description=HyperArbitrage HIP-3 XYZ
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=${APP_USER}
Group=docker
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SERVICEEOF
log_info "Systemd service created"

log_step "Step 14/15: Enabling auto-start"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl start "${SERVICE_NAME}.service"
log_info "Service enabled and started"

log_step "Step 15/15: Installation complete!"
DOMAIN=$(grep "^DOMAIN=" .env | cut -d= -f2)
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  HyperArbitrage HIP-3 XYZ — Installed!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Dashboard:  ${CYAN}https://${DOMAIN}${NC}"
echo -e "  API:        ${CYAN}https://${DOMAIN}/api/v1${NC}"
echo -e "  Install dir: ${INSTALL_DIR}"
echo ""
echo -e "  ${YELLOW}Post-install steps:${NC}"
echo -e "  1. Configure bot API keys in .env"
echo -e "  2. Set up SSL: certbot certonly --standalone -d ${DOMAIN}"
echo -e "  3. Restart: docker compose restart nginx"
echo -e "  4. Monitor: docker compose logs -f backend"
echo ""
