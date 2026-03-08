#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════
# HyperArbitrage HIP-3 XYZ — Production Installer
# Target: Ubuntu 22.04 LTS
# ═══════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/HyperArbitrage-HIP3-XYZ"
SERVICE_NAME="hyperarbitrage"
APP_USER="hyperarb"
REPO_URL="https://github.com/WinterNinja/HyperArbitrage-HIP3-XYZ.git"

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Installation failed at step with exit code $exit_code"
        log_error "Check the output above for details. Partial install may exist at $INSTALL_DIR"
        log_error "To retry: sudo bash $0"
    fi
}
trap cleanup EXIT

if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   HyperArbitrage HIP-3 XYZ — Installer      ║"
echo "  ║   Target: Ubuntu 22.04 LTS                   ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Step 1/15: System packages ───────────────────
log_step "Step 1/15: Updating system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq > /dev/null 2>&1
apt-get install -y -qq \
    curl \
    git \
    ufw \
    openssl \
    python3 \
    python3-pip \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common > /dev/null 2>&1
log_info "System packages installed"

# ─── Step 2/15: Docker + Docker Compose ───────────
log_step "Step 2/15: Installing Docker + Docker Compose"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log_info "Docker installed and started"
else
    log_info "Docker already installed: $(docker --version)"
fi

if ! docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    log_info "Docker Compose installed: $(docker compose version)"
else
    log_info "Docker Compose already installed: $(docker compose version)"
fi

# ─── Step 3/15: Firewall ──────────────────────────
log_step "Step 3/15: Configuring firewall (UFW)"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow 22/tcp comment "SSH" > /dev/null 2>&1
ufw allow 80/tcp comment "HTTP" > /dev/null 2>&1
ufw allow 443/tcp comment "HTTPS" > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1
log_info "UFW configured: ports 22, 80, 443 open"

# ─── Step 4/15: Application user ──────────────────
log_step "Step 4/15: Creating application user"
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
    usermod -aG docker "$APP_USER"
    log_info "User '$APP_USER' created and added to docker group"
else
    usermod -aG docker "$APP_USER"
    log_info "User '$APP_USER' already exists, ensured docker group membership"
fi

# ─── Step 5/15: Clone / copy application ──────────
log_step "Step 5/15: Setting up application directory"
if [ -d "$INSTALL_DIR" ]; then
    log_warn "Directory $INSTALL_DIR already exists, updating..."
    cd "$INSTALL_DIR"
    if [ -d .git ]; then
        git pull --ff-only || log_warn "Git pull failed, using existing files"
    fi
else
    SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
    if [ -d "$SCRIPT_DIR/.git" ]; then
        cp -r "$SCRIPT_DIR" "$INSTALL_DIR"
        log_info "Application copied from $SCRIPT_DIR to $INSTALL_DIR"
    else
        git clone "$REPO_URL" "$INSTALL_DIR"
        log_info "Application cloned to $INSTALL_DIR"
    fi
fi
chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR"
mkdir -p /var/log/hyperarbitrage
chown -R "$APP_USER":"$APP_USER" /var/log/hyperarbitrage
log_info "Application directory ready at $INSTALL_DIR"

# ─── Step 6/15: Interactive .env configuration ────
log_step "Step 6/15: Configuring environment variables"
cd "$INSTALL_DIR"
if [ ! -f .env ]; then
    cp .env.example .env

    echo ""
    echo -e "${BOLD}Please provide the following configuration values:${NC}"
    echo ""

    read -rsp "  PostgreSQL password: " pg_pass
    echo ""
    if [ -z "$pg_pass" ]; then
        pg_pass=$(openssl rand -hex 24)
        log_info "Generated random PostgreSQL password"
    fi
    sed -i "s/<strong-password>/$pg_pass/g" .env
    sed -i "s/<password>/$pg_pass/g" .env

    read -rsp "  Redis password: " redis_pass
    echo ""
    if [ -z "$redis_pass" ]; then
        redis_pass=$(openssl rand -hex 24)
        log_info "Generated random Redis password"
    fi
    sed -i "s/<redis-password>/$redis_pass/g" .env

    APP_SECRET=$(openssl rand -hex 32)
    sed -i "s/<generate-256bit-random>/$APP_SECRET/g" .env

    read -rp "  Domain (e.g. arb.example.com): " domain
    if [ -z "$domain" ]; then
        log_error "Domain is required"
        exit 1
    fi
    sed -i "s/your-domain.com/$domain/g" .env

    read -rp "  SSL certificate email: " ssl_email
    if [ -z "$ssl_email" ]; then
        ssl_email="admin@${domain}"
        log_info "Using default SSL email: $ssl_email"
    fi
    sed -i "s/admin@your-domain.com/$ssl_email/g" .env

    chmod 600 .env
    chown "$APP_USER":"$APP_USER" .env
    log_info ".env configured with your settings"
else
    log_info ".env already exists, skipping configuration"
fi

# ─── Step 7/15: Fernet encryption key ─────────────
log_step "Step 7/15: Generating Fernet master encryption key"
if grep -q '<fernet-key>' .env 2>/dev/null; then
    pip3 install -q cryptography > /dev/null 2>&1 || true
    FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || echo "")
    if [ -z "$FERNET_KEY" ]; then
        log_error "Failed to generate Fernet key. Ensure python3 and cryptography are installed."
        log_error "Run: pip3 install cryptography"
        log_error "Then: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        log_error "Update MASTER_ENCRYPTION_KEY in .env manually."
        exit 1
    fi
    sed -i "s|<fernet-key>|$FERNET_KEY|g" .env
    log_info "Fernet master encryption key generated and saved"
else
    log_info "Fernet key already configured"
fi

# ─── Step 8/15: RS256 JWT keypair ─────────────────
log_step "Step 8/15: Generating RS256 JWT keypair"
mkdir -p "$INSTALL_DIR/secrets"
if [ ! -f "$INSTALL_DIR/secrets/jwt_rs256.pem" ]; then
    openssl genpkey -algorithm RSA \
        -out "$INSTALL_DIR/secrets/jwt_rs256.pem" \
        -pkeyopt rsa_keygen_bits:2048 2>/dev/null
    openssl rsa -pubout \
        -in "$INSTALL_DIR/secrets/jwt_rs256.pem" \
        -out "$INSTALL_DIR/secrets/jwt_rs256.pub" 2>/dev/null
    chmod 600 "$INSTALL_DIR/secrets/jwt_rs256.pem"
    chmod 644 "$INSTALL_DIR/secrets/jwt_rs256.pub"
    chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR/secrets"
    sed -i "s|/secrets/jwt_rs256.pem|$INSTALL_DIR/secrets/jwt_rs256.pem|g" .env
    sed -i "s|/secrets/jwt_rs256.pub|$INSTALL_DIR/secrets/jwt_rs256.pub|g" .env
    log_info "RS256 keypair generated at $INSTALL_DIR/secrets/"
else
    log_info "JWT keypair already exists, skipping"
fi

# ─── Step 9/15: Docker build ──────────────────────
log_step "Step 9/15: Building Docker images"
cd "$INSTALL_DIR"
docker compose build --no-cache
log_info "Docker images built successfully"

# ─── Step 10/15: Start services ───────────────────
log_step "Step 10/15: Starting services"
docker compose up -d
log_info "All services starting..."

# ─── Step 11/15: Healthcheck wait ─────────────────
log_step "Step 11/15: Waiting for healthchecks (max 120s)"
TIMEOUT=120
ELAPSED=0
ALL_HEALTHY=false
while [ $ELAPSED -lt $TIMEOUT ]; do
    PG_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' hyperarb-postgres 2>/dev/null || echo "starting")
    REDIS_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' hyperarb-redis 2>/dev/null || echo "starting")
    BACKEND_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' hyperarb-backend 2>/dev/null || echo "starting")

    echo -ne "\r  Waiting... ${ELAPSED}s/${TIMEOUT}s  pg:${PG_HEALTH}  redis:${REDIS_HEALTH}  backend:${BACKEND_HEALTH}    "

    if [ "$PG_HEALTH" = "healthy" ] && [ "$REDIS_HEALTH" = "healthy" ] && [ "$BACKEND_HEALTH" = "healthy" ]; then
        ALL_HEALTHY=true
        echo ""
        log_info "All core services are healthy"
        break
    fi

    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

if [ "$ALL_HEALTHY" = false ]; then
    echo ""
    log_error "Healthcheck timeout after ${TIMEOUT}s"
    log_error "Service status:"
    docker compose ps
    log_error "Check logs with: cd $INSTALL_DIR && docker compose logs"
    exit 1
fi

# ─── Step 12/15: Database migrations ──────────────
log_step "Step 12/15: Running database migrations"
docker compose exec -T backend alembic upgrade head
log_info "Database migrations complete"

# ─── Step 13/15: Systemd service ──────────────────
log_step "Step 13/15: Installing systemd service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << SERVICEEOF
[Unit]
Description=HyperArbitrage HIP-3 XYZ Arbitrage Platform
Documentation=https://github.com/WinterNinja/HyperArbitrage-HIP3-XYZ
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStartPre=/usr/bin/docker compose pull --quiet
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
User=${APP_USER}
Group=docker
TimeoutStartSec=300
TimeoutStopSec=120
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
SERVICEEOF
log_info "Systemd service file created at /etc/systemd/system/${SERVICE_NAME}.service"

# ─── Step 14/15: Enable + start service ───────────
log_step "Step 14/15: Enabling and starting systemd service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl start "${SERVICE_NAME}.service"
log_info "Service '${SERVICE_NAME}' enabled and started"

# ─── Step 15/15: Summary ──────────────────────────
log_step "Step 15/15: Installation complete!"
DOMAIN=$(grep "^DOMAIN=" "$INSTALL_DIR/.env" | cut -d= -f2)
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║   HyperArbitrage HIP-3 XYZ — Installed!         ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Service Status:${NC}"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
echo ""
echo -e "  ${BOLD}Endpoints:${NC}"
echo -e "    Dashboard:   ${CYAN}https://${DOMAIN}${NC}"
echo -e "    API:         ${CYAN}https://${DOMAIN}/api/v1${NC}"
echo -e "    Health:      ${CYAN}https://${DOMAIN}/health${NC}"
echo ""
echo -e "  ${BOLD}Paths:${NC}"
echo -e "    Install dir: ${INSTALL_DIR}"
echo -e "    Logs:        /var/log/hyperarbitrage/"
echo -e "    Secrets:     ${INSTALL_DIR}/secrets/"
echo -e "    Env file:    ${INSTALL_DIR}/.env"
echo ""
echo -e "  ${YELLOW}Post-install steps:${NC}"
echo -e "    1. Configure bot wallet addresses and API keys in .env"
echo -e "    2. Obtain SSL certificate:"
echo -e "       ${CYAN}certbot certonly --standalone -d ${DOMAIN} --email $(grep '^SSL_EMAIL=' "$INSTALL_DIR/.env" | cut -d= -f2)${NC}"
echo -e "    3. Restart nginx: ${CYAN}cd $INSTALL_DIR && docker compose restart nginx${NC}"
echo -e "    4. Monitor logs:  ${CYAN}cd $INSTALL_DIR && docker compose logs -f backend${NC}"
echo -e "    5. Check status:  ${CYAN}systemctl status ${SERVICE_NAME}${NC}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    Stop:    ${CYAN}systemctl stop ${SERVICE_NAME}${NC}"
echo -e "    Start:   ${CYAN}systemctl start ${SERVICE_NAME}${NC}"
echo -e "    Restart: ${CYAN}systemctl restart ${SERVICE_NAME}${NC}"
echo -e "    Logs:    ${CYAN}cd $INSTALL_DIR && docker compose logs -f${NC}"
echo ""
