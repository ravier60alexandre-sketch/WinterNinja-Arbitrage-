# HiP-3 Spread Analyzer

Real-time executable spread analyzer for Hyperliquid HiP-3 builder-deployed perpetual pairs. Monitors L2 orderbook data across XYZ, CASH, FLX, and KM deployers, computes taker arbitrage spreads, and serves a professional trading dashboard.

## Features

- **Auto-discovery**: Automatically detects all active HiP-3 pairs via the Hyperliquid REST API on every startup
- **Real-time spreads**: Connects to Hyperliquid's WebSocket for live L2 orderbook data
- **Two-direction analysis**: Computes spreads for both XYZ Short/B Long and XYZ Long/B Short
- **Rolling statistics**: Mean, median, P10, P90, standard deviation, edge frequency, and mean reversion score
- **Professional dashboard**: Dark-themed trading terminal UI with charts, distribution histograms, and interactive tools
- **Zero external dependencies**: Uses embedded SQLite — no database server needed

## Setup (Ubuntu 22.04 VPS)

### 1. Update your system

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js 20

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Verify the installation:

```bash
node --version   # Should show v20.x.x
npm --version    # Should show 10.x.x
```

### 3. Clone the repository

```bash
git clone <your-repo-url>
cd hyperliquid-spread-analyzer
```

### 4. Install dependencies

```bash
npm install
```

This will install all required packages including the WebSocket client, SQLite driver, and Next.js dashboard.

### 5. Start the analyzer

```bash
npm start
```

This single command:
1. Validates the configuration
2. Initializes the SQLite database
3. Auto-discovers active HiP-3 pairs from the Hyperliquid API
4. Connects to the Hyperliquid WebSocket and subscribes to orderbook feeds
5. Starts computing spreads and storing observations
6. Launches the web dashboard

### 6. Open the dashboard

Open your browser and navigate to:

```
http://<your-vps-ip>:3000
```

If running locally: `http://localhost:3000`

### 6b. Bot Engine Setup (Optional)

To enable automated trading bots:

```bash
cd backend
pip install -r requirements.txt
```

Copy `.env.bots` to `.env` and fill in your credentials:

```bash
cp .env.bots .env
```

The bot engine starts automatically with `npm start` if `backend/main.py` exists and credentials are configured.

## Production Deployment (Optional)

For running 24/7 on a VPS, use PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Useful PM2 commands:
- `pm2 logs hip3-monitor` — View live logs
- `pm2 restart hip3-monitor` — Restart the analyzer
- `pm2 stop hip3-monitor` — Stop the analyzer
- `pm2 monit` — Monitor resource usage

## Configuration

Edit `config.json` to customize:

- **pairs**: Add or remove trading pairs to monitor
- **min_executable_size**: Minimum size filter (default: 1.0 units)
- **fee_assumptions**: Adjust taker fees and slippage buffer
- **observation_throttle_ms**: How often to record observations (default: 500ms)
- **dashboard_port**: Change the web dashboard port (default: 3000)

New HiP-3 pairs listed on Hyperliquid are automatically discovered on every restart. You only need to manually edit `config.json` if you want to override labels or add pairs that the auto-discovery might miss.

## Dashboard Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Navigate between pairs |
| `1` – `5` | Switch time window (1h, 6h, 12h, 24h, 7d) |

## How It Works

The analyzer monitors L2 orderbook data for HiP-3 pairs and computes executable taker arbitrage spreads:

**Direction 1 (XYZ Short / B Long):**
```
spread = bestBid(XYZ) - bestAsk(B)
spread_bps = (spread / bestAsk(B)) × 10000
```

**Direction 2 (XYZ Long / B Short):**
```
spread = bestBid(B) - bestAsk(XYZ)
spread_bps = (spread / bestAsk(XYZ)) × 10000
```

Only top-of-book executable prices from the live L2 orderbook are used — no mark price, index price, or mid price.

## Data Storage

All data is stored in a single SQLite file at `data/spreads.db`:
- **Tick-level observations**: Kept for 48 hours, then downsampled to 1-minute OHLC
- **Rolling statistics**: Kept for 30 days
- Cleanup runs automatically on startup and every hour

## Troubleshooting

**Dashboard shows "Waiting for data..."**
- The collector needs a few seconds to establish the WebSocket connection and receive initial orderbook snapshots
- Check the terminal logs for any connection errors

**"Pair not found in live universe" warnings**
- This means a pair in config.json is no longer listed on Hyperliquid
- The pair will be skipped automatically — no action needed

**Port 3000 already in use**
- Change `dashboard_port` in `config.json` to another port (e.g., 3001)
