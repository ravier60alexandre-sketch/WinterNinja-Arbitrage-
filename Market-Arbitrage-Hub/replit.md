# Arbitrage — HIP3 HFT Arbitrage Bot

## Overview
The Arbitrage bot is a high-frequency trading system designed to identify and exploit price discrepancies across multiple HyperLiquid HIP3 deployer perp pairs. It utilizes VWAP-based delta-neutral arbitrage to capitalize on price dislocations in real-time. The system aims for low-latency performance and offers comprehensive monitoring and control through a live HTML dashboard. Its core purpose is to generate profit by efficiently arbitraging market inefficiencies within the HyperLiquid ecosystem.

## User Preferences
- **Timezone**: Europe/Paris (CET/CEST) — all hours in dashboard, heatmaps, P50 bucketing, and logs use French time via `src/tz.js`
- Dashboard language: French for repeg section, English for technical sections
- Simplified single-page view with tabs preferred
- Felix excluded from BTC/ETH tracking (different contract specs)
- Strategy viability tracking via repeg cycle monitoring requested
- CPM = net result (PnL - fees) per $1M, not just cost

## System Architecture
The system employs a Node.js Express backend serving a live HTML dashboard. Each market pair is managed by an isolated `PairEngine` responsible for its own store, WebSocket connections, and recomputation loop. A custom WebSocket client handles real-time L2 order book subscriptions, feeding data to an arbitrage engine that performs VWAP calculations, capacity/slippage checks, and signal generation. State management relies on dedicated classes like Store, RingBuffer, RollingStats, and SpikeTracker. The dashboard provides multi-tab navigation (Data, Bot, Bot Stats, Bot+, Bot Stats 2, Charts, Super Bot, Architecture).

Key architectural decisions and features include:
-   **UI/UX**: Luminous soleil neobank theme with a light background, white glass cards, gold accents, and a custom navigation structure. Nav order: Pair, Charts, Super Bot, Stats SB1, Super Bot 2, Stats SB2, Archi. Old Bot/Bot+/Bot Stats/Bot Stats 2 tabs removed. Pair+ Scanner is the sole pair manager (Gestion des Paires removed). Mode buttons have 3s-delay hover tooltips with glassmorphism styling. It includes dynamic elements like floating golden orbs, animated counters, PnL sparklines, and a dynamic favicon.
-   **VWAP-based Dislocation Detection**: Utilizes VWAP at small notional sizes for precise opportunity identification, incorporating dynamic thresholds for fees and capacity validation.
-   **Multi-Bot Architecture**: Supports multiple bot instances with independent wallets and configurations, allowing for concurrent operation and isolated statistics. Direction-Split Router enables semantic XYZ-based routing: Bot− (XYZ Short) / Bot+ (XYZ Long). Routing resolves which deployer leg is XYZ and routes based on position side, not raw direction number. Pair ordering auto-normalized so xyz is always marketB.
-   **Automated Execution Engine**: Manages signal-to-trade conversion, position tracking, auto-closure, and balance rebalancing. It includes symbol-wide cooldowns and a robust reconciliation mechanism to prevent ghost trades.
-   **PostgreSQL Persistence**: Stores repeg cycles, bot trades, activity logs, and edge snapshots for historical analysis and state recovery.
-   **Dynamic Fee Tracking + Propagation (v32)**: Real-time fetching of fee rates from Hyperliquid API every 60s via `getUserFees(addr)`, with auto-detection of fee tier changes. On update, fees propagate to ALL pair engines (`engine.config.takerFee` + `noGrowthTakerFee`), arb.js thresholds cache (`clearThresholdsCache()`), and store RepegTrackers. Per-pair fees computed from growthModeA/B: both-growth=1.8bps RT, both-noGrowth=6.0bps RT, mixed=3.9bps RT. Fee source badge shows "API ✓ Xs ago" in UI.
-   **Strict Delta-Neutral (DN) Check and Auto-Correction**: Regularly verifies on-chain position balance and initiates corrective market orders if significant imbalances are detected.
-   **Z-Score + EWMA Entry System (v45)**: Four entry modes: `zscore` (Static Z), `ou` (OU Z-Score), `kalman` (Kalman Z-Score), `ewma` (EWMA 12/26 crossover). Each has configurable Z Threshold, Buffer bps (default 0), Data Timer (1m-weekend), and auto-calculated entry fees (growth-aware, read-only). EWMA mode uses fast (span=12) and slow (span=26) exponentially weighted moving averages of the spread for signal generation.
-   **Z-Score Server-Side**: ZScoreTracker in store.js with short (60s) + long (30min) windows. Static Z = (current - mean) / std. Kalman Z = innovation / uncertainty. Sensitivity presets: Fast (Q=0.05/R=0.3), Normal (Q=0.01/R=0.5), Slow (Q=0.005/R=1.0).
-   **Z-Score Optimized Pipeline (v37)**: arb.js always uses Z_CANDIDATE path — signals go directly to execution.js Z gate after capacity check. No P50-based edge filtering.
-   **Fee-Aware Close Strategies (v37)**: Three strategies: `volume` (TP=feesRT, growth-aware), `be` (TP=feesRT+entrySlippage), `beplus` (TP=feesRT+customSlippage, default 1bps). Optional `zMeanRevert` toggle waits for Z→0 if spread < feesRT+5bps. Old strategies (normal/patient/volatility) removed.
-   **Correlation-Based Pair Tiers (v39)**: Real-time Pearson ρ correlation computed per pair from ring buffer mid prices (30min window). Pairs classified into tiers: ALL-IN (ρ≥0.97, max/pair=100), NORMAL (ρ 0.90-0.97, max/pair=15), PRUDENT (ρ<0.90, max/pair=3). Thresholds and max/pair limits configurable via UI. `canTrade()` enforces per-pair position limits based on tier. Visual table in Bot/Bot+/Super Bot tabs with progress bars. Endpoints: GET `/bot/pair-tiers`, POST `/bot/pair-tiers/config`.
-   **Dead Param Cleanup (v39)**: Removed `Min Edge (bps)` and `Max Slippage (bps)` from all bot UIs (Bot, Bot+, Super Bot). Backend fields retained but no longer displayed — entry filtering uses `feesRT + bufferBps` only.
-   **Funding Guard**: An hourly check that auto-closes positions if remaining edge falls below fees floor due to funding costs.
-   **Per-Deployer Collateral Guard**: Ensures sufficient collateral on each deployer before trade entry to prevent partial fills and orphan positions.
-   **Sub-Account Support**: Optional `HL_VAULT_ADDRESS` / `HL_VAULT_ADDRESS_2` env vars to trade on Hyperliquid sub-accounts (vaults) instead of the main wallet. When set, all orders, position queries, and balance checks use the vault address. The signing key remains the parent wallet's private key.
-   **Slippage Safety Net (v49)**: After fill, if break-even (BE) < -10bps, trade is immediately unwound with status `slippage_reject`. Between -10 and 0: warning only. Entry limit order offset reduced from 8bps to 5bps (`entrySlippagePct=0.0005`).
-   **Non-XYZ Routing (v49)**: `nonXyzRouting` config (`'bot1'`|`'bot2'`|`'both'`|`'alternate'`) controls which bot receives non-XYZ pair signals when direction-split is enabled. Default `'bot1'`. Prevents doubling risk. Endpoint: POST `/supervisor/non-xyz-routing`.
-   **Direction-Split Pair Stats (v49)**: `getPairStats()` groups by `pair_id, direction` — each pair has separate d1/d2 rows. Combined stats table shows Dir, Open, Closed, Gross Edge, Net Edge (gross-slip), Slippage columns. Old floorD1/floorD2/zMid0D1/zMid0D2 replaced with single `floor`/`zMid0` per direction row.
-   **Global API Rate Limiter (v50)**: All HL API calls go through `fetchHL()` which enforces a global semaphore (max 6 concurrent requests, 80ms min interval between requests). Retry backoff increased to 3-15s. Per-bot `dexFilter` scopes `getDeployerPositions()` to only the 2 relevant DEXes (deployer + xyz) instead of all 7, reducing API calls by ~71%. Background loops (balance refresh, rebalance, orphan check, DN check, reconciliation, fee refresh) are staggered by `(botNum-1) * 2s` to prevent simultaneous bursts. Disabled bots with 0 open positions skip all periodic API calls entirely. Orphan check interval increased from 10s to 30s.
-   **HFT Optimizations**: Includes pre-calculated fee constants, minimized memory allocations, keep-alive HTTP connections, parallel IOC execution, and aggressive timeouts for low-latency trading.
-   **SSE Live Events**: Real-time close/entry status via Server-Sent Events with polling fallback.
-   **Charts Tab (v35+)**: All-pairs chart grid with 1-second resolution, deployer-colored price lines, vol-adjusted spread (Static Z/OU/Kalman/EWMA modes), ±2σ bands, zero reference line. EWMA mode shows fast-slow crossover difference with volatility bands. Edge & Depth chart with per-pair Fee RT reference line and zero line. Spread Ratio chart (A/B price ratio with mean line). Copula Statistics panel (Pearson ρ, Spearman ρ_s, Kendall τ, Best Fit copula type, Correlation %) and Empirical Copula scatter plot per pair. All stats adapt to selected timeframe. Uses Chart.js.
-   **Z-Mode UI Cleanup (v32)**: "Fees & Marge" config section hidden in Z mode (irrelevant — Z mode uses kalmanZ + fees gate, not P50+marge). Config Marge table remains visible with adapted Z headers.
-   **Config Marge Fix (v32)**: Table now populates even when `edge_snapshots` DB has no historical data — falls back to `pairsList` fee data. Per-pair fee values from live API propagation.
-   **Super Bot Tabs (v47)**: Two independent Super Bot tabs (SB1 with sb1/sb2 prefixes, SB2 with sb3/sb4 prefixes). Each has full dual-panel bot control (Bot1 D1 left, Bot2 D2 right) with independent controls, configs, positions, activity feeds, correlation tier tables, and combined stats bar. Apply button collects ALL config params in one click. Per-pair fee details accessible via clickable "Frais Taker" with modal popup. Endpoints: `/bot/pair-fees-detail`, `/bot2/pair-fees-detail`.
-   **Pair+ Scanner (v45)**: Enhanced scanner in Data tab showing ALL cross-deployer HIP3 pairs with added/available status, deployer color badges, coin filter, deployer filter, per-row add/remove buttons, and bulk select. Default pair size: $25, max global: 100.
-   **Bulk Order Execution (v29)**: Entry and close both use `placeBulkOrderNative` — 1 HTTP call for both legs via native SDK. Saves ~20ms latency.
-   **Orphan Unwind + Reconciliation (v29)**: 1-leg fill at entry triggers immediate reverse order (0.3% slippage IOC). On-chain orphans tracked 60s then auto-closed.
-   **Full Reset with On-Chain Closes (v33)**: Reset button now closes all on-chain positions (reduce_only=true, 2% slippage IOC), clears DN correction state (_dnAggImbalances), aggregate exposure (_marginBlocked), orphan tracking (_orphanOnChainSeen), then wipes DB. UI shows loading state + close results count. Applies to Bot, Bot+, and Super Bot.
-   **Tick-Level Ring Buffer**: Stores every WS book update with sub-second timestamps for detailed analysis and enhanced chart rendering.
-   **1-Second Global Scheduler**: Snapshots all pairs simultaneously into per-pair RingBuffer for consistent historical data.
-   **Configurable minHoldMs (v29)**: Minimum hold time before close attempts, configurable 1-30s (default 3s). Close fallback uses precomputed prices instead of market orders.
-   **Activity Log Enrichment**: Includes latencyMs, motif, p50Used, feesEstimate fields and provides a full activity history viewer with filters.
-   **Errors Table**: Groups errors by root cause and allows filtering.
-   **Dust Cleaner**: Detects and closes dust positions below a configurable threshold.
-   **2-Level Stablecoin Rebalancing (v48)**: Level 1 (Intra-wallet): Configurable stable targets (default USDC 50%, USDT 25%, USDH 25%) with drift threshold. Auto-rebalancer triggers when any token drifts beyond threshold. Sells excess tokens → USDC (via spot @166 USDT0/USDC or @230 USDH/USDC), then buys deficit tokens with USDC. Handles all 3 tokens independently (not just USDT↔USDH). Unified wallet compatible. Adjustable timer (30-300s) and cooldown (60-600s) with manual trigger. Level 2 (Cross-wallet): Direct USDC/USDT/USDH transfer between Bot1↔Bot2 wallets when one is dry (margin <5%) and other can donate (margin >10%). Auto toggle, adjustable check interval (1-30min) and cooldown (5-60min), manual force button. Full dashboard with glassmorphism cards, margin %, dry/donate status badges, transfer history (20 entries). Both Bot1 and Bot2 panels have identical intra-wallet controls.
-   **Spot Symbol Resolution (v48)**: `hl_api.js` uses `_resolveSpotSymbol()` to map token names to Hyperliquid spot pair indices: USDT/USDT0→@166, USDH→@230. Both pairs trade against USDC with szDecimals=2.
-   **PnL Calculation**: Net PnL is calculated as Gross Trade PnL - Fees - Error Costs - DN Adjustment Costs + Wallet Funding, with live fee rate fetching.

## VPS Data Layer
The project uses a dedicated VPS for data collection and production deployment.

**VPS Environment:**
- OS: Ubuntu 22.04
- Node.js: v20.20.0 / npm: v10.8.2
- PostgreSQL: v14
- Process manager: PM2

**Database (VPS):**
- Name: `hl_data`
- User: `user`
- Password: `password`
- Host: `localhost`
- Port: `5432`
- Connection string: `postgresql://user:password@localhost:5432/hl_data`

**Data-Collector:**
- Located in `data-collector/` folder, deployed on VPS via PM2
- Collects: `edge_snapshots` (60s), `book_snapshots` (60s), `funding_snapshots` (1h)
- Same `edge_snapshots` schema as the bot — directly compatible
- Additional tables: `book_snapshots` (top-5 L2 levels), `funding_snapshots` (funding rates)
- Retention: 90 days (configurable)

**Data Strategy:**
- All historical data comes from the VPS database
- When bot is deployed on VPS, set `DATABASE_URL=postgresql://user:password@localhost:5432/hl_data`
- Bot and data-collector share the same DB — bot reads accumulated data for charts/analysis
- Set `EDGE_RETENTION_DAYS=90` on VPS to match data-collector retention (default is 21 days on Replit)

## External Dependencies
-   Node.js 20
-   Express.js
-   `ws` library (for WebSockets)
-   HyperLiquid Public WebSocket API
-   HyperLiquid SDK
-   PostgreSQL database
-   Chart.js (CDN)
-   PM2 (for process management)
-   systemd (for Linux server deployment)