# HIP3 Arbitrage Bot — VPS Deployment Guide

## Prerequisites

- VPS with Ubuntu 22.04+ (or Debian 12+)
- Node.js 20+ 
- PostgreSQL 14+
- At least 1GB RAM, 10GB disk

## Quick Start

### 1. Transfer files to VPS

```bash
# From Replit, export data first
./deploy.sh export-data

# Copy project to VPS
scp -r . user@your-vps:/opt/hip3-arb/
```

### 2. Run setup on VPS

```bash
ssh user@your-vps
cd /opt/hip3-arb
chmod +x deploy.sh
./deploy.sh setup
```

The script will:
- Check/install Node.js 20
- Create `.env` (edit with your credentials on first run)
- Install npm dependencies
- Set up PostgreSQL tables
- Create data directories
- Install PM2
- Create systemd service

### 3. Configure environment

Edit `.env` with your credentials:

```bash
nano .env
```

Required variables:
```
DATABASE_URL=postgresql://user:password@localhost:5432/hip3_arb
HL_PRIVATE_KEY=your_hyperliquid_private_key
HL_WALLET_ADDRESS=your_wallet_address
PORT=5000
```

### 4. Start the bot

**Option A — PM2 (recommended):**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # auto-start on reboot
```

**Option B — systemd:**
```bash
sudo systemctl start hip3-arb
sudo systemctl status hip3-arb
```

**Option C — Direct:**
```bash
source .env && node src/index.js
```

## Data Migration

### Export from Replit

```bash
# Export all CSV + DB data
./deploy.sh export-data

# Or use the HTTP endpoint
curl http://localhost:5000/export > full_export.json
```

### Import on VPS

```bash
# After copying data/export/ to VPS
./deploy.sh import-data
```

### Export Endpoints

| Endpoint | Description |
|---|---|
| `GET /export` | Full JSON export (config + CSV files + DB tables) |
| `GET /export/csv/:filename` | Download a specific CSV file |
| `GET /export/db/:table` | Export a DB table (JSON or CSV with `?format=csv`) |
| `GET /bot/edge-export.csv` | Edge snapshots as CSV |

Available DB tables: `edge_snapshots`, `repeg_cycles`, `bot_trades`, `bot_config`

## Deployment Commands

```bash
./deploy.sh setup        # Full first-time setup
./deploy.sh update       # Update code + restart service
./deploy.sh export-data  # Export all data to data/export/
./deploy.sh import-data  # Import data from data/export/
./deploy.sh status       # Check service status
```

## PostgreSQL Setup

If PostgreSQL is not installed:

```bash
sudo apt-get install -y postgresql postgresql-client
sudo -u postgres createuser hip3user -P
sudo -u postgres createdb hip3_arb -O hip3user
```

Then set `DATABASE_URL=postgresql://hip3user:yourpassword@localhost:5432/hip3_arb`

## Firewall

```bash
# Allow the app port
sudo ufw allow 5000/tcp

# Or use nginx as reverse proxy (recommended)
sudo apt-get install -y nginx
```

## Monitoring

```bash
# PM2 monitoring
pm2 monit
pm2 logs hip3-arb

# systemd logs
journalctl -u hip3-arb -f

# Health check
curl http://localhost:5000/health
```

## Updating

```bash
cd /opt/hip3-arb
# Copy new files from Replit or git pull
./deploy.sh update
```
