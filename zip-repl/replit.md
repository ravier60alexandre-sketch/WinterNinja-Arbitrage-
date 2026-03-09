# Market-Arbitrage-Hub

## Overview
HFT (High-Frequency Trading) arbitrage bot for Hyperliquid DEX. Monitors price discrepancies between HIP3 deployer pairs and executes delta-neutral arbitrage trades using a VWAP-averaged position model with liquidity-driven sizing.

## Architecture
- **Backend**: Node.js + Express (port 5000)
- **Frontend**: Vanilla JS + HTML/CSS with Chart.js (glassmorphism theme)
- **Database**: PostgreSQL (Replit built-in)
- **Trading**: Hyperliquid SDK + ethers.js
- **WebSocket**: 9 pooled connections monitoring 51 coins across 30 pairs (shared read-only pool)
- **Engines**: 6 fully isolated execution engines, each with own API client, wallet, signing key, and execution pipeline

## Execution Model (VWAP Position System)

### Position Model
- **One position per pair per bot** — fills accumulate into a single VWAP-averaged position
- `positions` table stores: pair_id, direction, size, vwap_entry_a, vwap_entry_b, avg_slippage_bps, total_fills, fees_usd, realized_pnl_usd
- `position_fills` table logs every individual fill for audit (entry, partial_close, full_close, orphan_unwind)
- In-memory `_positions` Map (pair_id → position object) loaded from DB on startup

### Entry (Liquidity-Driven Sizing)
- Same Z-score/OU/EWMA/Kalman signal system for entries
- **Sizing from 1st tick (top-of-book)**: `entrySize = min(asks[0].sz on A, bids[0].sz on B)` in base units
- Floor: $10 notional minimum. Cap: `maxPositionUsd` (configurable, default 500) minus current position size
- Execution via `placeBulkOrderNative` IOC orders. Limit price = best book price ± **8bps max slippage**
- Direction conflict guard: if existing position dir=1 and signal dir=2 → blocked
- On one-leg fail → orphan unwind (reverse the filled leg)

### Exit (BE-Based Close)
- Single close loop (`_checkPositionClose`) replaces all 7 old close mechanisms
- **Close trigger**: `spreadPnlBps >= feesRT + closeBufferBps`
  - `spreadPnlBps` = current spread profit vs VWAP entries (entry slippage already baked into VWAPs)
  - `feesRT` = round-trip fees (growth-aware per pair, auto-calculated, not user-editable)
  - `closeBufferBps` = configurable margin above breakeven (default 1.5bps, user-editable)
- **Close sizing**: 1st tick exit-side liquidity. Partial close if position > available liquidity
- **Max slippage 8bps** on close (limit price = best book ± 8bps)
- **Max loss safety**: If `spreadPnlBps < -maxLossBps` → force close at market

### Config Parameters
- `maxPositionUsd` — cap per pair position (replaces old fixed `positionSizeUsd`)
- `closeBufferBps` — BE close buffer (default 1bps)
- `maxLossBps` — max loss stop-loss threshold (default 50bps)
- `maxGlobalPositions` — max concurrent open positions
- `maxLeverage` — leverage limit
- `zThreshold`, `bufferBps`, `slippageMarginBps`, `dataTimer`, `zMeanRevert` — signal filters (unchanged)
- `tiersEnabled` — toggle pair-tier filtering on/off (default true)
- Per-pair overrides: `pairZThresholds` and `pairBufferBps` maps (pairId → value); zero value = use global default; set via `POST /bot/pair-overrides { pairId, zThreshold?, bufferBps? }`

## 6-Bot Deployer-Isolated Architecture

| Bot | Tab | Deployer | Direction | Pairs | Key Env Var (new / legacy) |
|-----|-----|----------|-----------|-------|----------------------------|
| bot1 | XYZ Short | FLX | xyz_short | 9 flx-xyz pairs | BOT1_PRIVATE_KEY / HL_PRIVATE_KEY |
| bot2 | XYZ Short | KM | xyz_short | 10 km-xyz pairs | BOT2_PRIVATE_KEY / HL_PRIVATE_KEY_2 |
| bot3 | XYZ Short | CASH | xyz_short | 11 cash-xyz pairs | BOT3_PRIVATE_KEY / HL_PRIVATE_KEY_3 |
| bot4 | XYZ Long | FLX | xyz_long | 9 flx-xyz pairs | BOT4_PRIVATE_KEY / HL_PRIVATE_KEY_4 |
| bot5 | XYZ Long | KM | xyz_long | 10 km-xyz pairs | BOT5_PRIVATE_KEY / HL_PRIVATE_KEY_5 |
| bot6 | XYZ Long | CASH | xyz_long | 11 cash-xyz pairs | BOT6_PRIVATE_KEY / HL_PRIVATE_KEY_6 |

### Isolation Guarantees
- Each bot has its own API client instance (HyperliquidAPI), wallet, and signing key
- No shared request queues — each bot's orders are sent independently
- No shared rate limits between bots (separate wallets = separate HL rate limit buckets)
- Signal routing: deterministic deployer+direction → bot mapping (no cross-deployer routing possible)
- Crash isolation: each bot's execution loop has independent try/catch; one bot's failure leaves others running
- WebSocket market data is shared (read-only) for efficiency
- Console logs identify source bot: `[bot1] ENTRY...`, `[HL_API:bot2] Set leverage...`
- Graceful degradation: bot2-bot6 are optional (skip init when keys absent)

## Project Structure
```
Market-Arbitrage-Hub/
├── src/
│   ├── index.js          # Server entry, routes, supervisor, bot registry
│   ├── botRoutes.js      # Generic bot route generator (registerGenericBotRoutes)
│   ├── arb.js            # Trading strategy (VWAP, Z-Score, Kalman)
│   ├── execution.js      # Position execution engine (per-bot instance)
│   ├── db.js             # PostgreSQL data layer (withTransaction support)
│   ├── hl_api.js         # Hyperliquid API wrapper (multi-instance)
│   ├── hl_ws.js          # WebSocket pool manager
│   ├── store.js          # In-memory data store (capped RollingStats)
│   ├── backtest.js       # Backtesting engine
│   └── tz.js             # Timezone utilities
├── public/
│   ├── index.html        # Main dashboard HTML (2 tabs: XYZ Short / XYZ Long)
│   ├── botPanelTemplate.js # Bot panel HTML generator + BOT_PANEL_REGISTRY
│   ├── app.js            # Frontend JS (6-bot polling, rendering, controls)
│   └── styles.css        # Styles (glassmorphism theme)
├── config.json           # Bot configuration (pairs, fees, thresholds)
├── ecosystem.config.js   # PM2 deployment config
├── .env.example          # Environment variable template
├── setup-db.sql          # Database schema
└── package.json
```

## Database Tables
- `positions` — Active/flat positions per pair per bot (VWAP entries, size, slippage, fills, PnL)
- `position_fills` — Audit trail of every individual fill (entry/close/orphan_unwind)
- `bot_trades` — Legacy trade execution records (historical, read-only)
- `bot_config` — Key-value configuration store
- `edge_snapshots` — Historical edge/spread data
- `repeg_cycles` — Detected repeg cycle records
- `bot_activity_log` — Activity log

## Key API Routes
- `/supervisor/status` — Combined status across all 6 bots (routing stats, per-bot PnL)
- `/supervisor/deployer-stats` — Per-deployer volume, fees, trades, PnL
- `/supervisor/pair-analytics` — Pair-level analytics
- `/supervisor/restart` — Restart all engines
- `/bot/*` — Bot1 (FLX Short) routes
- `/bot2/*` through `/bot6/*` — Bot2-6 routes
- Each bot has: `status`, `start`, `stop`, `config`, `positions`, `fills`, `trades` (legacy), `activity`, `pair`, `hedge-status`, `force-close-pair/:pairId`, `force-close-all`, `reset`, `api-key`, `wallet/balances`, `ping`, `slippage-stats`
- Routes generated by `registerGenericBotRoutes()` in botRoutes.js

## Frontend Architecture
- **BOT_PANEL_REGISTRY** (botPanelTemplate.js): Maps UI prefixes (xsFlx, xsKm, xsCash, xlFlx, xlKm, xlCash) to bot API prefixes (bot, bot2-bot6), deployer, direction
- **initBotPanels()**: Generates HTML for all 6 bot panels into sbShortGrid / sbLongGrid containers
- **pollSuperBot()**: Single polling loop iterates BOT_PANEL_REGISTRY, fetches all bots in parallel
- **Position tables**: Open Positions (pair, dir, size, VWAP, slip, PnL, fills, hold time), Recent Fills, Legacy Trades
- **Config panel**: MaxPosUsd, MaxLossBps, CloseBuffer, MaxGlobal, MaxLev, StopLoss, Z-Score controls, ZMR toggle
- **Combined stats**: Aggregated across all 6 bots (open positions, PnL, fees, funding, volume)
- Config dirty flag (`_sbUserDirty`) prevents poll from overwriting user-modified form values

## Required Environment Variables
Both naming conventions are supported (new format preferred, legacy for backward compatibility):

| Purpose | New Format | Legacy Format |
|---------|-----------|---------------|
| Bot1 private key (required) | `BOT1_PRIVATE_KEY` | `HL_PRIVATE_KEY` |
| Bot2-6 private keys (optional) | `BOT2_PRIVATE_KEY` ... `BOT6_PRIVATE_KEY` | `HL_PRIVATE_KEY_2` ... `HL_PRIVATE_KEY_6` |
| Wallet addresses (recommended) | `BOT1_WALLET_ADDRESS` ... `BOT6_WALLET_ADDRESS` | `HL_WALLET_ADDRESS` ... `HL_WALLET_ADDRESS_6` |
| Vault/sub-account (optional) | `BOT1_VAULT_ADDRESS` ... `BOT6_VAULT_ADDRESS` | `HL_VAULT_ADDRESS` ... `HL_VAULT_ADDRESS_6` |

Note: Hyperliquid uses private key signing — there is no separate API key. The `BOTn_PRIVATE_KEY` serves as both the signing key and API credential.

Other env vars:
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `PORT` — Server port (defaults to 5000)
- `ALERT_WEBHOOK_URL` — Discord/Slack webhook for alerts (optional)
- `EDGE_RETENTION_DAYS` — Days to keep edge snapshots (default 21)

## Workflow
- **Start application**: `cd Market-Arbitrage-Hub && node src/index.js`

## Fee Tiers
- Growth pairs: 1.8bps round-trip
- Non-growth pairs: 6bps round-trip
- Mixed pairs: 3.9bps round-trip
- Auto-detected via on-chain fee tier query every 5 min

## Production Hardening
- **DB Transactions**: `withTransaction()` helper in db.js wraps critical position state changes
- **Awaited DB writes**: Position updates awaited; `flushPendingDbWrites()` on shutdown
- **Orphan persistence**: `_orphanOnChainSeen` saved to DB via bot_config, restored on startup
- **Error logging**: All `.catch(() => {})` replaced with descriptive error logging
- **No hardcoded wallets**: Uses env vars with warnings
- **Memory safety**: RollingStats capped at 10000 samples
- **Graceful shutdown**: Flushes pending DB writes before pool.end(), 5s timeout

## Partial Fill Handling & Reconciliation
- **Entry partial fill**: Uses actual `fillSz` from API response (not requested `roundedSize`). Takes `min(fillSzA, fillSzB)` as effective size. If legs fill asymmetrically (>1% diff), excess on larger leg is immediately unwound.
- **Close partial fill**: Same logic on close — checks actual `fillSz` from bulk close. Rebalances excess leg if asymmetric. Remaining position updated to correct size.
- **Active reconciliation**: SIZE_MISMATCH auto-correction runs every reconciliation cycle. When on-chain size diverges >10% from DB (either direction), corrects DB size to `min(legA_onChain, legB_onChain)`. If both legs are 0 on-chain, marks position flat. If legs are imbalanced on-chain (>5%), unwinds excess on the larger leg via IOC reduce-only order. 30s cooldown between correction attempts per coin.

## Farming Tab
- **Farm** nav button opens the Farming Intelligence dashboard
- **Per-pair metrics table**: TEF (d1+d2 aggregated), VWED, NetCaptureBps, SlippageBps, ASS, Survival Rate, CTR, ATO Recommendation
- **ATO Optimizer table**: Current vs optimal thresholds, expected net, guard rails (min/max), confidence (high/medium/low)
- **Regime overview**: Calm/Active/Explosive pair count pills
- **Collapsible reference docs**: Metric formulas, ATO description, Regime Detector explanation
- **Endpoints**: `GET /bot/farming-metrics`, `GET /bot/farming-optimizer`, `POST /bot/farming-optimizer/apply`, `POST /bot/farming-optimizer/toggle`
- **Polling**: 30s auto-refresh when farming tab is active
- Farming docs previously in Archi sections 31-44 now live in the Farming tab's collapsible reference panel

## Archi Tab (Architecture Reference)
- 25 sections (1-25), sequentially numbered after cleanup
- Sections 4/5 (Close Modes/Strategies), 5 Z-Score Modes, Bot2/Bot+ parity, dual-panel Super Bot, farming docs (31-44) all deleted
- Section 8: 6-Bot Architecture (deployer × direction)
- Section 9: Super Bot Tab (6-bot grid)
- Section 21: Updated file table with botRoutes.js and botPanelTemplate.js
- All Bot+/P50 references scrubbed

## Preserved Features
- p50Mode selector (Z-Score/OU/Kalman/E modes)
- `_computeEWMA` and EWMA chart overlay
- `_closingCoins` double-close prevention
- Tier-based margin limits per pair
- Adaptive deviation-based entry filter (Slip Margin)
- Position-level reconciliation (on-chain vs DB)
