function generateBotPanelHTML(prefix, botPrefix, deployer, direction, botNum) {
  const depLabel = deployer.toUpperCase();
  const dirLabel = direction === 'xyz_short' ? 'Short' : 'Long';
  const panelClass = `superbot-panel-${deployer}`;
  return `
  <div class="superbot-panel ${panelClass}">
    <div class="bot-bloc">
      <div class="bot-bloc-title"><span class="dir-badge dir-${deployer}">${depLabel}</span> Bot${botNum} &mdash; XYZ ${dirLabel}</div>
      <div class="glass-card">
        <div class="bot-top-row">
          <div class="bot-header">
            <h2>${depLabel}</h2>
            <div class="bot-status-indicator">
              <span id="${prefix}Dot" class="status-dot disconnected"></span>
              <span id="${prefix}StatusText">DISABLED</span>
            </div>
            <div class="bot-controls">
              <button id="${prefix}StartBtn" class="btn btn-start" onclick="sbBotAction('${botPrefix}','start')">Start</button>
              <button id="${prefix}StopBtn" class="btn btn-stop" style="display:none;" onclick="sbBotAction('${botPrefix}','stop')">Stop</button>
              <button id="${prefix}LiqBtn" class="btn btn-liq" onclick="sbToggleLiquidation('${botPrefix}','${prefix}')">Liq</button>
              <button id="${prefix}ResetBtn" class="btn btn-reset" onclick="sbBotAction('${botPrefix}','reset')">Reset</button>
            </div>
          </div>
          <div class="wallet-balances" style="margin-bottom:0;">
            <span class="wallet-label">Coll:</span>
            <span class="wallet-token"><span class="token-name">USDC</span> <span id="${prefix}BalUSDC" class="token-val">--</span></span>
            <span class="wallet-token"><span class="token-name">${deployer === 'cash' ? 'USDT' : 'USDH'}</span> <span id="${prefix}BalSecondary" class="token-val">--</span></span>
            <span class="wallet-token wallet-total"><span class="token-name">Total</span> <span id="${prefix}BalTotal" class="token-val">--</span></span>
            <span class="wallet-sep"></span>
            <span class="wallet-token"><span class="token-name">Ping</span> <span id="${prefix}Ping" class="token-val">--</span></span>
            <span class="wallet-sep"></span>
            <span class="wallet-token" style="cursor:pointer;" onclick="showPairFeesModal('${botPrefix}')"><span class="token-name" style="text-decoration:underline;text-decoration-color:var(--gold);">Fees</span> <span id="${prefix}Fees" class="token-val">--</span></span>
          </div>
        </div>
        <div class="bot-api-key-section">
          <div class="api-key-row">
            <span class="api-key-label">Wallet:</span>
            <span id="${prefix}ApiKeyMasked" class="api-key-masked">--</span>
            <span id="${prefix}WalletAddr" class="wallet-addr"></span>
            <button class="btn-sm btn-config" onclick="sbToggleApiKey('${prefix}')">Set</button>
          </div>
          <div id="${prefix}ApiKeyInputRow" class="api-key-input-row" style="display:none;">
            <input type="password" id="${prefix}ApiKeyInput" placeholder="Private key (0x...)" class="api-key-input">
            <button class="btn-sm btn-start" onclick="sbSubmitApiKey('${botPrefix}','${prefix}')">OK</button>
            <button class="btn-sm" onclick="sbToggleApiKey('${prefix}')">X</button>
          </div>
          <div class="api-key-row" style="margin-top:4px;">
            <span class="api-key-label">Sub-acct:</span>
            <span id="${prefix}VaultAddr" class="wallet-addr" style="opacity:0.8;">Main</span>
            <button class="btn-sm btn-config" onclick="toggleVaultInput('${botPrefix}', '${prefix}')">Set</button>
          </div>
          <div id="${prefix}VaultInputRow" class="api-key-input-row" style="display:none;">
            <input type="text" id="${prefix}VaultInput" placeholder="Vault address (0x...)" class="api-key-input" style="font-size:12px;">
            <button class="btn-sm btn-start" onclick="submitVault('${botPrefix}', '${prefix}')">OK</button>
            <button class="btn-sm" onclick="toggleVaultInput('${botPrefix}', '${prefix}')">X</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bot-bloc">
      <div class="bot-bloc-title">Dashboard Bot${botNum}</div>
      <div class="bot-summary-grid bot-summary-row-highlight">
        <div class="bot-summary-card highlight">
          <div class="bot-card-label">P&amp;L Net</div>
          <div class="bot-card-value" id="${prefix}Pnl">$0.00</div>
          <canvas id="${prefix}PnlSparkline" class="pnl-sparkline" width="100" height="30"></canvas>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Fees</div>
          <div class="bot-card-value" id="${prefix}TotalFees">$0.00</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Volume</div>
          <div class="bot-card-value" id="${prefix}Volume">$0.00</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Open</div>
          <div class="bot-card-value" id="${prefix}Open">0</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Closed</div>
          <div class="bot-card-value" id="${prefix}Closed">0</div>
        </div>
        <div class="bot-summary-card win">
          <div class="bot-card-label">Win %</div>
          <div class="bot-card-value" id="${prefix}WinRate">--</div>
        </div>
      </div>
      <div class="bot-summary-grid bot-summary-row-detail">
        <div class="bot-summary-card win">
          <div class="bot-card-label">Wins</div>
          <div class="bot-card-value" id="${prefix}Wins">0</div>
        </div>
        <div class="bot-summary-card lose">
          <div class="bot-card-label">Losses</div>
          <div class="bot-card-value" id="${prefix}Losses">0</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Slip Avg</div>
          <div class="bot-card-value" id="${prefix}Slippage">0 bps</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Errors</div>
          <div class="bot-card-value" id="${prefix}Errors">0</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Orphans</div>
          <div class="bot-card-value negative" id="${prefix}OrphanCost">$0.00</div>
        </div>
        <div class="bot-summary-card highlight">
          <div class="bot-card-label">Funding</div>
          <div class="bot-card-value" id="${prefix}FundingNet">$0.00</div>
        </div>
      </div>
    </div>

    <div class="bot-bloc">
      <div class="bot-bloc-title">Config Bot${botNum}</div>
      <div class="glass-card">
        <div class="bot-config">
          <div class="config-section-group">
            <div class="config-section-label">Position Sizing</div>
            <div class="bot-params">
              <label>Max Pos ($): <input type="number" id="${prefix}MaxPosUsd" step="50" value="500"></label>
              <label>Max Global: <input type="number" id="${prefix}MaxGlobal" step="1" value="100"></label>
            </div>
          </div>
          <div class="config-section-group">
            <div class="config-section-label">Risk</div>
            <div class="bot-params">
              <label>Max Lev: <input type="number" id="${prefix}MaxLeverage" step="1" min="1" max="20" value="10"></label>
              <label>SL (bps): <input type="number" id="${prefix}StopLoss" step="1" min="0" value="0"></label>
              <label>MaxLoss (bps): <input type="number" id="${prefix}MaxLossBps" step="5" min="0" value="50"></label>
            </div>
          </div>
        </div>

        <div class="config-section-group" style="margin-top:8px;">
          <div class="config-section-label">Entry Mode</div>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <span style="font-size:10px;font-weight:600;color:var(--text-secondary);min-width:28px;">Mode:</span>
            <div class="p50-mode-selector" id="${prefix}P50ModeSelector">
              <button class="p50-mode-btn zscore-btn active" data-mode="zscore" onclick="sbSetP50Mode('${botPrefix}','zscore','${prefix}')">Z</button>
              <button class="p50-mode-btn zscore-btn" data-mode="ou" onclick="sbSetP50Mode('${botPrefix}','ou','${prefix}')">OU</button>
              <button class="p50-mode-btn zscore-btn" data-mode="kalman" onclick="sbSetP50Mode('${botPrefix}','kalman','${prefix}')">K</button>
              <button class="p50-mode-btn zscore-btn" data-mode="ewma" onclick="sbSetP50Mode('${botPrefix}','ewma','${prefix}')">E</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;">
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;">Z: <input type="range" id="${prefix}ZThreshold" min="0.5" max="3.0" step="0.1" value="0.5" style="width:50px;"> <span id="${prefix}ZThresholdVal">0.5</span></label>
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;">Buf: <input type="number" id="${prefix}BufferBps" min="0" max="20" step="0.5" value="0" style="width:40px;padding:1px 3px;border-radius:4px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:10px;"></label>
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;" title="Slip margin above fees (deviation check)">Slip: <input type="number" id="${prefix}SlipMargin" min="0" max="20" step="0.5" value="2" style="width:40px;padding:1px 3px;border-radius:4px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:10px;"></label>
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;">Timer: <select id="${prefix}DataTimer" style="padding:1px 3px;border-radius:4px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:10px;"><option value="1m">1m</option><option value="5m">5m</option><option value="15m">15m</option><option value="30m">30m</option><option value="1h">1h</option><option value="6h" selected>6h</option><option value="12h">12h</option><option value="24h">24h</option><option value="week">W</option><option value="weekend">WE</option></select></label>
          </div>
        </div>

        <div class="config-section-group" style="margin-top:8px;">
          <div class="config-section-label">Close (BE-based)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;">Buffer: <input type="number" id="${prefix}CloseBuffer" min="0" max="20" step="0.5" value="1" style="width:40px;padding:1px 3px;border-radius:4px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:10px;"> bps</label>
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;"><input type="checkbox" id="${prefix}ZMeanRevert"> ZMR</label>
            <span style="font-size:9px;color:var(--text-muted);">Close = feesRT + buffer</span>
          </div>
        </div>

        <div style="margin-top:10px;text-align:center;">
          <button id="${prefix}ApplyBtn" class="btn-gold" onclick="sbApplyConfig('${botPrefix}','${prefix}')" style="width:100%;padding:8px 0;font-size:12px;font-weight:700;border-radius:8px;">Apply Bot${botNum}</button>
        </div>

        <div style="margin-top:8px;">
          <div class="config-section-label" style="display:flex;align-items:center;gap:8px;">
            Pair Toggles
            <label style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;margin-left:auto;cursor:pointer;">
              <input type="checkbox" id="${prefix}TiersEnabled" checked onchange="sbToggleTiers('${botPrefix}','${prefix}',this.checked)"> Tiers
            </label>
          </div>
          <div id="${prefix}PairToggles" class="pair-toggles"></div>
          <div id="${prefix}TiersBody" style="display:none;"></div>
        </div>
      </div>
    </div>

    <div class="bot-bloc">
      <div class="bot-bloc-title">Positions Bot${botNum}</div>
      <div class="bot-trades-section">
        <h3 class="accordion-toggle" id="${prefix}OpenTradesToggle">
          <span class="accordion-arrow" id="${prefix}OpenTradesArrow">&#9654;</span>
          Open Positions <span class="badge" id="${prefix}OpenTradesCount">0</span>
          <button class="btn-sm btn-danger" onclick="event.stopPropagation(); sbForceCloseAll('${botPrefix}');">Close All</button>
        </h3>
        <div id="${prefix}OpenTradesPanel" style="display:none;">
          <div class="table-scroll">
            <table class="signals-table">
              <thead><tr><th>Pair</th><th>Dir</th><th>Size</th><th>VwapA</th><th>VwapB</th><th>Slip</th><th>PnL</th><th>$</th><th>Fills</th><th>Hold</th><th></th></tr></thead>
              <tbody id="${prefix}OpenTradesBody"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="bot-trades-section closed-trades-accordion">
        <h3 class="accordion-toggle" id="${prefix}FillsToggle">
          <span class="accordion-arrow" id="${prefix}FillsArrow">&#9654;</span>
          Recent Fills <span class="badge" id="${prefix}FillsCount">0</span>
        </h3>
        <div class="accordion-body" id="${prefix}FillsPanel" style="display:none;">
          <div class="closed-trades-scroll">
            <table class="signals-table">
              <thead><tr><th>Time</th><th>Pair</th><th>Type</th><th>Dir</th><th>Size</th><th>PxA</th><th>PxB</th><th>Edge</th><th>PnL</th><th>Fees</th></tr></thead>
              <tbody id="${prefix}FillsBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="bot-bloc">
      <div class="bot-bloc-title">Activity Bot${botNum}</div>
      <div class="bot-activity-section">
        <div class="activity-filters" id="${prefix}ActivityFilters">
          <button class="af-btn active" data-type="fill_entry" onclick="toggleSbActivityFilter(this)">Entry</button>
          <button class="af-btn active" data-type="win" onclick="toggleSbActivityFilter(this)">Win</button>
          <button class="af-btn active" data-type="loss" onclick="toggleSbActivityFilter(this)">Loss</button>
          <button class="af-btn active" data-type="accepted" onclick="toggleSbActivityFilter(this)">Accept</button>
          <button class="af-btn active" data-type="reject" onclick="toggleSbActivityFilter(this)">Reject</button>
          <button class="af-btn active" data-type="error" onclick="toggleSbActivityFilter(this)">Error</button>
          <button class="af-btn" data-type="recap" onclick="toggleSbActivityFilter(this)">Recap</button>
        </div>
        <div id="${prefix}ActivityFeed" class="activity-feed" style="max-height:200px;overflow-y:auto;"></div>
      </div>
    </div>

    <div class="bot-bloc" id="${prefix}DnBlocLegacy" style="display:none;">
      <div class="bot-trades-section closed-trades-accordion">
        <h3 class="accordion-toggle" id="${prefix}DnBalanceToggle">
          <span class="accordion-arrow" id="${prefix}DnBalanceArrow">&#9654;</span>
          DN Balance <span id="${prefix}DnBadge" class="dn-badge dn-ok">&#x2714;</span>
        </h3>
        <div class="accordion-body" id="${prefix}DnBalancePanel" style="display:none;">
          <div id="${prefix}DnContainer" class="dn-status-container">
            <div style="text-align:center;color:var(--text-muted);padding:8px;">Waiting...</div>
          </div>
        </div>
      </div>
      <div class="bot-trades-section closed-trades-accordion">
        <h3 class="accordion-toggle" id="${prefix}DustCleanerToggle">
          <span class="accordion-arrow" id="${prefix}DustCleanerArrow">&#9654;</span>
          Dust Cleaner <span class="badge" id="${prefix}DustCount">0</span>
        </h3>
        <div class="accordion-body" id="${prefix}DustCleanerPanel" style="display:none;">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <span style="font-size:11px;color:var(--text-muted);" id="${prefix}DustThresholdInfo"></span>
            <button class="btn-sm btn-danger" onclick="sbDustCloseAll('${botPrefix}')" style="margin-left:auto;">Close All Dust</button>
          </div>
          <div id="${prefix}DustContainer" style="text-align:center;color:var(--text-muted);padding:8px;">Loading...</div>
        </div>
      </div>
      <div class="bot-trades-section closed-trades-accordion">
        <h3 class="accordion-toggle" id="${prefix}StableRebalanceToggle">
          <span class="accordion-arrow" id="${prefix}StableRebalanceArrow">&#9654;</span>
          Stable Rebalance <span id="${prefix}StableDriftBadge" class="dn-badge dn-ok">&#x2714;</span>
        </h3>
        <div class="accordion-body" id="${prefix}StableRebalancePanel" style="display:none;">
          <div id="${prefix}StableBalancesContainer" style="margin-bottom:8px;">
            <div style="text-align:center;color:var(--text-muted);padding:8px;">Loading...</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <label style="font-size:11px;color:var(--text-secondary);">USDC %: <input type="number" id="${prefix}StableUsdc" min="0" max="100" step="5" value="60" style="width:45px;padding:2px 4px;border-radius:6px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:11px;"></label>
            <label style="font-size:11px;color:var(--text-secondary);">USDT %: <input type="number" id="${prefix}StableUsdt" min="0" max="100" step="5" value="20" style="width:45px;padding:2px 4px;border-radius:6px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:11px;"></label>
            <label style="font-size:11px;color:var(--text-secondary);">USDH %: <input type="number" id="${prefix}StableUsdh" min="0" max="100" step="5" value="20" style="width:45px;padding:2px 4px;border-radius:6px;border:1px solid var(--border);background:var(--glass-bg);color:var(--text-primary);font-size:11px;"></label>
            <button class="btn-sm btn-start" onclick="sbTriggerStableRebalance('${botPrefix}')">Rebalance</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

const BOT_PANEL_REGISTRY = {
  xsFlx:  { prefix: 'xsFlx',  botPrefix: 'bot',  deployer: 'flx',  direction: 'xyz_short', botNum: 1, tab: 'short' },
  xsKm:   { prefix: 'xsKm',   botPrefix: 'bot2', deployer: 'km',   direction: 'xyz_short', botNum: 2, tab: 'short' },
  xsCash: { prefix: 'xsCash', botPrefix: 'bot3', deployer: 'cash', direction: 'xyz_short', botNum: 3, tab: 'short' },
  xlFlx:  { prefix: 'xlFlx',  botPrefix: 'bot4', deployer: 'flx',  direction: 'xyz_long',  botNum: 4, tab: 'long' },
  xlKm:   { prefix: 'xlKm',   botPrefix: 'bot5', deployer: 'km',   direction: 'xyz_long',  botNum: 5, tab: 'long' },
  xlCash: { prefix: 'xlCash', botPrefix: 'bot6', deployer: 'cash', direction: 'xyz_long',  botNum: 6, tab: 'long' },
};

function initBotPanels() {
  const shortGrid = document.getElementById('sbShortGrid');
  const longGrid = document.getElementById('sbLongGrid');
  if (!shortGrid || !longGrid) return;

  for (const [key, cfg] of Object.entries(BOT_PANEL_REGISTRY)) {
    const html = generateBotPanelHTML(cfg.prefix, cfg.botPrefix, cfg.deployer, cfg.direction, cfg.botNum);
    const target = cfg.tab === 'short' ? shortGrid : longGrid;
    target.insertAdjacentHTML('beforeend', html);
  }

  initBotPanelAccordions();
}

function initBotPanelAccordions() {
  for (const [key, cfg] of Object.entries(BOT_PANEL_REGISTRY)) {
    const p = cfg.prefix;
    const togglePairs = [
      [`${p}OpenTradesToggle`, `${p}OpenTradesPanel`, `${p}OpenTradesArrow`],
      [`${p}FillsToggle`, `${p}FillsPanel`, `${p}FillsArrow`],
      [`${p}DnBalanceToggle`, `${p}DnBalancePanel`, `${p}DnBalanceArrow`],
      [`${p}DustCleanerToggle`, `${p}DustCleanerPanel`, `${p}DustCleanerArrow`],
      [`${p}StableRebalanceToggle`, `${p}StableRebalancePanel`, `${p}StableRebalanceArrow`],
    ];
    for (const [toggleId, panelId, arrowId] of togglePairs) {
      const toggle = document.getElementById(toggleId);
      const panel = document.getElementById(panelId);
      const arrow = document.getElementById(arrowId);
      if (toggle && panel) {
        toggle.addEventListener('click', () => {
          const open = panel.style.display !== 'none';
          panel.style.display = open ? 'none' : '';
          if (arrow) arrow.classList.toggle('open', !open);
        });
      }
    }

    const zSlider = document.getElementById(`${p}ZThreshold`);
    const zVal = document.getElementById(`${p}ZThresholdVal`);
    if (zSlider && zVal) {
      zSlider.addEventListener('input', () => { zVal.textContent = zSlider.value; });
    }
  }
}

function switchSbTab(tab) {
  const shortContent = document.getElementById('sbTabShortContent');
  const longContent = document.getElementById('sbTabLongContent');
  const shortBtn = document.getElementById('sbTabShort');
  const longBtn = document.getElementById('sbTabLong');
  if (tab === 'short') {
    shortContent.style.display = '';
    longContent.style.display = 'none';
    shortBtn.classList.add('active');
    longBtn.classList.remove('active');
  } else {
    shortContent.style.display = 'none';
    longContent.style.display = '';
    shortBtn.classList.remove('active');
    longBtn.classList.add('active');
  }
}
