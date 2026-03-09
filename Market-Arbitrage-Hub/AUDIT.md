# PRODUCTION AUDIT REPORT — HFT Arbitrage Bot (HIP3 / Hyperliquid)

**Date**: 2026-02-28
**Codebase**: ~17,000 lines across 14 source files
**Target**: VPS deployment with ~20ms latency

---

## 1. FULL PROJECT AUDIT

### Unused Files / Dead Code
| Severity | File | Issue |
|----------|------|-------|
| WARNING | `src/ws_pool.js` | Dead code — imports `HyperliquidWS` which no longer exists in `hl_ws.js`. Replaced by `WSPool` class in `hl_ws.js`. Safe to delete. |
| WARNING | `src/backtest.js` | Uses `readFileSync` on CSV files. Only used by 2 routes. Not critical but adds surface area. |
| WARNING | `package.json` | `@anthropic-ai/sdk` and `openai` are only used for optional AI chat feature (lazy `require()`). Not HFT-critical but adds 50MB+ to `node_modules`. Consider making optional. |
| INFO | `archiver` reference at `index.js:1640` | `require('archiver')` used but archiver is NOT in package.json dependencies. Will throw at runtime if export route called with `format=csv`. |

### Inconsistent Imports
- `src/index.js` imports `hlApi` via `require('./hl_api')` at **three** different locations (L10, L563, L1452). The L563 and L1452 are redundant local re-requires inside route handlers. Harmless (Node caches modules) but messy.

### Race Conditions / Async Issues
| Severity | Location | Issue |
|----------|----------|-------|
| LOW | `execution.js` | `_pendingCoinSides` is a lightweight in-memory lock. Since Node.js is single-threaded, the check-then-set pattern is safe. No true race condition. |
| LOW | `execution.js` | `_closeQueues` with `_closeQueueProcessing` flag prevents double-processing. Correctly implemented. |
| LOW | `execution.js:_symbolCooldownUntil` | Time-based cooldowns. Safe — checked synchronously before async operations. |

### Memory Leak Risk
| Severity | Location | Issue |
|----------|----------|-------|
| LOW | `_activityLog` | Capped at 200 entries (`_activityLogMax`). OK. |
| LOW | `_execTimeRing` / `_e2eLatencyRing` | Ring buffers capped at 50/100 entries. OK. |
| LOW | `_dnAggCorrections` | Capped at 50 entries. OK. |
| LOW | `_missedStats` / `_peakPositions` | Unbounded objects keyed by pairId. Bounded by number of pairs (~30). OK. |
| LOW | `_marginRecoveryTimers` | Intervals cleaned up with `clearInterval`. OK. |
| INFO | `_marginBlocked` / `_coinFailCounts` / `_legFailCounts` / `_symbolFailCounts` | Unbounded but keyed by coin/symbol. ~50 coins max. Negligible. |

### Error Handling
- All critical trade execution paths (`_executeTrade`, `checkAndClosePositions`, `_closeTradeAllLegs`) are wrapped in try/catch with logging.
- DB queries in routes are wrapped in try/catch with 500 responses.
- WebSocket messages wrapped in try/catch (`hl_ws.js:89-104`).
- `unhandledRejection` and `uncaughtException` handlers present (`index.js:21-27`).
- **Note**: `uncaughtException` calls `process.exit(1)` which may leave DB connections/WS open briefly. Acceptable for HFT (PM2 will restart).

### Blocking Synchronous Code
| Severity | Location | Issue |
|----------|----------|-------|
| LOW | `index.js:32-36` | `fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync` for lockfile. Runs once at startup only. Acceptable. |
| LOW | `index.js:43` | `JSON.parse(fs.readFileSync(configPath))` for config.json. Startup only. OK. |
| LOW | `index.js:100-108` | CSV dir/file creation with sync fs. Startup only per-pair. OK. |
| WARNING | `index.js:290` | `fs.writeFileSync(configPath, ...)` in `/pairs/add` route. Could block event loop for ~1ms. Low frequency. Acceptable. |
| LOW | `backtest.js:5-6` | Sync file reads. Only called on-demand via backtest routes. OK. |

---

## 2. DATA PERSISTENCE CHECK

### State That Survives Restart
| Data | Storage | Status |
|------|---------|--------|
| Open trades | PostgreSQL `bot_trades` | OK — loaded on startup |
| Coin sides | PostgreSQL (derived from open trades) | OK — rebuilt on startup |
| Bot enabled/disabled | PostgreSQL `bot_config` | OK |
| Liquidation mode | PostgreSQL `bot_config` | OK |
| Bot params (posSize, maxLev, etc.) | PostgreSQL `bot_config` | OK |
| Per-pair edge floors | PostgreSQL `bot_config` | OK |
| Enabled pairs | PostgreSQL `bot_config` | OK |
| Close strategy | PostgreSQL `bot_config` (in bot_params) | OK |
| Stuck 'closing' trades | PostgreSQL — reverted to 'open' on restart | OK |
| Activity log | PostgreSQL `bot_activity_log` | OK (7-day retention) |

### State That Does NOT Survive Restart (In-Memory Only)
| Data | Impact | Risk Level |
|------|--------|------------|
| `_symbolCooldownUntil` | Symbol cooldowns reset. Pairs immediately tradeable. | LOW — cooldowns are protective, not critical. Max 60s window. |
| `_coinFailCounts` / `_legFailCounts` / `_symbolFailCounts` | Fail counters reset. Protective thresholds restart from 0. | LOW — self-healing over time. |
| `_marginBlocked` | Margin blocks reset. Pairs try again immediately. | LOW — re-checked on next trade attempt. |
| `_pendingCoinSides` | Pending coin locks reset. | LOW — only relevant during active trade execution. Empty at rest. |
| `_orphanClosing` | In-flight orphan close tracking reset. | LOW — reconciliation loop will re-detect and re-close. |
| `_dnImbalances` / `_dnAggImbalances` | DN check history reset. | LOW — rebuilt within 30s by DN check loop. |
| `_closeQueues` | Close queue reset. | LOW — close checks restart within seconds. |
| `_peakPositions` / `_peakGlobalPositions` | Peak stats reset. Cosmetic only. | NONE |
| `stats` (totalFilled, totalFailed, totalPnlUsd) | Session stats reset. | LOW — cosmetic, historical data in DB. |

**Verdict**: All financially-critical state (open positions, trade records, bot config) is properly persisted. In-memory state is either protective (and self-healing) or cosmetic. **No critical persistence gaps.**

### DB Write Safety
- All trade inserts/updates use parameterized queries. Safe against SQL injection.
- `saveBotConfig` uses `INSERT ... ON CONFLICT DO UPDATE` (upsert). Atomic. OK.
- `writeFileSync` for config.json is not atomic (could corrupt on crash during write). LOW risk — config.json only changes when adding pairs.

---

## 3. VPS DEPLOYMENT READINESS

### Environment Variables
| Variable | Usage | Status |
|----------|-------|--------|
| `DATABASE_URL` | PostgreSQL connection | Required — validated at boot |
| `HL_PRIVATE_KEY` | Hyperliquid wallet | Required — validated at boot |
| `HL_WALLET_ADDRESS` | Public address (optional) | Optional — derived from key if missing |
| `HL_PRIVATE_KEY_2` | Bot+ wallet | Optional — graceful skip if missing |
| `HL_WALLET_ADDRESS_2` | Bot+ address | Optional |
| `PORT` | Server port | Defaults to 5000 if not set |

No hardcoded paths (config.json is relative). OK.

### WebSocket Reconnect Logic
- Exponential backoff: 1s initial, 2x multiplier, 30s max. OK.
- Resubscribes all coins on reconnect. OK.
- Heartbeat ping every 30s. OK.
- **Missing**: No jitter in reconnect delay. Multiple WS connections could reconnect simultaneously, causing thundering herd. LOW risk with 9 connections.
- **Missing**: No pong timeout detection. If server stops responding but TCP stays alive, bot won't detect stale connection. MEDIUM risk for HFT.

### Graceful Shutdown
- `SIGTERM` and `SIGINT` handlers present. Stop both execution engines, close DB pool. OK.
- Lockfile released on shutdown. OK.
- **Missing**: No WebSocket close on shutdown. Connections will be orphaned until OS closes them. LOW risk.
- **Missing**: No pending order cancellation on shutdown. If orders are in-flight, they may fill after bot stops. LOW risk — IOC orders expire immediately.

### PM2 Compatibility
- `deploy.sh` present with PM2 ecosystem config. OK.
- `DEPLOY.md` documentation present. OK.
- No `"start"` script in `package.json`. Should add `"start": "node src/index.js"`.
- Process lockfile (`.bot.lock`) prevents duplicate instances. Compatible with PM2 single instance mode.

---

## 4. DEPLOYMENT PACKAGE CHECK

### package.json
| Check | Status |
|-------|--------|
| Name | `"workspace"` — should be renamed for production |
| Version | `1.0.0` — OK |
| Main | `"index.js"` — incorrect, should be `"src/index.js"` |
| Scripts | No `start` script — **add `"start": "node src/index.js"`** |
| Dependencies | All 6 installed and resolvable |
| Node version | Not specified — should add `"engines": {"node": ">=20"}` |

### Missing Dependencies
| Package | Usage | Status |
|---------|-------|--------|
| `archiver` | Referenced in export route (`index.js:1640`) | NOT in package.json. Will crash if called. |

### Unnecessary Production Dependencies
| Package | Size | Usage |
|---------|------|-------|
| `@anthropic-ai/sdk` | ~15MB | Optional AI chat feature only |
| `openai` | ~40MB | Optional AI chat feature only |

### .gitignore
- Covers `node_modules/`, `.env`, `data/csv/`, `logs/`, `.local/`. OK.
- `package-lock.json` is gitignored — should be committed for reproducible builds on VPS.

### Sensitive Data
- No private keys committed. Environment variables used. OK.
- AI keys stored in-memory only (not persisted). OK.

---

## 5. PERFORMANCE CHECK

### HFT-Specific Optimizations (Already Implemented)
- Pre-calculated fee constants
- Float64Array for multi-VWAP calculations
- Fast-path rejection (skip VWAP if edge < 50% threshold)
- Cached open position count (`_openCount`)
- Parallel IOC leg execution
- Background collateral checks (2.5s refresh)
- Non-blocking reconciliation via `setImmediate`
- Keep-alive HTTP connections (implied by Hyperliquid SDK)

### Potential Improvements
| Priority | Area | Suggestion |
|----------|------|------------|
| MEDIUM | `hl_ws.js:100` | `JSON.parse(str)` on every WS message. Consider using a streaming JSON parser or pre-checking message type before full parse. Already has fast-path skip for non-l2Book messages. |
| LOW | `index.js:290` | `fs.writeFileSync` blocks event loop. Use `fs.promises.writeFile` for pair additions. |
| LOW | `execution.js:2210-2213` | `getPairStats()` uses string interpolation for `bot_id` in SQL. Use parameterized query instead. Performance identical but safer. |
| INFO | Express static serving | No CDN or compression middleware. Fine for single-user dashboard. |
| INFO | DB connection pool | Using default `pg` pool settings. Consider tuning `max`, `idleTimeoutMillis` for production. |

### Sequential vs Parallel API Calls
- Trade entry executes both legs in parallel (`Promise.allSettled`). OK.
- Fee refresh, balance refresh, edge floors — all independent but run sequentially on startup. Could parallelize but startup is one-time. LOW priority.

---

## 6. SAFETY CHECK

### Double Order Risk
| Check | Status |
|-------|--------|
| `_pendingCoinSides` lock | Prevents same coin from being traded in conflicting directions simultaneously. OK. |
| `_pendingDbInsertCoins` | Prevents reconciliation from acting on coins mid-insert. OK. |
| `_closeQueueProcessing` flag | Prevents re-entry into close processing for same pair. OK. |
| IOC order type | All orders are IOC (Immediate-or-Cancel). No lingering limit orders. OK. |
| Reconciliation guard | 30s delay before auto-closing unmatched positions. Prevents premature closure. OK. |

### Orphan Leg Protection
| Check | Status |
|-------|--------|
| Both legs fail | Trade not inserted into DB. No orphan. OK. |
| One leg fails | 25s delay, then market close of successful leg. OK. |
| Symbol cooldown | After orphan close, 60s cooldown on that symbol. OK. |
| On-chain verification | Verifies position exists before attempting close. OK. |

### Infinite Loop Risk
| Check | Status |
|-------|--------|
| Close retry | Retries next tick (5s interval), not immediate loop. OK. |
| Margin recovery | Max 30 checks with `clearInterval`. OK. |
| DN correction | 60s cooldown per coin. OK. |
| Reconciliation | setImmediate-based, runs every 5s. OK. |

### Lock Correctness
- All locks are single-threaded in-memory checks (Node.js event loop). No mutex needed. Pattern is correct.
- `_orphanClosing` Set prevents double-close of same coin.
- Process-level lockfile prevents duplicate bot instances.

---

## 7. FINAL REPORT

### CRITICAL Issues (Must Fix)
| # | Issue | Location |
|---|-------|----------|
| 1 | Missing `archiver` dependency — export route will crash | `package.json`, `index.js:1640` |
| 2 | No `start` script in `package.json` | `package.json` |
| 3 | `main` field incorrect (`index.js` vs `src/index.js`) | `package.json` |

### WARNINGS (Should Fix)
| # | Issue | Location |
|---|-------|----------|
| 1 | Dead file `src/ws_pool.js` — imports non-existent class | `src/ws_pool.js` |
| 2 | No pong/stale connection detection on WebSocket | `src/hl_ws.js` |
| 3 | No reconnect jitter (thundering herd risk) | `src/hl_ws.js:173-178` |
| 4 | `package-lock.json` gitignored — should be committed for VPS | `.gitignore` |
| 5 | WebSocket connections not closed on shutdown | `index.js:2292-2304` |
| 6 | SQL string interpolation for `bot_id` in some queries | `execution.js` |
| 7 | `package.json` name is `"workspace"` — rename for production | `package.json` |
| 8 | No Node.js version specified in `engines` | `package.json` |
| 9 | Heavy AI SDK deps (~55MB) for optional feature | `package.json` |

### PERFORMANCE Improvements (Nice to Have)
| # | Suggestion |
|---|------------|
| 1 | Add pong timeout (10s) to detect stale WS connections |
| 2 | Add jitter to WS reconnect delay |
| 3 | Replace `writeFileSync` with async in pair-add route |
| 4 | Parameterize all SQL queries (remove string interpolation) |
| 5 | Consider compression middleware for dashboard serving |
| 6 | Tune pg pool settings for production |

---

## VPS DEPLOYMENT READY SCORE

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Data Persistence | 95/100 | 25% | 23.75 |
| Safety (Double Order/Orphan) | 95/100 | 25% | 23.75 |
| Error Handling | 90/100 | 15% | 13.50 |
| WebSocket Resilience | 80/100 | 15% | 12.00 |
| Deployment Config | 70/100 | 10% | 7.00 |
| Performance | 90/100 | 10% | 9.00 |

### **FINAL SCORE: 89/100**

The bot is fundamentally production-ready. The 3 CRITICAL issues are all trivial fixes (package.json metadata + missing dependency). Core trading logic, persistence, safety guards, and error handling are solid. The main area for improvement is WebSocket stale-connection detection, which is a medium-risk gap for HFT.
