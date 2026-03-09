let bot2Available = false;
let bot3Available = false;
let bot4Available = false;
let bot5Available = false;
let bot6Available = false;

(function applyThemeOnLoad() {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
  }
  var btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = saved === 'dark' ? '&#9788;' : '&#9790;';
})();

function toggleTheme() {
  var isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  var btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = isDark ? '&#9788;' : '&#9790;';
}

function showToast(message, type) {
  const existing = document.querySelectorAll('.toast-notification');
  existing.forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast-notification toast-' + (type || 'info');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transition:opacity 0.3s;';
  if (type === 'success') toast.style.background = '#10b981';
  else if (type === 'error') toast.style.background = '#ef4444';
  else toast.style.background = '#6366f1';
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

async function safeFetchJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { parsed = { error: `HTTP ${r.status}` }; }
    return parsed;
  }
  return r.json();
}

function addRippleEffect(btn) {
  btn.addEventListener('click', function(e) {
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple-effect';
    ripple.style.left = (e.clientX - rect.left - 10) + 'px';
    ripple.style.top = (e.clientY - rect.top - 10) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

function applyShimmer(el) {
  if (el && (el.textContent === '--' || el.textContent.trim() === '--')) {
    el.classList.add('shimmer');
  }
}

function removeShimmer(el) {
  if (el) el.classList.remove('shimmer');
}

document.addEventListener('DOMContentLoaded', function() {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark') document.body.classList.add('dark-mode');
  var thBtn = document.getElementById('themeToggleBtn');
  if (thBtn) thBtn.innerHTML = saved === 'dark' ? '&#9788;' : '&#9790;';
  if (typeof initBotPanels === 'function') initBotPanels();
  if (typeof _initBotPanelStateListeners === 'function') _initBotPanelStateListeners();
  if (typeof BOT_PANEL_REGISTRY !== 'undefined' && typeof _initActivityFilterButtons === 'function') {
    for (const cfg of Object.values(BOT_PANEL_REGISTRY)) _initActivityFilterButtons(cfg.prefix + 'ActivityFilters');
  }
  document.querySelectorAll('.btn-start, .btn-stop, .btn-reset, .btn-config').forEach(addRippleEffect);
});

const _sbServerConfig = {};
const _sbUserDirty = {};
if (typeof BOT_PANEL_REGISTRY !== 'undefined') {
  for (const cfg of Object.values(BOT_PANEL_REGISTRY)) _sbUserDirty[cfg.prefix] = false;
}
const _SB_CONFIG_FIELDS = ['MaxPosUsd', 'MaxLossBps', 'CloseBuffer', 'MaxGlobal', 'MaxLeverage', 'StopLoss', 'ZThreshold', 'BufferBps', 'SlipMargin', 'DataTimer', 'StableUsdc', 'StableUsdt', 'StableUsdh'];
const _SB_CONFIG_CHECKBOXES = ['ZMeanRevert'];

function _sbSnapshotServerConfig(prefix, data) {
  const snap = {};
  if (data.maxPositionUsd != null) snap.MaxPosUsd = String(data.maxPositionUsd);
  if (data.maxLossBps != null) snap.MaxLossBps = String(data.maxLossBps);
  if (data.closeBufferBps != null) snap.CloseBuffer = String(data.closeBufferBps);
  if (data.maxGlobalPositions != null) snap.MaxGlobal = String(data.maxGlobalPositions);
  if (data.maxLeverage != null) snap.MaxLeverage = String(data.maxLeverage);
  if (data.stopLossBps != null) snap.StopLoss = String(data.stopLossBps);
  if (data.zThreshold != null) snap.ZThreshold = String(data.zThreshold);
  if (data.bufferBps != null) snap.BufferBps = String(data.bufferBps);
  if (data.slippageMarginBps != null) snap.SlipMargin = String(data.slippageMarginBps);
  if (data.dataTimer != null) snap.DataTimer = String(data.dataTimer);
  if (data.zMeanRevert != null) snap.ZMeanRevert = data.zMeanRevert;
  if (data.stableTargets) {
    snap.StableUsdc = String(Math.round((data.stableTargets.usdc || 0) * 100));
    snap.StableUsdt = String(Math.round((data.stableTargets.usdt || 0) * 100));
    snap.StableUsdh = String(Math.round((data.stableTargets.usdh || 0) * 100));
  }
  _sbServerConfig[prefix] = snap;
}

function _sbCheckDirty(prefix) {
  const snap = _sbServerConfig[prefix];
  if (!snap) return;
  const btnId = prefix + 'ApplyBtn';
  const btn = document.getElementById(btnId);
  if (!btn) return;
  let dirty = false;
  for (const f of _SB_CONFIG_FIELDS) {
    const el = document.getElementById(prefix + f);
    if (el && snap[f] !== undefined) {
      if (String(el.value).trim() !== String(snap[f]).trim()) { dirty = true; break; }
    }
  }
  if (!dirty) {
    for (const f of _SB_CONFIG_CHECKBOXES) {
      const el = document.getElementById(prefix + f);
      if (el && snap[f] !== undefined) {
        if (el.checked !== snap[f]) { dirty = true; break; }
      }
    }
  }
  if (btn.classList.contains('btn-config-saved') && !dirty) return;
  if (dirty && btn.classList.contains('btn-config-saved')) {
    btn.classList.remove('btn-config-saved');
    btn.textContent = _sbApplyLabels[prefix] || 'Appliquer Config';
  }
  if (dirty) {
    btn.classList.remove('btn-gold');
    btn.classList.add('btn-config-dirty');
  } else {
    btn.classList.remove('btn-config-dirty');
    btn.classList.add('btn-gold');
  }
}

function _sbInitDirtyListeners() {
  const prefixes = typeof BOT_PANEL_REGISTRY !== 'undefined' ? Object.values(BOT_PANEL_REGISTRY).map(r => r.prefix) : [];
  for (const prefix of prefixes) {
    for (const f of _SB_CONFIG_FIELDS) {
      const el = document.getElementById(prefix + f);
      if (el) el.addEventListener('input', () => { _sbUserDirty[prefix] = true; _sbCheckDirty(prefix); });
    }
    for (const f of _SB_CONFIG_CHECKBOXES) {
      const el = document.getElementById(prefix + f);
      if (el) el.addEventListener('change', () => { _sbUserDirty[prefix] = true; _sbCheckDirty(prefix); });
    }
  }
}

const _sbApplyLabels = {};
if (typeof BOT_PANEL_REGISTRY !== 'undefined') {
  for (const [key, cfg] of Object.entries(BOT_PANEL_REGISTRY)) {
    _sbApplyLabels[cfg.prefix] = `Apply Bot${cfg.botNum}`;
  }
}

function _sbFlashSaved(prefix) {
  _sbUserDirty[prefix] = false;
  const btn = document.getElementById(prefix + 'ApplyBtn');
  if (!btn) return;
  btn.classList.remove('btn-config-dirty', 'btn-gold');
  btn.classList.add('btn-config-saved');
  btn.textContent = '\u2714 Appliqué';
  setTimeout(() => {
    btn.classList.remove('btn-config-saved');
    btn.classList.add('btn-gold');
    btn.textContent = _sbApplyLabels[prefix] || 'Appliquer Config';
    _sbCheckDirty(prefix);
  }, 2000);
}

setTimeout(_sbInitDirtyListeners, 2000);

let _lastSeenFillId = 0;

function toggleSoundMaster() {
  const s = getSoundSettings();
  s.master = !s.master;
  _saveSoundSettings(s);
  _syncSoundMasterBtn();
}

function _syncSoundMasterBtn() {
  const s = getSoundSettings();
  const btn = document.getElementById('soundMasterBtn');
  if (!btn) return;
  btn.textContent = s.master ? '\uD83D\uDD0A' : '\uD83D\uDD07';
  btn.classList.toggle('active', s.master);
  btn.title = s.master ? 'Sons activ\u00e9s' : 'Sons d\u00e9sactiv\u00e9s';
}

function toggleSoundPanel() {
  const panel = document.getElementById('soundPanel');
  if (!panel) return;
  const vis = panel.style.display !== 'none';
  panel.style.display = vis ? 'none' : '';
  if (!vis) _renderSoundPanel();
}

function _renderSoundPanel() {
  const s = getSoundSettings();
  const slider = document.getElementById('soundVolumeSlider');
  const label = document.getElementById('soundVolLabel');
  if (slider) slider.value = s.volume;
  if (label) label.textContent = s.volume + '%';
  const grid = document.getElementById('soundTypesGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(SOUND_TYPES).map(([key, cfg]) => {
    const checked = s.types[key] ? 'checked' : '';
    return `<label class="sound-type-row">
      <input type="checkbox" data-sound-type="${key}" ${checked} onchange="_onSoundTypeChange()">
      <span>${cfg.label}</span>
      <button class="sound-preview-btn" onclick="event.preventDefault();previewSound('${key}')">&#9654;</button>
    </label>`;
  }).join('');
}

function updateSoundVolume(val) {
  const s = getSoundSettings();
  s.volume = parseInt(val);
  _saveSoundSettings(s);
  const label = document.getElementById('soundVolLabel');
  if (label) label.textContent = s.volume + '%';
}

function _onSoundTypeChange() {
  const s = getSoundSettings();
  document.querySelectorAll('#soundTypesGrid input[data-sound-type]').forEach(inp => {
    s.types[inp.dataset.soundType] = inp.checked;
  });
  _saveSoundSettings(s);
}

setTimeout(_syncSoundMasterBtn, 500);

const ACTIVITY_FILTER_CATEGORIES = {
  fills: { label: 'Fills', types: ['filled', 'accepted'], defaultOn: true },
  close: { label: 'Close', types: ['win', 'loss', 'funding_close'], defaultOn: true },
  rejets: { label: 'Rejets', types: ['reject'], defaultOn: false },
  bloques: { label: 'Bloqu\u00E9s', types: ['blocked'], defaultOn: false },
  erreurs: { label: 'Erreurs', types: ['error', 'failed', 'margin_fail'], defaultOn: true },
  systeme: { label: 'Syst\u00E8me', types: ['margin_ok', 'auto_disable', 'halt', 'recap'], defaultOn: true },
};

function _loadActivityFilters() {
  try {
    const saved = localStorage.getItem('activityFilters');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  const defaults = {};
  for (const [key, cat] of Object.entries(ACTIVITY_FILTER_CATEGORIES)) {
    defaults[key] = cat.defaultOn;
  }
  return defaults;
}

let _activityFilters = _loadActivityFilters();

function _saveActivityFilters() {
  try { localStorage.setItem('activityFilters', JSON.stringify(_activityFilters)); } catch (e) {}
}

function _getVisibleTypes() {
  const types = new Set();
  for (const [key, cat] of Object.entries(ACTIVITY_FILTER_CATEGORIES)) {
    if (_activityFilters[key]) {
      cat.types.forEach(t => types.add(t));
    }
  }
  return types;
}

function _renderFilterBar(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Object.entries(ACTIVITY_FILTER_CATEGORIES).map(([key, cat]) => {
    const active = _activityFilters[key] ? 'active' : '';
    const countSpan = `<span class="act-filter-count" id="actCount_${key}"></span>`;
    return `<button class="activity-filter-btn ${active}" data-filter="${key}" onclick="toggleActivityFilter('${key}')">${cat.label} ${countSpan}</button>`;
  }).join('');
}

function _updateActivityFilterCounts(typeCounts) {
  for (const [key, cat] of Object.entries(ACTIVITY_FILTER_CATEGORIES)) {
    let count = 0;
    cat.types.forEach(t => { count += (typeCounts[t] || 0); });
    const el = document.getElementById('actCount_' + key);
    if (el) el.textContent = count > 0 ? '(' + count + ')' : '';
  }
}

function toggleActivityFilter(key) {
  _activityFilters[key] = !_activityFilters[key];
  _saveActivityFilters();
  _renderFilterBar('overviewActivityFilters');
  _renderFilterBar('botActivityFilters');
  pollOverviewActivity();
  pollBotActivity();
}

function _initActivityFilters() {
  _renderFilterBar('overviewActivityFilters');
  _renderFilterBar('botActivityFilters');
}

let cachedMarketA = '--';
let cachedMarketB = '--';
let cachedConfig = null;
let currentPairId = null;
let pairsList = [];
let spreadData = [];
let fullHistoryData = [];
let historyAutoScroll = true;
let pairCounts = {};
let signalsExpanded = false;
let repegExpanded = false;
let allSignals = [];
let allRepegCycles = [];
let currentView = 'main';
let overviewCache = {};
let _pnlHistoryLoaded = false;
let _pnlHistory2Loaded = false;

const _animCache = {};
const _pnlHistory = [];
const _pnlHistory2 = [];
const _PNL_HISTORY_MAX = 120;

function animateValue(el, newVal, duration) {
  if (!el) return;
  const id = el.id || el.dataset.animKey;
  if (!id) { el.textContent = newVal; return; }
  const prev = _animCache[id];
  const numNew = parseFloat(String(newVal).replace(/[^0-9.\-]/g, ''));
  if (isNaN(numNew)) { el.textContent = newVal; return; }
  if (prev === undefined || isNaN(prev)) { _animCache[id] = numNew; el.textContent = newVal; return; }
  if (Math.abs(numNew - prev) < 0.00005) { _animCache[id] = numNew; return; }
  const numOld = prev;
  _animCache[id] = numNew;
  const prefix = String(newVal).match(/^[^0-9\-]*/)?.[0] || '';
  const suffix = String(newVal).match(/[^0-9.]*$/)?.[0] || '';
  const decMatch = String(newVal).match(/\.(\d+)/);
  const decimals = decMatch ? decMatch[1].length : 0;
  const showPlus = String(newVal).charAt(0) === '+' || (prefix.includes('+'));
  duration = duration || 400;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cur = numOld + (numNew - numOld) * ease;
    const sign = showPlus && cur >= 0 ? '+' : '';
    el.textContent = sign + prefix.replace('+', '') + cur.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function pushPnlHistory(val) {
  _pnlHistory.push({ ts: Date.now(), val: val });
  if (_pnlHistory.length > _PNL_HISTORY_MAX) _pnlHistory.shift();
}

function pushPnlHistory2(val) {
  _pnlHistory2.push({ ts: Date.now(), val: val });
  if (_pnlHistory2.length > _PNL_HISTORY_MAX) _pnlHistory2.shift();
}

function _drawSparklineFromHistory(canvasId, history) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || history.length < 2) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = 100, h = 30;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const vals = history.map(p => p.val);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 0.0001;
  const pad = 2;
  const chartH = h - pad * 2;
  const chartW = w - pad * 2;
  const last = vals[vals.length - 1];
  const lineColor = last >= 0 ? '#10b981' : '#ef4444';
  const fillColor = last >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const x = pad + (i / (vals.length - 1)) * chartW;
    const y = pad + chartH - ((vals[i] - min) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const lastX = pad + chartW;
  const lastY = pad + chartH - ((vals[vals.length - 1] - min) / range) * chartH;
  ctx.lineTo(lastX, h);
  ctx.lineTo(pad, h);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}

function drawPnlSparkline(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || _pnlHistory.length < 2) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = 100, h = 30;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const vals = _pnlHistory.map(p => p.val);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 0.0001;
  const pad = 2;
  const chartH = h - pad * 2;
  const chartW = w - pad * 2;
  const last = vals[vals.length - 1];
  const lineColor = last >= 0 ? '#10b981' : '#ef4444';
  const fillColor = last >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const x = pad + (i / (vals.length - 1)) * chartW;
    const y = pad + chartH - ((vals[i] - min) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const lastX = pad + chartW;
  const lastY = pad + chartH - ((vals[vals.length - 1] - min) / range) * chartH;
  ctx.lineTo(lastX, h);
  ctx.lineTo(pad, h);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}
let _lastFaviconStatus = null;

function updateFavicon(status) {
  if (status === _lastFaviconStatus) return;
  _lastFaviconStatus = status;
  let color, pulse;
  if (status === 'running') {
    color = '#10b981';
    pulse = '<animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/>';
  } else if (status === 'trading') {
    color = '#f59e0b';
    pulse = '<animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>';
  } else if (status === 'liquidating') {
    color = '#f59e0b';
    pulse = '<animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite"/>';
  } else {
    color = '#ef4444';
    pulse = '';
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='12' fill='${color}'>${pulse}</circle></svg>`;
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function formatKeyLabel(key) {
  const m = key.match(/^d(\d+)_Q(\d+)$/);
  if (!m) return key;
  const dir = parseInt(m[1]);
  const q = m[2];
  const a = cachedMarketA.split(':')[0];
  const b = cachedMarketB.split(':')[0];
  if (dir === 1) return `L ${a} / S ${b} $${q}`;
  return `L ${b} / S ${a} $${q}`;
}

function fmt(v, decimals) {
  if (v === null || v === undefined) return '--';
  return Number(v).toFixed(decimals);
}

function fmtBps(v) {
  if (v === null || v === undefined) return '--';
  const n = Number(v);
  const cls = n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral';
  return `<span class="${cls}">${n.toFixed(2)}</span>`;
}

function statusTag(status) {
  const map = {
    TRADEABLE: 'tradeable',
    EDGE_TOO_SMALL: 'edge-small',
    INSUFFICIENT_DEPTH: 'insufficient',
    TOO_MUCH_SLIPPAGE: 'slippage',
    TOO_MANY_LEVELS: 'slippage',
    SPIKE_TOO_SHORT: 'spike-short',
    SPIKE_ALREADY_FIRED: 'spike-short',
  };
  const cls = map[status] || 'neutral-tag';
  return `<span class="tag ${cls}">${status || '--'}</span>`;
}

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function switchView(view) {
  currentView = view;
  const panels = ['viewMain', 'viewSpreads', 'viewSuperbot', 'viewSbstats1', 'viewCharts', 'viewFarming', 'viewArchitecture'];
  const viewMap = { main: 'viewMain', spreads: 'viewSpreads', superbot: 'viewSuperbot', sbstats1: 'viewSbstats1', charts: 'viewCharts', farming: 'viewFarming', architecture: 'viewArchitecture' };
  panels.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === viewMap[view]) {
      el.style.display = '';
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
    } else {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  if (view === 'spreads') {
  }
  if (view === 'superbot') {
    pollSuperBot();
  }
  if (view === 'sbstats1') {
    pollSbStats(1);
  }
  if (view === 'charts') {
    _initChartPairSelect();
    refreshAllPairsCharts();
    refreshEdgeChart();
  }
  if (view === 'farming') {
    pollFarmingData();
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

async function closeDeployer(deployer) {
  if (!confirm(`Close ALL positions for deployer ${deployer.toUpperCase()}? This will force-close every open position across all ${deployer.toUpperCase()} bots.`)) return;
  try {
    const res = await safeFetchJson(`/supervisor/close-deployer/${deployer}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (res.error) {
      showToast(`Error closing ${deployer.toUpperCase()}: ${res.error}`, 'error');
      return;
    }
    const totalClosed = Object.values(res.closed || {}).reduce((a, b) => a + b, 0);
    const errCount = (res.errors || []).length;
    if (errCount > 0) {
      showToast(`${deployer.toUpperCase()}: ${totalClosed} positions closed, ${errCount} error(s)`, 'error');
    } else {
      showToast(`${deployer.toUpperCase()}: ${totalClosed} positions closed successfully`, 'success');
    }
  } catch (e) {
    showToast(`Failed to close ${deployer.toUpperCase()}: ${e.message}`, 'error');
  }
}

async function loadPairs(retryCount) {
  retryCount = retryCount || 0;
  try {
    const res = await fetch('/pairs');
    if (!res.ok) throw new Error('not ready');
    pairsList = await res.json();
  } catch (e) {
    pairsList = [];
  }
  if (pairsList.length === 0 && retryCount < 20) {
    setTimeout(() => loadPairs(retryCount + 1), 1000 + retryCount * 500);
    return;
  }
  if (currentView === 'spreads') {
    renderPairTabs();
    if (pairsList.length > 0 && !currentPairId) {
      switchPair(pairsList[0].id);
    }
  }
}

function renderPairTabs() {
  const container = document.getElementById('pairTabs');
  if (!container) return;
  container.innerHTML = '';
  for (const p of pairsList) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pair-tab-wrapper';

    const count = pairCounts[p.id] || 0;
    const badge = document.createElement('span');
    badge.className = `pair-tab-badge${count > 0 ? ' has-trades' : ''}`;
    badge.textContent = count > 0 ? count : '';
    badge.id = `badge-${p.id}`;
    if (count > 0) badge.title = `${count} repeg(s) complété(s)`;

    const btn = document.createElement('button');
    btn.className = `pair-tab${p.id === currentPairId ? ' active' : ''}`;
    if (p.growthModeA === false && p.growthModeB === false) {
      btn.innerHTML = p.label + ' <span style="font-size:9px;color:#ef4444;font-weight:700;" title="Les 2 legs non-growth">$$</span>';
    } else if (p.growthModeA === false || p.growthModeB === false) {
      btn.innerHTML = p.label + ' <span style="font-size:9px;color:#f59e0b;font-weight:700;" title="1 leg non-growth">$</span>';
    } else {
      btn.textContent = p.label;
    }
    btn.onclick = () => switchPair(p.id);

    wrapper.appendChild(badge);
    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  }
}

function switchPair(pairId) {
  currentPairId = pairId;
  renderPairTabs();
  spreadData = [];
  fullHistoryData = [];
  historyAutoScroll = true;
  signalsExpanded = false;
  repegExpanded = false;
  allSignals = [];
  allRepegCycles = [];
  poll();
  pollSpreadChart();
  pollFullHistory();
}

async function pollCounts() {
  try {
    const res = await fetch('/counts');
    pairCounts = await res.json();
    for (const p of pairsList) {
      const badge = document.getElementById(`badge-${p.id}`);
      if (badge) {
        const count = pairCounts[p.id] || 0;
        badge.textContent = count > 0 ? count : '';
        badge.className = `pair-tab-badge${count > 0 ? ' has-trades' : ''}`;
        badge.title = count > 0 ? `${count} repeg(s) complété(s)` : '';
      }
    }
  } catch (e) {}
}

function updateStatus(data) {
  const dotA = document.getElementById('dotA');
  const dotB = document.getElementById('dotB');
  const statusA = document.getElementById('statusA');
  const statusB = document.getElementById('statusB');

  dotA.className = `status-dot ${data.connectionA}`;
  dotB.className = `status-dot ${data.connectionB}`;
  statusA.textContent = `A: ${data.connectionA}`;
  statusB.textContent = `B: ${data.connectionB}`;

  document.getElementById('lastUpdate').textContent =
    data.lastComputed ? new Date(data.lastComputed).toLocaleTimeString() : '--';
}

function setValueWithShimmer(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  if (value === '--') {
    el.classList.add('shimmer');
  } else {
    el.classList.remove('shimmer');
  }
}

function updateMetrics(data) {
  const cfg = data.config || {};
  setValueWithShimmer('marketA', cfg.marketA || '--');
  setValueWithShimmer('marketB', cfg.marketB || '--');

  const m = data.metrics || {};
  setValueWithShimmer('midA', m.midA ? `$${fmt(m.midA, 4)}` : '--');
  setValueWithShimmer('midB', m.midB ? `$${fmt(m.midB, 4)}` : '--');

  if (cfg.takerFeeGrowth !== undefined) {
    const gBps = (cfg.takerFeeGrowth * 10000).toFixed(2);
    const ngBps = (cfg.takerFeeNoGrowth * 10000).toFixed(2);
    document.getElementById('takerFee').textContent = `G:${gBps} / NG:${ngBps} bps`;
  } else {
    document.getElementById('takerFee').textContent = '--';
  }
  document.getElementById('minEdgeOpen').textContent =
    cfg.minEdgeOpenBps !== undefined ? fmt(cfg.minEdgeOpenBps, 4) : '--';
  document.getElementById('minEdgeRT').textContent =
    cfg.minEdgeRoundTripBps !== undefined ? fmt(cfg.minEdgeRoundTripBps, 4) : '--';
  document.getElementById('safetySpread').textContent =
    cfg.safetySpreadBps !== undefined ? fmt(cfg.safetySpreadBps, 4) : '--';

  const pegD1El = document.getElementById('pegD1');
  const pegD2El = document.getElementById('pegD2');
  if (pegD1El) {
    pegD1El.textContent = '--';
  }
  if (pegD2El) {
    pegD2El.textContent = '--';
  }

  const opp = data.opportunityCounts || {};
  document.getElementById('oppCount').textContent =
    `${opp.total || 0} (L${cachedMarketA.split(':')[0]}/S${cachedMarketB.split(':')[0]}: ${opp.dir1 || 0}, L${cachedMarketB.split(':')[0]}/S${cachedMarketA.split(':')[0]}: ${opp.dir2 || 0})`;
}

function updateSpreadTable(data) {
  const body = document.getElementById('spreadBody');
  const m = data.metrics || {};
  const results = m.results || [];

  let html = '';
  for (const r of results) {
    for (const d of [r.dir1, r.dir2]) {
      const isTradeable = d.status === 'TRADEABLE';
      const rowClass = isTradeable ? 'opportunity' : '';
      const _a = cachedMarketA.split(':')[0];
      const _b = cachedMarketB.split(':')[0];
      const dirLabel = d.direction === 1
        ? `<span class="tag dir1">L ${_a} / S ${_b}</span>`
        : `<span class="tag dir2">L ${_b} / S ${_a}</span>`;

      const hasVwap = d.buyVWAP !== undefined && d.buyVWAP !== null;
      const capIcon = d.capacityOk ? '<span class="positive">YES</span>' : '<span class="negative">NO</span>';

      html += `<tr class="${rowClass}">
        <td>$${r.Q}</td>
        <td>${dirLabel}</td>
        <td>${hasVwap ? '$' + fmt(d.buyVWAP, 4) : '--'}</td>
        <td>${hasVwap ? '$' + fmt(d.sellVWAP, 4) : '--'}</td>
        <td>${hasVwap ? fmtBps(d.grossOpenEdgeBps) : '--'}</td>
        <td>${hasVwap ? fmt(d.feeOpenBps, 2) : '--'}</td>
        <td>${hasVwap ? fmtBps(d.netOpenEdgeBps) : '--'}</td>
        <td>${hasVwap ? fmtBps(d.netRoundTripBps) : '--'}</td>
        <td>${capIcon}</td>
        <td>${hasVwap ? fmt(d.buySlippageBps, 2) : '--'}</td>
        <td>${hasVwap ? fmt(d.sellSlippageBps, 2) : '--'}</td>
        <td>${d.levelsConsumedBuy || '-'}/${d.levelsConsumedSell || '-'}</td>
        <td>${d.spikeDurationMs !== undefined ? d.spikeDurationMs : '--'}</td>
        <td>${statusTag(d.status)}</td>
      </tr>`;
    }
  }

  body.innerHTML = html || '<tr><td colspan="14" style="text-align:center;color:#4a5a6a">Waiting for data...</td></tr>';
}

function updateDislocationStats(stats) {
  const body = document.getElementById('dislocBody');
  if (!stats || Object.keys(stats).length === 0) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#4a5a6a">Collecting data...</td></tr>';
    return;
  }

  let html = '';
  const keys = Object.keys(stats).sort();
  for (const key of keys) {
    const s = stats[key];
    const label = formatKeyLabel(key);
    html += `<tr>
      <td><span class="tag ${key.startsWith('d1') ? 'dir1' : 'dir2'}">${label}</span></td>
      <td>${fmtBps(s.max1m)}</td>
      <td>${fmtBps(s.max5m)}</td>
      <td>${fmtBps(s.max1h)}</td>
      <td>${fmt(s.p90, 2)}</td>
      <td>${fmtBps(s.p95)}</td>
      <td>${fmtBps(s.p99)}</td>
    </tr>`;
  }
  body.innerHTML = html;
}

function updateRepegStats(repegStats) {
  if (!repegStats) return;
  document.getElementById('repegOpened').textContent = repegStats.totalOpened || 0;

  const completedEl = document.getElementById('repegCompleted');
  completedEl.textContent = repegStats.totalRepegged || 0;
  completedEl.className = `repeg-value ${repegStats.totalRepegged > 0 ? 'positive' : ''}`;

  const failedEl = document.getElementById('repegFailed');
  failedEl.textContent = repegStats.totalFailedLiquidity || 0;
  failedEl.className = `repeg-value ${repegStats.totalFailedLiquidity > 0 ? 'negative' : ''}`;

  document.getElementById('repegPending').textContent = repegStats.pendingOpen || 0;

  const rateEl = document.getElementById('repegRate');
  rateEl.textContent = `${repegStats.successRate || 0}%`;
  rateEl.className = `repeg-value ${repegStats.successRate >= 50 ? 'positive' : repegStats.successRate > 0 ? 'neutral' : ''}`;

  const pnlEl = document.getElementById('repegPnl');
  pnlEl.textContent = fmt(repegStats.theoreticalPnlBps, 2);
  pnlEl.className = `repeg-value ${repegStats.theoreticalPnlBps > 0 ? 'positive' : repegStats.theoreticalPnlBps < 0 ? 'negative' : ''}`;

  const avgEl = document.getElementById('repegAvgPnl');
  avgEl.textContent = fmt(repegStats.avgPnlBps, 2);
  avgEl.className = `repeg-value ${repegStats.avgPnlBps > 0 ? 'positive' : repegStats.avgPnlBps < 0 ? 'negative' : ''}`;

  document.getElementById('repegVolume').textContent = `$${(repegStats.totalVolumeUsd || 0).toLocaleString()}`;
  const cpmVal = repegStats.cpmUsd || 0;
  const cpmEl = document.getElementById('repegCpm');
  cpmEl.textContent = `$${fmt(cpmVal, 2)}`;
  cpmEl.className = `repeg-value ${cpmVal > 0 ? 'positive' : cpmVal < 0 ? 'negative' : ''}`;

  drawRepegChart(repegStats.cyclesByHour || {});
}

function drawSpreadLiveChart(data, config) {
  const canvas = document.getElementById('spreadLiveChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  const chartHeight = rect.height || 320;
  canvas.height = chartHeight * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = chartHeight + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = chartHeight;
  const pad = { top: 15, right: 60, bottom: 25, left: 50 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, w, h);

  if (!data || data.length === 0) {
    ctx.fillStyle = '#5a6a80';
    ctx.font = '13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Collecting spread data...', w / 2, h / 2);
    return;
  }

  const a = cachedMarketA.split(':')[0];
  const b = cachedMarketB.split(':')[0];

  const allVals = data.flatMap(d => [d.dir1, d.dir2]);
  const autoMin = Math.min(...allVals, 0);
  const autoMax = Math.max(...allVals, 5);
  const autoRange = autoMax - autoMin || 1;

  const userMin = parseFloat(document.getElementById('spreadYMin').value);
  const userMax = parseFloat(document.getElementById('spreadYMax').value);
  const yMin = isNaN(userMin) ? autoMin - autoRange * 0.1 : userMin;
  const yMax = isNaN(userMax) ? autoMax + autoRange * 0.1 : userMax;
  const yRange = yMax - yMin || 1;

  function toX(i) { return pad.left + (i / (data.length - 1 || 1)) * chartW; }
  function toY(v) { return pad.top + (1 - (v - yMin) / yRange) * chartH; }

  const thresholds = [];
  if (config) {
    const feeRT = config.feeRoundTripBps || 3.28;
    const minEdge = config.minEdgeOpenBps || 3.64;
    const safety = config.safetySpreadBps || 0;
    const closeThreshold = config.repegCloseThresholdBps ?? 1.0;
    thresholds.push(
      { val: 0, label: '0', color: '#3a4a5a', dash: [2, 4] },
      { val: closeThreshold, label: `Close ${closeThreshold.toFixed(1)}`, color: '#8b5cf6', dash: [8, 4] },
      { val: feeRT, label: `Fee RT ${feeRT.toFixed(1)}`, color: '#ef4444', dash: [6, 4] },
      { val: minEdge, label: `Min Edge ${minEdge.toFixed(1)}`, color: '#f59e0b', dash: [4, 4] },
    );
    if (safety > 0) {
      thresholds.push({ val: minEdge + safety, label: `+Safety ${(minEdge + safety).toFixed(1)}`, color: '#10b981', dash: [6, 3] });
    }
  }

  ctx.strokeStyle = '#1c2538';
  ctx.lineWidth = 0.5;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const val = yMin + (yRange * i) / yTicks;
    const y = toY(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#5a6a80';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), pad.left - 5, y + 3);
  }

  for (const t of thresholds) {
    const y = toY(t.val);
    if (y < pad.top || y > pad.top + chartH) continue;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(t.dash);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = t.color;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.label, pad.left + chartW + 4, y + 3);
  }

  const curves = [
    { key: 'dir1', color: '#10b981', label: `L ${a} / S ${b}` },
    { key: 'dir2', color: '#3b82f6', label: `L ${b} / S ${a}` },
  ];

  for (const curve of curves) {
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = toX(i);
      const y = toY(data[i][curve.key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (data.length > 0) {
    const last = data[data.length - 1];
    for (const curve of curves) {
      const val = last[curve.key];
      const ly = toY(val);
      ctx.fillStyle = curve.color;
      ctx.beginPath();
      ctx.arc(toX(data.length - 1), ly, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), toX(data.length - 1) - 8, ly - 8);
    }
  }

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  const legendY = pad.top + 14;
  ctx.fillStyle = curves[0].color;
  ctx.fillRect(pad.left + 5, legendY - 7, 16, 4);
  ctx.fillText(curves[0].label, pad.left + 26, legendY);
  ctx.fillStyle = curves[1].color;
  ctx.fillRect(pad.left + 5, legendY + 12, 16, 4);
  ctx.fillText(curves[1].label, pad.left + 26, legendY + 19);

  const elapsed = data.length > 1 ? (data[data.length - 1].ts - data[0].ts) / 1000 : 0;
  ctx.fillStyle = '#4a5a6a';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(elapsed)}s`, w / 2, h - 3);
}

function drawFullHistoryChart(data, config) {
  const canvas = document.getElementById('spreadHistoryChart');
  const container = document.getElementById('historyScrollContainer');
  if (!canvas || !container) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const containerWidth = container.clientWidth;
  const h = 280;

  if (!data || data.length < 2) {
    canvas.width = containerWidth * dpr;
    canvas.height = h * dpr;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerWidth, h);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, containerWidth, h);
    ctx.fillStyle = '#5a6a80';
    ctx.font = '13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Collecting full spread history...', containerWidth / 2, h / 2);
    return;
  }

  const PX_PER_SAMPLE = 2;
  const minChartWidth = containerWidth;
  const dataWidth = Math.max(minChartWidth, data.length * PX_PER_SAMPLE);

  const pad = { top: 15, right: 60, bottom: 30, left: 50 };
  const totalWidth = dataWidth + pad.left + pad.right;
  const chartW = totalWidth - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  canvas.width = totalWidth * dpr;
  canvas.height = h * dpr;
  canvas.style.width = totalWidth + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, totalWidth, h);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, totalWidth, h);

  const a = cachedMarketA.split(':')[0];
  const b = cachedMarketB.split(':')[0];

  const allVals = data.flatMap(d => [d.dir1, d.dir2]);
  const autoMin = Math.min(...allVals, 0);
  const autoMax = Math.max(...allVals, 5);
  const autoRange = autoMax - autoMin || 1;

  const userMin = parseFloat(document.getElementById('histYMin').value);
  const userMax = parseFloat(document.getElementById('histYMax').value);
  const yMin = isNaN(userMin) ? autoMin - autoRange * 0.1 : userMin;
  const yMax = isNaN(userMax) ? autoMax + autoRange * 0.1 : userMax;
  const yRange = yMax - yMin || 1;

  function toX(i) { return pad.left + (i / (data.length - 1 || 1)) * chartW; }
  function toY(v) { return pad.top + (1 - (v - yMin) / yRange) * chartH; }

  const thresholds = [];
  if (config) {
    const feeRT = config.feeRoundTripBps || 3.28;
    const minEdge = config.minEdgeOpenBps || 3.64;
    const safety = config.safetySpreadBps || 0;
    const closeThreshold = config.repegCloseThresholdBps ?? 1.0;
    thresholds.push(
      { val: 0, label: '0', color: '#3a4a5a', dash: [2, 4] },
      { val: closeThreshold, label: `Close ${closeThreshold.toFixed(1)}`, color: '#8b5cf6', dash: [8, 4] },
      { val: feeRT, label: `Fee RT ${feeRT.toFixed(1)}`, color: '#ef4444', dash: [6, 4] },
      { val: minEdge, label: `Min Edge ${minEdge.toFixed(1)}`, color: '#f59e0b', dash: [4, 4] },
    );
    if (safety > 0) {
      thresholds.push({ val: minEdge + safety, label: `+Safety ${(minEdge + safety).toFixed(1)}`, color: '#10b981', dash: [6, 3] });
    }
  }

  ctx.strokeStyle = '#1c2538';
  ctx.lineWidth = 0.5;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const val = yMin + (yRange * i) / yTicks;
    const y = toY(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#5a6a80';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), pad.left - 5, y + 3);
  }

  for (const t of thresholds) {
    const y = toY(t.val);
    if (y < pad.top || y > pad.top + chartH) continue;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(t.dash);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = t.color;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.label, pad.left + chartW + 4, y + 3);
  }

  const timeSpan = data[data.length - 1].ts - data[0].ts;
  let tickIntervalMs;
  if (timeSpan < 300000) tickIntervalMs = 30000;
  else if (timeSpan < 1800000) tickIntervalMs = 300000;
  else if (timeSpan < 7200000) tickIntervalMs = 600000;
  else tickIntervalMs = 3600000;

  const firstTick = Math.ceil(data[0].ts / tickIntervalMs) * tickIntervalMs;
  ctx.fillStyle = '#5a6a80';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#1c2538';
  ctx.lineWidth = 0.5;
  for (let t = firstTick; t <= data[data.length - 1].ts; t += tickIntervalMs) {
    const idx = data.findIndex(d => d.ts >= t);
    if (idx < 0) continue;
    const x = toX(idx);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartH);
    ctx.stroke();
    const d = new Date(t);
    ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h - 5);
  }

  const curves = [
    { key: 'dir1', color: '#10b981', label: `L ${a} / S ${b}` },
    { key: 'dir2', color: '#3b82f6', label: `L ${b} / S ${a}` },
  ];

  for (const curve of curves) {
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = toX(i);
      const y = toY(data[i][curve.key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (data.length > 0) {
    const last = data[data.length - 1];
    for (const curve of curves) {
      const val = last[curve.key];
      const ly = toY(val);
      ctx.fillStyle = curve.color;
      ctx.beginPath();
      ctx.arc(toX(data.length - 1), ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), toX(data.length - 1) - 6, ly - 6);
    }
  }

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  const legendY = pad.top + 14;
  ctx.fillStyle = curves[0].color;
  ctx.fillRect(pad.left + 5, legendY - 7, 14, 3);
  ctx.fillText(curves[0].label, pad.left + 24, legendY);
  ctx.fillStyle = curves[1].color;
  ctx.fillRect(pad.left + 5, legendY + 10, 14, 3);
  ctx.fillText(curves[1].label, pad.left + 24, legendY + 17);

  const elapsedSec = timeSpan / 1000;
  const infoEl = document.getElementById('histInfo');
  if (infoEl) {
    const mins = Math.floor(elapsedSec / 60);
    const hrs = Math.floor(mins / 60);
    const durStr = hrs > 0 ? `${hrs}h${mins % 60}m` : `${mins}m`;
    infoEl.textContent = `${data.length} samples | ${durStr}`;
  }

  if (historyAutoScroll) {
    container.scrollLeft = container.scrollWidth;
  }
}

function drawRepegChart(cyclesByHour) {
  const canvas = document.getElementById('repegChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 160 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '160px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 160;
  ctx.clearRect(0, 0, w, h);

  const hours = Object.keys(cyclesByHour).sort();
  if (hours.length === 0) {
    ctx.fillStyle = '#4a5a6a';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('En attente de cycles repeg...', w / 2, h / 2);
    return;
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const values = hours.map(hr => cyclesByHour[hr]);
  const maxRepegged = Math.max(1, ...values.map(v => v.repegged + v.failed));

  const barWidth = Math.max(8, Math.min(40, chartW / hours.length - 4));

  ctx.strokeStyle = '#1e2a3a';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  hours.forEach((hr, i) => {
    const v = values[i];
    const x = padding.left + (i + 0.5) * (chartW / hours.length);

    const repegH = (v.repegged / maxRepegged) * chartH * 0.8;
    const failH = (v.failed / maxRepegged) * chartH * 0.8;

    ctx.fillStyle = '#10b981';
    ctx.fillRect(x - barWidth / 2, padding.top + chartH - repegH - failH, barWidth * 0.48, repegH);

    if (v.failed > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 2, padding.top + chartH - failH, barWidth * 0.48, failH);
    }

    ctx.fillStyle = '#5a6a80';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(hr.slice(11) + 'h', x, h - 5);

    if (v.repegged + v.failed > 0) {
      ctx.fillStyle = '#e8edf5';
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillText(v.repegged + v.failed, x, padding.top + chartH - repegH - failH - 4);
    }
  });

  ctx.fillStyle = '#5a6a80';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    const val = Math.round(maxRepegged * (1 - i / 4));
    ctx.fillText(val, padding.left - 5, y + 4);
  }

  ctx.fillStyle = '#10b981';
  ctx.fillRect(w - 160, 5, 10, 10);
  ctx.fillStyle = '#e8edf5';
  ctx.font = '10px "Inter", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Repegs', w - 146, 14);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(w - 90, 5, 10, 10);
  ctx.fillStyle = '#e8edf5';
  ctx.fillText('Echecs', w - 76, 14);
}

function renderRepegRow(c) {
  const a = cachedMarketA.split(':')[0];
  const b = cachedMarketB.split(':')[0];
  const dirLabel = c.direction === 1 ? `L ${a} / S ${b}` : `L ${b} / S ${a}`;
  const dirTag = c.direction === 1
    ? `<span class="tag dir1">${dirLabel}</span>`
    : `<span class="tag dir2">${dirLabel}</span>`;

  const liqTag = c.closeLiquidityOk
    ? '<span class="positive">OK</span>'
    : '<span class="negative">FAIL</span>';

  const resultTag = c.success
    ? '<span class="tag tradeable">PROFIT</span>'
    : '<span class="tag insufficient">PERTE</span>';

  return `<tr class="${c.success ? 'opportunity' : ''}">
    <td>${new Date(c.openTs).toLocaleTimeString()}</td>
    <td>${new Date(c.closeTs).toLocaleTimeString()}</td>
    <td>${dirTag}</td>
    <td>$${c.Q}</td>
    <td>${fmtDuration(c.durationMs)}</td>
    <td>${fmtBps(c.openGrossEdgeBps)}</td>
    <td>${fmtBps(c.closeGrossEdgeBps)}</td>
    <td>${fmtBps(c.theoreticalPnlBps)}</td>
    <td>${liqTag}</td>
    <td>${resultTag}</td>
  </tr>`;
}

function updateRepegCycles(cycles) {
  const body = document.getElementById('repegBody');
  const btn = document.getElementById('repegExpandBtn');
  if (!cycles || cycles.length === 0) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#4a5a6a">Aucun cycle repeg pour le moment</td></tr>';
    btn.style.display = 'none';
    return;
  }

  allRepegCycles = [...cycles].reverse();
  const PREVIEW_COUNT = 5;
  const showAll = repegExpanded;
  const toShow = showAll ? allRepegCycles : allRepegCycles.slice(0, PREVIEW_COUNT);

  body.innerHTML = toShow.map(renderRepegRow).join('');

  if (allRepegCycles.length > PREVIEW_COUNT) {
    btn.style.display = 'inline-flex';
    const arrow = btn.querySelector('.arrow');
    const text = btn.querySelector('.expand-text');
    if (showAll) {
      arrow.className = 'arrow open';
      text.textContent = 'Masquer';
    } else {
      arrow.className = 'arrow';
      text.textContent = `Voir tout (${allRepegCycles.length})`;
    }
  } else {
    btn.style.display = 'none';
  }
}

function renderSignalRow(s) {
  const _sa = cachedMarketA.split(':')[0];
  const _sb = cachedMarketB.split(':')[0];
  const dirTag = s.direction === 1
    ? `<span class="tag dir1">L ${_sa} / S ${_sb}</span>`
    : `<span class="tag dir2">L ${_sb} / S ${_sa}</span>`;

  return `<tr class="opportunity">
    <td>${new Date(s.ts).toLocaleTimeString()}</td>
    <td>${dirTag}</td>
    <td>$${s.Q}</td>
    <td>${fmtBps(s.grossOpenEdgeBps)}</td>
    <td>${fmtBps(s.netOpenEdgeBps)}</td>
    <td>${fmt(s.buySlippageBps, 2)}</td>
    <td>${fmt(s.sellSlippageBps, 2)}</td>
    <td>${s.spikeDurationMs}</td>
  </tr>`;
}

function updateSignals(signals) {
  const body = document.getElementById('signalsBody');
  const btn = document.getElementById('signalsExpandBtn');
  if (!signals || signals.length === 0) {
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#4a5a6a">No TRADEABLE signals yet</td></tr>';
    btn.style.display = 'none';
    return;
  }

  allSignals = [...signals].reverse();
  const PREVIEW_COUNT = 5;
  const showAll = signalsExpanded;
  const toShow = showAll ? allSignals : allSignals.slice(0, PREVIEW_COUNT);

  body.innerHTML = toShow.map(renderSignalRow).join('');

  if (allSignals.length > PREVIEW_COUNT) {
    btn.style.display = 'inline-flex';
    const arrow = btn.querySelector('.arrow');
    const text = btn.querySelector('.expand-text');
    if (showAll) {
      arrow.className = 'arrow open';
      text.textContent = 'Masquer';
    } else {
      arrow.className = 'arrow';
      text.textContent = `Voir tout (${allSignals.length})`;
    }
  } else {
    btn.style.display = 'none';
  }
}

async function poll() {
  return;
  try {
    const [stateRes, logsRes] = await Promise.all([
      fetch(`/state/${currentPairId}`),
      fetch(`/logs/${currentPairId}?n=50`),
    ]);
    const state = await stateRes.json();
    const logs = await logsRes.json();

    if (state.config) {
      cachedMarketA = state.config.marketA || cachedMarketA;
      cachedMarketB = state.config.marketB || cachedMarketB;
      cachedConfig = state.config;
    }
    updateStatus(state);
    updateMetrics(state);
    updateSpreadTable(state);
    updateDislocationStats(state.dislocationStats);
    updateRepegStats(state.repegStats);
    updateRepegCycles(state.recentCycles);
    updateSignals(logs);
  } catch (e) {
    console.error('Poll error:', e);
  }
}

async function pollSpreadChart() {
  return;
  try {
    const res = await fetch(`/spread-history/${currentPairId}?n=600`);
    spreadData = await res.json();
    drawSpreadLiveChart(spreadData, cachedConfig);
  } catch (e) {}
}

async function pollFullHistory() {
  return;
  try {
    const res = await fetch(`/spread-history/${currentPairId}?n=36000`);
    fullHistoryData = await res.json();
    drawFullHistoryChart(fullHistoryData, cachedConfig);
  } catch (e) {}
}

if (document.getElementById('spreadResetScale')) {
  document.getElementById('spreadResetScale').addEventListener('click', () => {
    document.getElementById('spreadYMin').value = '';
    document.getElementById('spreadYMax').value = '';
  });
}

if (document.getElementById('histResetScale')) {
  document.getElementById('histResetScale').addEventListener('click', () => {
    document.getElementById('histYMin').value = '';
    document.getElementById('histYMax').value = '';
  });
}

if (document.getElementById('signalsExpandBtn')) {
  document.getElementById('signalsExpandBtn').addEventListener('click', () => {
    signalsExpanded = !signalsExpanded;
    const body = document.getElementById('signalsBody');
    const btn = document.getElementById('signalsExpandBtn');
    const PREVIEW_COUNT = 5;
    const toShow = signalsExpanded ? allSignals : allSignals.slice(0, PREVIEW_COUNT);
    body.innerHTML = toShow.map(renderSignalRow).join('');
    const arrow = btn.querySelector('.arrow');
    const text = btn.querySelector('.expand-text');
    if (signalsExpanded) {
      arrow.className = 'arrow open';
      text.textContent = 'Masquer';
    } else {
      arrow.className = 'arrow';
      text.textContent = `Voir tout (${allSignals.length})`;
    }
  });
}

if (document.getElementById('repegExpandBtn')) {
  document.getElementById('repegExpandBtn').addEventListener('click', () => {
    repegExpanded = !repegExpanded;
    const body = document.getElementById('repegBody');
    const btn = document.getElementById('repegExpandBtn');
    const PREVIEW_COUNT = 5;
    const toShow = repegExpanded ? allRepegCycles : allRepegCycles.slice(0, PREVIEW_COUNT);
    body.innerHTML = toShow.map(renderRepegRow).join('');
    const arrow = btn.querySelector('.arrow');
    const text = btn.querySelector('.expand-text');
    if (repegExpanded) {
      arrow.className = 'arrow open';
      text.textContent = 'Masquer';
    } else {
      arrow.className = 'arrow';
      text.textContent = `Voir tout (${allRepegCycles.length})`;
    }
  });
}

const histContainer = document.getElementById('historyScrollContainer');
if (histContainer) {
  histContainer.addEventListener('scroll', () => {
    const atEnd = histContainer.scrollLeft + histContainer.clientWidth >= histContainer.scrollWidth - 20;
    historyAutoScroll = atEnd;
  });
}

async function pollOverview() {
  if (currentView !== 'main') return;
  if (pairsList.length === 0) loadPairs();

  if (!_pnlHistoryLoaded) {
    _pnlHistoryLoaded = true;
    try {
      const dailyRes = await fetch('/bot/daily-stats');
      const dailyData = await dailyRes.json();
      if (dailyData && dailyData.length > 0) {
        const sorted = dailyData.slice().sort((a, b) => a.date.localeCompare(b.date));
        let cumPnl = 0;
        for (const day of sorted) {
          cumPnl += (day.pnl_net || 0);
          pushPnlHistory(cumPnl);
        }
      }
    } catch (e) {}
  }

  try {
    const fetches = [
      fetch('/bot/status').catch(() => null),
      fetch('/wallet/balances').catch(() => null),
    ];
    if (bot2Available) {
      fetches.push(fetch('/bot2/status').catch(() => null));
      fetches.push(fetch('/bot2/wallet/balances').catch(() => null));
    }
    if (bot3Available) {
      fetches.push(fetch('/bot3/status').catch(() => null));
      fetches.push(fetch('/bot3/wallet/balances').catch(() => null));
    }
    if (bot4Available) {
      fetches.push(fetch('/bot4/status').catch(() => null));
      fetches.push(fetch('/bot4/wallet/balances').catch(() => null));
    }
    if (bot5Available) {
      fetches.push(fetch('/bot5/status').catch(() => null));
      fetches.push(fetch('/bot5/wallet/balances').catch(() => null));
    }
    if (bot6Available) {
      fetches.push(fetch('/bot6/status').catch(() => null));
      fetches.push(fetch('/bot6/wallet/balances').catch(() => null));
    }
    const results = await Promise.all(fetches);
    const _sj = async (r) => { try { return r ? await r.json() : null; } catch (_) { return null; } };

    const bot1Data = await _sj(results[0]);
    const bot1Wallet = await _sj(results[1]);
    let idx = 2;
    const bot2Data = bot2Available ? await _sj(results[idx++]) : null;
    const bot2Wallet = bot2Available ? await _sj(results[idx++]) : null;
    const bot3Data = bot3Available ? await _sj(results[idx++]) : null;
    const bot3Wallet = bot3Available ? await _sj(results[idx++]) : null;
    const bot4Data = bot4Available ? await _sj(results[idx++]) : null;
    const bot4Wallet = bot4Available ? await _sj(results[idx++]) : null;
    const bot5Data = bot5Available ? await _sj(results[idx++]) : null;
    const bot5Wallet = bot5Available ? await _sj(results[idx++]) : null;
    const bot6Data = bot6Available ? await _sj(results[idx++]) : null;
    const bot6Wallet = bot6Available ? await _sj(results[idx++]) : null;

    const allBots = [bot1Data, bot2Data, bot3Data, bot4Data, bot5Data, bot6Data].filter(Boolean);
    if (allBots.length === 0) return;

    let totOpen = 0, totClosed = 0, totPnl = 0, totFees = 0, totErrCost = 0, totFundNet = 0, totErrors = 0, totWins = 0, totTrades = 0;
    let totOrphanCost = 0, totOrphanCount = 0;
    let anyEnabled = false, anyLiquidating = false, anyInitialized = false;
    let activeBotCount = 0;

    for (const bot of allBots) {
      const ls = bot.liveStats || {};
      totOpen += (ls.open || ls.openTrades || 0);
      totClosed += (ls.closed || 0);
      totPnl += (ls.totalPnlUsd || 0);
      totFees += (ls.totalFeesUsd || 0);
      totErrCost += (ls.allErrorCostUsd || 0) + (ls.dnAdjustmentCostUsd || 0);
      totOrphanCost += (ls.orphanCostUsd || 0) + (ls.totalErrorCostUsd || 0);
      totOrphanCount += (ls.orphanCount || 0);
      totFundNet += (ls.fundingNet || ls.walletFunding || 0);
      totErrors += (ls.errors || 0);
      totWins += (ls.wins || 0);
      totTrades += (ls.totalTrades || ls.closed || 0);
      if (bot.enabled) { anyEnabled = true; activeBotCount++; }
      if (bot.liquidationMode) anyLiquidating = true;
      if (bot.initialized) anyInitialized = true;
    }

    const ovPnlNet = totPnl - totFees - totErrCost + totFundNet;
    const ovPnl = document.getElementById('ovPnl');
    const ovPnlText = `${ovPnlNet >= 0 ? '+' : ''}$${ovPnlNet.toFixed(4)}`;
    animateValue(ovPnl, ovPnlText, 500);
    ovPnl.className = 'overview-stat-value ' + (ovPnlNet >= 0 ? 'positive' : 'negative');

    const grossPnlVal = totPnl + totFundNet;
    const ovGrossPnlEl = document.getElementById('ovGrossPnl');
    if (ovGrossPnlEl) {
      animateValue(ovGrossPnlEl, `${grossPnlVal >= 0 ? '+' : ''}$${grossPnlVal.toFixed(4)}`, 400);
      ovGrossPnlEl.className = 'overview-stat-value ' + (grossPnlVal >= 0 ? 'positive' : 'negative');
    }

    const ovOrphanCostEl = document.getElementById('ovOrphanCost');
    if (ovOrphanCostEl) {
      animateValue(ovOrphanCostEl, totOrphanCost > 0 ? `-$${totOrphanCost.toFixed(4)}` : '$0.0000', 400);
      if (totOrphanCost > 0) ovOrphanCostEl.className = 'overview-stat-value negative';
    }

    const ovOrphanCountEl = document.getElementById('ovOrphanCount');
    if (ovOrphanCountEl) {
      animateValue(ovOrphanCountEl, String(totOrphanCount), 300);
      if (totOrphanCount > 0) ovOrphanCountEl.className = 'overview-stat-value negative';
    }

    pushPnlHistory(ovPnlNet);
    drawPnlSparkline('ovPnlSparkline');
    drawPnlSparkline('botPnlSparkline');

    animateValue(document.getElementById('ovOpen'), String(totOpen), 300);
    animateValue(document.getElementById('ovClosed'), String(totClosed), 300);
    const winRate = totTrades > 0 ? Math.round((totWins / totTrades) * 100) : 0;
    document.getElementById('ovWinRate').textContent = totTrades > 0 ? winRate + '%' : '--%';
    animateValue(document.getElementById('ovFees'), `$${totFees.toFixed(4)}`, 400);
    document.getElementById('ovErrors').textContent = totErrors + (totErrCost > 0 ? ` (-$${totErrCost.toFixed(4)})` : '');

    const ovDot = document.getElementById('overviewBotDot');
    const ovStatus = document.getElementById('overviewBotStatus');
    const totalConfigured = [true, bot2Available, bot3Available, bot4Available, bot5Available, bot6Available].filter(Boolean).length;
    const botCountLabel = ` \u00B7 ${activeBotCount}/${totalConfigured} bots`;
    if (anyEnabled && anyLiquidating) {
      ovDot.className = 'status-dot liquidating';
      ovStatus.textContent = 'LIQUIDATION' + botCountLabel;
      ovStatus.style.color = '#f59e0b';
    } else if (anyEnabled) {
      ovDot.className = 'status-dot connected';
      ovStatus.textContent = 'ACTIVE' + botCountLabel;
      ovStatus.style.color = '#10b981';
    } else {
      ovDot.className = 'status-dot disconnected';
      ovStatus.textContent = (anyInitialized ? 'STOPPED' : 'NOT INIT') + botCountLabel;
      ovStatus.style.color = anyInitialized ? '#f59e0b' : '#ef4444';
    }

    if (anyEnabled && anyLiquidating) {
      updateFavicon('liquidating');
    } else if (anyEnabled && totOpen > 0) {
      updateFavicon('trading');
    } else if (anyEnabled) {
      updateFavicon('running');
    } else {
      updateFavicon('stopped');
    }

    const allWallets = [bot1Wallet, bot2Wallet, bot3Wallet, bot4Wallet, bot5Wallet, bot6Wallet].filter(Boolean);
    if (allWallets.length > 0) {
      let sumUsdc = 0, sumUsdt = 0, sumUsdh = 0;
      for (const w of allWallets) {
        sumUsdc += (w.usdc || 0);
        sumUsdt += (w.usdt || 0);
        sumUsdh += (w.usdh || 0);
      }
      const fmt2 = v => v === 0 ? '0.00' : Number(v).toFixed(2);
      document.getElementById('ovBalUSDC').textContent = fmt2(sumUsdc);
      document.getElementById('ovBalUSDT').textContent = fmt2(sumUsdt);
      document.getElementById('ovBalUSDH').textContent = fmt2(sumUsdh);
    }
  } catch (e) {
    console.error('Overview poll error:', e);
  }
}

async function pollOverviewActivity() {
  if (currentView !== 'main') return;
  try {
    const actFetches = [fetch('/bot/activity?n=30').catch(() => null)];
    if (bot2Available) actFetches.push(fetch('/bot2/activity?n=30').catch(() => null));
    if (bot3Available) actFetches.push(fetch('/bot3/activity?n=30').catch(() => null));
    if (bot4Available) actFetches.push(fetch('/bot4/activity?n=30').catch(() => null));
    if (bot5Available) actFetches.push(fetch('/bot5/activity?n=30').catch(() => null));
    if (bot6Available) actFetches.push(fetch('/bot6/activity?n=30').catch(() => null));
    const actResults = await Promise.all(actFetches);
    const botLabels = ['Bot1', 'Bot2'];
    if (bot3Available) botLabels.push('Bot3');
    if (bot4Available) botLabels.push('Bot4');
    if (bot5Available) botLabels.push('Bot5');
    if (bot6Available) botLabels.push('Bot6');
    let entries = [];
    for (let i = 0; i < actResults.length; i++) {
      try {
        if (!actResults[i]) continue;
        const data = await actResults[i].json();
        if (Array.isArray(data)) {
          data.forEach(e => { e._botLabel = botLabels[i] || ''; });
          entries = entries.concat(data);
        }
      } catch (_) {}
    }
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    entries = entries.slice(0, 30);
    const feed = document.getElementById('overviewActivityFeed');
    if (!feed) return;
    if (!entries || entries.length === 0) {
      feed.innerHTML = '<div class="activity-empty">En attente de signaux...</div>';
      return;
    }
    const visibleTypes = _getVisibleTypes();
    const filtered = entries.filter(e => visibleTypes.has(e.type));
    const typeCounts = {};
    entries.forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
    _updateActivityFilterCounts(typeCounts);
    if (filtered.length === 0) {
      feed.innerHTML = '<div class="activity-empty">Aucun \u00E9v\u00E9nement pour ces filtres</div>';
      return;
    }
    const showBotLabel = (bot2Available || bot3Available || bot4Available || bot5Available || bot6Available);
    feed.innerHTML = filtered.map(e => {
      const time = new Date(e.ts).toLocaleTimeString();
      const pairLabel = (pairsList.find(p => p.id === e.pairId) || {}).label || e.pairId || '';
      const botTag = showBotLabel && e._botLabel ? `<span class="act-bot-tag" style="font-size:9px;color:var(--text-muted);margin-right:3px;">[${e._botLabel}]</span>` : '';
      const dirBadge = e.direction === 1 ? '<span class="dir-badge dir-d1">\u2212</span>' : e.direction === 2 ? '<span class="dir-badge dir-d2">+</span>' : '';
      if (e.type === 'filled') {
        if (e.id && e.id > _lastSeenFillId) { _lastSeenFillId = e.id; playAlertSound('fill'); }
        const latStr = e.latencyMs ? `<span class="act-lat">${e.latencyMs}ms</span>` : '';
        const edgeStr = e.edgeBps != null ? `<span class="act-edge">${e.edgeBps.toFixed(1)}bps</span>` : '';
        const zStr = (e.kalmanZ != null) ? `<span class="act-z">kZ=${e.kalmanZ.toFixed(2)}</span>` : '';
        return `<div class="activity-row act-fill">
          <span class="act-badge act-fill-badge">FILL</span>
          <span class="act-time">${time}</span>
          ${botTag}${dirBadge}
          <span class="act-pair">${pairLabel}</span>
          ${edgeStr}${zStr}${latStr}
          <span class="act-detail">${e.detail || ''}</span>
        </div>`;
      }
      if (e.type === 'win') {
        return `<div class="activity-row act-win">
          <span class="act-badge act-win-badge">WIN</span>
          <span class="act-time">${time}</span>
          ${botTag}${dirBadge}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-pnl positive">${e.detail || ''}</span>
        </div>`;
      }
      if (e.type === 'loss') {
        return `<div class="activity-row act-loss">
          <span class="act-badge act-loss-badge">LOSS</span>
          <span class="act-time">${time}</span>
          ${botTag}${dirBadge}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-pnl negative">${e.detail || ''}</span>
        </div>`;
      }
      if (e.type === 'funding_close') {
        return `<div class="activity-row act-funding">
          <span class="act-badge act-fund-badge">FUNDING</span>
          <span class="act-time">${time}</span>
          ${botTag}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-detail">${e.detail || ''}</span>
        </div>`;
      }
      if (e.type === 'blocked') {
        const reason = e.reason || e.detail || '';
        return `<div class="activity-row act-blocked">
          <span class="act-badge act-block-badge">BLOCKED</span>
          <span class="act-time">${time}</span>
          ${botTag}${dirBadge}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-reason">${reason}</span>
        </div>`;
      }
      if (e.type === 'error' || e.type === 'failed') {
        return `<div class="activity-row act-error">
          <span class="act-badge act-err-badge">ERROR</span>
          <span class="act-time">${time}</span>
          ${botTag}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-reason">${e.detail || e.reason || ''}</span>
        </div>`;
      }
      if (e.type === 'reject') {
        return `<div class="activity-row act-reject">
          <span class="act-badge act-rej-badge">REJET</span>
          <span class="act-time">${time}</span>
          ${botTag}${dirBadge}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-reason">${e.reason || e.detail || ''}</span>
        </div>`;
      }
      if (e.type === 'halt' || e.type === 'auto_disable' || e.type === 'margin_fail') {
        return `<div class="activity-row act-error">
          <span class="act-badge act-err-badge">${e.type === 'halt' ? 'HALT' : e.type === 'margin_fail' ? 'MARGIN' : 'STOP'}</span>
          <span class="act-time">${time}</span>
          ${botTag}
          <span class="act-pair">${pairLabel}</span>
          <span class="act-reason">${e.detail || e.reason || ''}</span>
        </div>`;
      }
      if (e.type === 'recap') {
        return `<div class="activity-row act-recap">
          <span class="act-badge act-sys-badge">RECAP</span>
          <span class="act-time">${time}</span>
          ${botTag}
          <span class="act-detail">${e.detail || ''}</span>
        </div>`;
      }
      const edge = e.edgeBps != null ? `<span class="act-edge">${e.edgeBps.toFixed(1)}bps</span>` : '';
      return `<div class="activity-row act-default">
        <span class="act-badge act-sys-badge">${(e.type || 'SYS').toUpperCase()}</span>
        <span class="act-time">${time}</span>
        ${botTag}${dirBadge}
        <span class="act-pair">${pairLabel}</span>
        ${edge}
        <span class="act-detail">${e.detail || e.reason || ''}</span>
      </div>`;
    }).join('');
  } catch (e) {}
}

let botPairsLoaded = false;
const dirtyFields = new Set();
const paramFields = ['botPosSize', 'botMaxGlobal', 'botMaxLeverage', 'botStopLoss'];

function updateSyncIndicators() {
  const paramDirty = paramFields.some(id => dirtyFields.has(id));
  const paramEl = document.getElementById('paramSyncStatus');
  if (paramDirty) {
    paramEl.textContent = '\u26A0 non sauvegard\u00E9';
    paramEl.style.cssText = 'font-size:0.7rem;color:#f59e0b;font-weight:normal;';
  } else {
    paramEl.textContent = '\u2713 actif';
    paramEl.style.cssText = 'font-size:0.7rem;color:#10b981;font-weight:normal;';
  }

  const edgeDirty = [...dirtyFields].some(k => k.startsWith('pairEdge_'));
  const edgeEl = document.getElementById('edgeSyncStatus');
  if (edgeDirty) {
    edgeEl.textContent = '\u26A0 non sauvegard\u00E9';
    edgeEl.style.cssText = 'font-size:0.7rem;color:#f59e0b;font-weight:normal;';
  } else {
    edgeEl.textContent = '\u2713 actif';
    edgeEl.style.cssText = 'font-size:0.7rem;color:#10b981;font-weight:normal;';
  }
}

paramFields.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => { dirtyFields.add(id); updateSyncIndicators(); });
});
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('pair-edge-input')) {
    dirtyFields.add('pairEdge_' + e.target.dataset.pair);
    updateSyncIndicators();
  }
});

async function autoPing() {
  try {
    const res = await fetch('/bot/ping');
    const d = await res.json();
    const pingEl = document.getElementById('inlinePing');
    if (pingEl && d.ok && d.pingMs != null) {
      const cls = d.pingMs <= 100 ? 'latency-incredible' : d.pingMs <= 500 ? 'latency-good' : d.pingMs <= 1000 ? 'latency-ok' : 'latency-bad';
      pingEl.innerHTML = `<span class="${cls}">${d.pingMs}ms</span>`;
    }
  } catch {}
}
setInterval(autoPing, 10000);
autoPing();

function renderPairList() {
  const list = document.getElementById('pairList');
  const count = document.getElementById('pairCount');
  if (!list) return;
  count.textContent = `(${pairsList.length})`;
  list.innerHTML = pairsList.map(p => {
    const ft = (p.growthModeA === false && p.growthModeB === false)
      ? ' <span style="font-size:9px;color:#ef4444;font-weight:700;" title="2 legs non-growth">$$</span>'
      : (p.growthModeA === false || p.growthModeB === false)
        ? ' <span style="font-size:9px;color:#f59e0b;font-weight:700;" title="1 leg non-growth">$</span>'
        : '';
    return `<div class="pair-chip" data-pair="${p.id}">
      <span>${p.label}${ft}</span>
      <span class="remove-pair" onclick="removePair('${p.id}')" title="Supprimer">&times;</span>
    </div>`;
  }).join('');
}

async function addPair() {
  const mA = document.getElementById('addPairMarketA').value.trim();
  const mB = document.getElementById('addPairMarketB').value.trim();
  const msg = document.getElementById('addPairMsg');
  if (!mA || !mB) { msg.textContent = 'Remplis les deux champs'; msg.className = 'pair-msg error'; return; }
  msg.textContent = '...';
  msg.className = 'pair-msg';
  try {
    const res = await fetch('/pairs/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketA: mA, marketB: mB }),
    });
    const d = await res.json();
    if (d.ok) {
      msg.textContent = `${d.id} ajouté`;
      msg.className = 'pair-msg success';
      document.getElementById('addPairMarketA').value = '';
      document.getElementById('addPairMarketB').value = '';
      const pairsRes = await fetch('/pairs');
      pairsList = await pairsRes.json();
      renderPairList();
      botPairsLoaded = false;
    } else {
      msg.textContent = d.error || 'Erreur';
      msg.className = 'pair-msg error';
    }
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'pair-msg error';
  }
}

async function removePair(pairId) {
  if (!confirm(`Supprimer la paire ${pairId} ?`)) return;
  try {
    const res = await fetch('/pairs/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId }),
    });
    const d = await res.json();
    if (d.ok) {
      const pairsRes = await fetch('/pairs');
      pairsList = await pairsRes.json();
      renderPairList();
      botPairsLoaded = false;
    }
  } catch (e) {}
}

let _lastFeeData = null;
async function pollFeeRates() {
  try {
    const res = await fetch('/bot/fees');
    const d = await res.json();
    _lastFeeData = d;
    const feesEl = document.getElementById('inlineFees');
    if (feesEl && d.takerFeeGrowthBps) {
      const srcIcon = d.source === 'api' ? '\u2705' : '\u26A0';
      const ovr = d.growthFeeOverride !== null ? ' [ovr]' : '';
      feesEl.innerHTML = `Growth: ${d.takerFeeGrowthBps} bps | NoGrowth: ${d.takerFeeNoGrowthBps} bps ${srcIcon}${ovr}`;
      feesEl.title = `Cross: ${d.crossRateBps} bps | Add: ${d.addRateBps} bps | Growth (×0.1): ${d.takerFeeGrowthBps} bps | Source: ${d.source}`;
    }
    const gfInput = document.getElementById('botGrowthFee');
    const gfInfo = document.getElementById('growthFeeInfo');
    if (gfInput && !gfInput.matches(':focus')) {
      gfInput.value = d.growthFeeOverride !== null ? (d.growthFeeOverride * 100).toFixed(4) : '';
      gfInput.placeholder = d.growthFeeOverride === null ? `auto (${(d.takerFeeGrowth * 100).toFixed(4)})` : 'auto';
    }
    if (gfInfo) {
      gfInfo.textContent = `G: ${d.takerFeeGrowthBps} bps/leg | NG: ${d.takerFeeNoGrowthBps} bps/leg`;
    }
    const badge = document.getElementById('feeSourceBadge');
    if (badge && d.lastRefresh) {
      const ago = Math.round((Date.now() - d.lastRefresh) / 1000);
      const agoStr = ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m`;
      badge.innerHTML = d.source === 'api'
        ? `<span style="color:#10b981;">API \u2713 ${agoStr}</span>`
        : `<span style="color:#f59e0b;">Config</span>`;
    }
  } catch (e) {}
}

async function pollBot() {
  if (currentView !== 'bot') return;
  try {
    const res = await fetch('/bot/status');
    const data = await res.json();

    const dot = document.getElementById('botDot');
    const text = document.getElementById('botStatusText');
    const startBtn = document.getElementById('botStartBtn');
    const stopBtn = document.getElementById('botStopBtn');
    const liqBtn = document.getElementById('botLiquidationBtn');
    const stopLiqBtn = document.getElementById('botStopLiquidationBtn');

    if (data.enabled && data.liquidationMode) {
      dot.className = 'status-dot liquidating';
      text.textContent = 'LIQUIDATION';
      text.style.color = '#f59e0b';
      startBtn.style.display = 'none';
      stopBtn.style.display = '';
      liqBtn.style.display = 'none';
      stopLiqBtn.style.display = '';
    } else if (data.enabled) {
      dot.className = 'status-dot connected';
      text.textContent = 'ACTIVE';
      text.style.color = '#10b981';
      startBtn.style.display = 'none';
      stopBtn.style.display = '';
      liqBtn.style.display = '';
      stopLiqBtn.style.display = 'none';
    } else {
      dot.className = 'status-dot disconnected';
      text.textContent = data.initialized ? 'STOPPED' : 'NOT INITIALIZED';
      text.style.color = data.initialized ? '#f59e0b' : '#ef4444';
      startBtn.style.display = '';
      stopBtn.style.display = 'none';
      liqBtn.style.display = 'none';
      stopLiqBtn.style.display = 'none';
    }

    const ls = data.liveStats || {};
    window._lastLiveStats = ls;
    const openCount = ls.open || 0;
    if (data.enabled && data.liquidationMode) {
      updateFavicon('liquidating');
    } else if (data.enabled && openCount > 0) {
      updateFavicon('trading');
    } else if (data.enabled) {
      updateFavicon('running');
    } else {
      updateFavicon('stopped');
    }
    const fees = ls.totalFeesUsd || 0;
    const allErrCost = (ls.allErrorCostUsd || 0) + (ls.dnAdjustmentCostUsd || 0);
    const rawPnl = ls.totalPnlUsd || 0;
    const fundNet = window._lastFundingNet || 0;
    const pnlNet = rawPnl - fees - allErrCost + fundNet;
    const pnlEl = document.getElementById('botPnl');
    const pnlText = `${pnlNet >= 0 ? '+' : ''}$${pnlNet.toFixed(4)}`;
    animateValue(pnlEl, pnlText, 500);
    pnlEl.className = 'bot-card-value ' + (pnlNet >= 0 ? 'positive' : 'negative');

    pushPnlHistory(pnlNet);
    drawPnlSparkline('botPnlSparkline');
    drawPnlSparkline('ovPnlSparkline');

    const feesEl = document.getElementById('botFees');
    animateValue(feesEl, `$${fees.toFixed(4)}`, 400);

    const volUsd = ls.totalVolumeUsd || 0;
    animateValue(document.getElementById('botVolume'), `$${(volUsd / 1000).toFixed(2)}K`, 400);

    animateValue(document.getElementById('botOpen'), String(ls.open || 0), 300);
    animateValue(document.getElementById('botClosed'), String(ls.closed || 0), 300);
    animateValue(document.getElementById('botWins'), String(ls.wins || 0), 300);
    animateValue(document.getElementById('botLosses'), String(ls.losses || 0), 300);
    document.getElementById('botWinRate').textContent = ls.winRate ? ls.winRate + '%' : '--%';
    document.getElementById('botSlippage').textContent = (ls.avgEntrySlippageBps || 0).toFixed(2) + ' bps';
    animateValue(document.getElementById('botErrors'), String(ls.errors || 0), 300);
    animateValue(document.getElementById('botOrphansClosed'), String(ls.orphansClosed || 0), 300);
    const orphCost = ls.orphanCostUsd || 0;
    const orphCostEl = document.getElementById('botOrphanCost');
    if (orphCostEl) { animateValue(orphCostEl, orphCost > 0 ? `-$${orphCost.toFixed(4)}` : '$0.0000', 400); if (orphCost > 0) orphCostEl.className = 'bot-card-value negative'; }
    const errCost = allErrCost;
    const errCostEl = document.getElementById('botErrorCost');
    animateValue(errCostEl, errCost > 0 ? `-$${errCost.toFixed(4)}` : '$0.0000', 400);
    if (errCost > 0) errCostEl.className = 'bot-card-value negative';

    const execEl = document.getElementById('inlineExec');
    if (execEl && data.execTime && data.execTime.count > 0) {
      const ems = data.execTime.avg;
      const cls = ems <= 500 ? 'latency-incredible' : ems <= 1500 ? 'latency-good' : ems <= 3000 ? 'latency-ok' : 'latency-bad';
      execEl.innerHTML = `<span class="${cls}">${ems}ms</span>`;
    }

    const el = data.e2eLatency;
    if (el && el.count > 0) {
      const _lc = v => v <= 500 ? 'latency-incredible' : v <= 1500 ? 'latency-good' : v <= 3000 ? 'latency-ok' : 'latency-bad';
      const eAvg = document.getElementById('botEntryLatAvg');
      const eP50 = document.getElementById('botEntryLatP50');
      const eP95 = document.getElementById('botEntryLatP95');
      const eCnt = document.getElementById('botEntryLatCount');
      if (eAvg) eAvg.innerHTML = `<span class="${_lc(el.avg)}">${el.avg}ms</span>`;
      if (eP50) eP50.innerHTML = `<span class="${_lc(el.p50)}">${el.p50}ms</span>`;
      if (eP95) eP95.innerHTML = `<span class="${_lc(el.p95)}">${el.p95}ms</span>`;
      if (eCnt) eCnt.textContent = el.count;
    }

    const cl = data.closeLatency;
    if (cl && cl.count > 0) {
      const clsAvg = cl.avg <= 500 ? 'latency-incredible' : cl.avg <= 1500 ? 'latency-good' : cl.avg <= 3000 ? 'latency-ok' : 'latency-bad';
      const clsP50 = cl.p50 <= 500 ? 'latency-incredible' : cl.p50 <= 1500 ? 'latency-good' : cl.p50 <= 3000 ? 'latency-ok' : 'latency-bad';
      const clsP95 = cl.p95 <= 1000 ? 'latency-incredible' : cl.p95 <= 2000 ? 'latency-good' : cl.p95 <= 5000 ? 'latency-ok' : 'latency-bad';
      const avgEl = document.getElementById('botCloseLatAvg');
      const p50El = document.getElementById('botCloseLatP50');
      const p95El = document.getElementById('botCloseLatP95');
      const cntEl = document.getElementById('botCloseLatCount');
      if (avgEl) avgEl.innerHTML = `<span class="${clsAvg}">${cl.avg}ms</span>`;
      if (p50El) p50El.innerHTML = `<span class="${clsP50}">${cl.p50}ms</span>`;
      if (p95El) p95El.innerHTML = `<span class="${clsP95}">${cl.p95}ms</span>`;
      if (cntEl) cntEl.textContent = cl.count;
    }

    pollFeeRates();

    const banner = document.getElementById('marginHealthBanner');
    banner.style.display = 'none';

    if (!botPairsLoaded && pairsList.length > 0) {
      botPairsLoaded = true;
      const container = document.getElementById('botPairToggles');
      const orderedPairs = (data.pairOrder && data.pairOrder.length > 0)
        ? data.pairOrder
            .map(id => pairsList.find(p => p.id === id))
            .filter(Boolean)
            .concat(pairsList.filter(p => !data.pairOrder.includes(p.id)))
        : [...pairsList];
      container.innerHTML = orderedPairs.map(p => {
        const isActive = (data.enabledPairs || []).includes(p.id);
        const ft = (p.growthModeA === false && p.growthModeB === false)
          ? ' <span style="font-size:9px;color:#ef4444;font-weight:700;">$$</span>'
          : (p.growthModeA === false || p.growthModeB === false)
            ? ' <span style="font-size:9px;color:#f59e0b;font-weight:700;">$</span>'
            : '';
        return `<div class="pair-toggle ${isActive ? 'active' : ''}" data-pair="${p.id}" draggable="true">${p.label || p.id}${ft}</div>`;
      }).join('');

      container.addEventListener('click', async (e) => {
        const toggle = e.target.closest('.pair-toggle');
        if (!toggle) return;
        const pairId = toggle.dataset.pair;
        const isNowActive = !toggle.classList.contains('active');
        await fetch('/bot/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairId, enabled: isNowActive }),
        });
        toggle.classList.toggle('active');
      });

      let dragSrcEl = null;
      container.addEventListener('dragstart', (e) => {
        const toggle = e.target.closest('.pair-toggle');
        if (!toggle) return;
        dragSrcEl = toggle;
        toggle.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', toggle.dataset.pair);
      });
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const toggle = e.target.closest('.pair-toggle');
        if (!toggle || toggle === dragSrcEl) return;
        const rect = toggle.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX < midX) {
          toggle.classList.add('drag-before');
          toggle.classList.remove('drag-after');
        } else {
          toggle.classList.add('drag-after');
          toggle.classList.remove('drag-before');
        }
      });
      container.addEventListener('dragleave', (e) => {
        const toggle = e.target.closest('.pair-toggle');
        if (toggle) {
          toggle.classList.remove('drag-before', 'drag-after');
        }
      });
      container.addEventListener('drop', async (e) => {
        e.preventDefault();
        const target = e.target.closest('.pair-toggle');
        if (!target || !dragSrcEl || target === dragSrcEl) return;
        target.classList.remove('drag-before', 'drag-after');
        const rect = target.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX < midX) {
          container.insertBefore(dragSrcEl, target);
        } else {
          container.insertBefore(dragSrcEl, target.nextSibling);
        }
        const newOrder = [...container.querySelectorAll('.pair-toggle')].map(el => el.dataset.pair);
        await fetch('/bot/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairOrder: newOrder }),
        });
      });
      container.addEventListener('dragend', () => {
        if (dragSrcEl) {
          dragSrcEl.classList.remove('dragging');
          dragSrcEl = null;
        }
        container.querySelectorAll('.pair-toggle').forEach(el => {
          el.classList.remove('drag-before', 'drag-after');
        });
      });
    }

    if (data.enabledPairs && botPairsLoaded) {
      document.querySelectorAll('.pair-toggle').forEach(el => {
        const pid = el.dataset.pair;
        if (data.enabledPairs.includes(pid)) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    }

    const setIfClean = (id, val) => {
      if (!dirtyFields.has(id)) {
        document.getElementById(id).value = val;
      }
    };
    setIfClean('botPosSize', data.maxPositionUsd ?? 500);
    setIfClean('botMaxGlobal', data.maxGlobalPositions ?? 5);
    setIfClean('botMaxLeverage', data.maxLeverage ?? 10);
    setIfClean('botStopLoss', data.stopLossBps ?? 0);
    setIfClean('botCostsBps', data.marginBps ?? 3);

    if (data.p50Mode) {
      _botP50Mode = data.p50Mode;
      _highlightModeButtons('p50ModeSelector', data.p50Mode);
      _updateZScoreConfigVisibility('zScoreConfig', data.p50Mode);
      _updateZScoreSliders('', data);
      const refTh = document.getElementById('cfgMargeRefTh');
      const beTh = document.getElementById('cfgMargeBeTh');
      if (refTh) refTh.textContent = 'Fees RT';
      if (beTh) beTh.textContent = 'Mid-0';
    }
    if (data.bufferBps !== undefined) {
      const bi = document.getElementById('bufferBpsInput');
      if (bi && document.activeElement !== bi) bi.value = data.bufferBps;
    }
    if (data.slippageMarginBps !== undefined) {
      const si = document.getElementById('slipMarginInput');
      if (si && document.activeElement !== si) si.value = data.slippageMarginBps;
    }
    if (data.dataTimer) {
      const dt = document.getElementById('dataTimerSelect');
      if (dt && document.activeElement !== dt) dt.value = data.dataTimer;
    }
    if (data.zMeanRevert !== undefined) {
      const zmr = document.getElementById('zMeanRevertToggle');
      if (zmr) zmr.checked = data.zMeanRevert;
    }
    if (data.feeRoundTripBps !== undefined) {
      const efd = document.getElementById('entryFeesDisplay');
      if (efd) efd.textContent = data.feeRoundTripBps.toFixed(2) + ' bps RT';
    }

    if (data.alertWebhookUrl != null) {
      const el = document.getElementById('alertWebhookInput');
      if (el && document.activeElement !== el) {
        if (data.alertWebhookUrl && data.alertWebhookUrl !== '') {
          el.placeholder = 'Webhook configured';
        } else {
          el.placeholder = 'https://hooks.slack.com/...';
        }
      }
    }

    updateSyncIndicators();

  } catch (e) {}
}

let _botP50Mode = 'zscore';
let _bot2P50Mode = 'zscore';

function renderEdgeFloorsTable() {}

function formatDuration(ms) {
  if (ms < 60000) return (ms / 1000).toFixed(0) + 's';
  if (ms < 3600000) return (ms / 60000).toFixed(1) + 'm';
  return (ms / 3600000).toFixed(1) + 'h';
}

let closedTradesOpen = false;
let closedTradesLimit = 30;
let closedTradesTotal = 0;
let closedTradesData = [];

function renderClosedRow(t) {
  const isError = t.status === 'error';
  const isOrphan = t.status === 'orphan_closed' || t.status === 'closed_orphan';
  const isSlipGuard = t.status === 'slippage_guard';
  const isLegacy = isOrphan || isSlipGuard;
  const pnlVal = parseFloat(t.realized_pnl_usd) || 0;
  const errCost = parseFloat(t.error_cost_usd) || 0;
  const displayPnl = isError || isLegacy ? -errCost : pnlVal;
  const pnlClass = displayPnl > 0 ? 'positive' : displayPnl < 0 ? 'negative' : '';
  const dMs = t.close_ts && t.entry_ts ? parseInt(t.close_ts) - parseInt(t.entry_ts) : 0;
  const pairLabel = (pairsList.find(p => p.id === t.pair_id) || {}).label || t.pair_id;
  let statusBadge;
  if (isError) statusBadge = '<span class="status-error">ERR</span>';
  else if (isOrphan) statusBadge = '<span class="status-error" style="background:var(--warning,#f59e0b);color:#000">ORPH</span>';
  else if (isSlipGuard) statusBadge = '<span class="status-error" style="background:var(--warning,#f59e0b);color:#000">SLIP</span>';
  else statusBadge = '<span class="status-ok">OK</span>';
  const rowClass = isError ? 'error-row' : isLegacy ? 'error-row' : '';
  return `<tr class="${rowClass}">
    <td>${t.id}</td>
    <td class="pair-cell">${pairLabel}</td>
    <td>${t.direction == 1 ? '<span class="dir-badge dir-d1">\u2212</span>' : '<span class="dir-badge dir-d2">+</span>'}</td>
    <td>${t.signal_edge_bps ? Number(t.signal_edge_bps).toFixed(2) : '--'}</td>
    <td>${t.leg_a_fill_price ? Number(t.leg_a_fill_price).toFixed(4) : '--'}</td>
    <td>${t.leg_b_fill_price ? Number(t.leg_b_fill_price).toFixed(4) : '--'}</td>
    <td>${t.close_leg_a_price ? Number(t.close_leg_a_price).toFixed(4) : '--'}</td>
    <td>${t.close_leg_b_price ? Number(t.close_leg_b_price).toFixed(4) : '--'}</td>
    <td class="${pnlClass}">${isError || isLegacy ? '--' : (t.realized_pnl_bps ? Number(t.realized_pnl_bps).toFixed(2) : '--')}</td>
    <td class="${pnlClass}">${(isError || isLegacy) ? (errCost > 0 ? '-$' + errCost.toFixed(4) : errCost < 0 ? '+$' + Math.abs(errCost).toFixed(4) : '--') : (pnlVal !== 0 ? (pnlVal > 0 ? '+' : '') + '$' + pnlVal.toFixed(4) : '--')}</td>
    <td>${t.fees_usd ? '$' + Number(t.fees_usd).toFixed(4) : '--'}</td>
    <td>${dMs > 0 ? formatDuration(dMs) : '--'}</td>
    <td>${statusBadge}</td>
  </tr>`;
}

async function pollBotTrades() {
  if (currentView !== 'bot') return;
  try {
    const [posRes, closedRes] = await Promise.all([
      fetch('/bot/positions'),
      fetch('/bot/trades/closed?n=' + closedTradesLimit),
    ]);
    const positions = await posRes.json();
    const closedData = await closedRes.json();
    const closedTrades = closedData.rows || closedData;
    closedTradesTotal = closedData.total ?? closedTrades.length;
    closedTradesData = closedTrades;

    const openPositions = Array.isArray(positions) ? positions.filter(p => p.status === 'open') : [];
    document.getElementById('openTradesCount').textContent = openPositions.length;

    const openBody = document.getElementById('botOpenTradesBody');
    if (openPositions.length === 0) {
      openBody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">Aucune position ouverte</td></tr>';
    } else {
      const now = Date.now();
      openBody.innerHTML = openPositions.map(p => {
        const pairLabel = (pairsList.find(pr => pr.id === p.pairId) || {}).label || p.pairId;
        const holdMs = now - parseInt(p.openedAt || now);
        const dirLabel = p.direction == 1 ? '<span class="dir-badge dir-d1">\u2212</span>' : '<span class="dir-badge dir-d2">+</span>';
        const size = Number(p.size || 0).toFixed(4);
        const vwapA = Number(p.vwapA || 0).toFixed(4);
        const vwapB = Number(p.vwapB || 0).toFixed(4);
        const slip = Number(p.avgSlipBps || 0).toFixed(2);
        const pnlBps = Number(p.spreadPnlBps || 0).toFixed(2);
        const pnlUsd = Number(p.spreadPnlUsd || 0).toFixed(4);
        const pnlColor = parseFloat(pnlBps) >= 0 ? 'var(--positive)' : 'var(--negative)';
        const fills = p.totalFills || 0;
        const statusLabel = p.status === 'closing' ? 'CLOSING' : 'OPEN';
        const statusColor = p.status === 'closing' ? '#f59e0b' : '';
        return `<tr>
          <td class="pair-cell">${pairLabel}</td>
          <td>${dirLabel}</td>
          <td>${size}</td>
          <td>${vwapA}</td>
          <td>${vwapB}</td>
          <td>${slip}bps</td>
          <td style="color:${pnlColor}">${pnlBps}bps</td>
          <td style="color:${pnlColor}">$${pnlUsd}</td>
          <td>${fills}</td>
          <td class="trade-status" style="color:${statusColor}">${statusLabel}</td>
          <td>${formatDuration(holdMs)}</td>
          <td><button class="force-close-btn" onclick="forceCloseTrade('${p.pairId}')" title="Force close">\u2715</button></td>
        </tr>`;
      }).join('');
    }

    const closedBody = document.getElementById('botClosedTradesBody');
    if (!closedTradesOpen) {
      document.getElementById('closedTradesCount').textContent = closedTrades.length;
      return;
    }
    document.getElementById('closedTradesCount').textContent = closedTradesTotal;
    if (closedTrades.length === 0) {
      closedBody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);">Aucun trade ferm&eacute;</td></tr>';
    } else {
      closedBody.innerHTML = closedTrades.map(t => renderClosedRow(t)).join('');
      document.getElementById('closedTradesLoadMore').style.display =
        closedTrades.length < closedTradesTotal ? 'block' : 'none';
    }
  } catch (e) {}
}

async function pollBotPairStats() {
  if (currentView !== 'bot') return;
  try {
    const res = await fetch('/bot/pair-stats');
    const stats = await res.json();
    if (!window._zMid0Data) window._zMid0Data = {};
    for (const s of stats) {
      if (s.zMid0D1 != null || s.zMid0D2 != null) {
        window._zMid0Data[s.pairId] = { d1: s.zMid0D1, d2: s.zMid0D2 };
      }
    }
    const body = document.getElementById('botPairStatsBody');
    if (stats.length === 0) {
      body.innerHTML = '<tr><td colspan="15" style="text-align:center;color:var(--text-muted);">Aucune donn&eacute;e</td></tr>';
      return;
    }
    body.innerHTML = stats.map(s => {
      const pairLabel = (pairsList.find(p => p.id === s.pairId) || {}).label || s.pairId;
      const pnlClass = s.totalPnlUsd > 0 ? 'positive' : s.totalPnlUsd < 0 ? 'negative' : '';
      const winRate = s.closed > 0 ? ((s.wins / s.closed) * 100).toFixed(0) : '--';
      const urBps = s.unrealizedPnlBps ?? 0;
      const urUsd = s.unrealizedPnlUsd ?? 0;
      const urClass = urBps > 0 ? 'positive' : urBps < 0 ? 'negative' : '';
      const urText = s.open > 0 ? `${urBps > 0 ? '+' : ''}${urBps.toFixed(2)} bps` : '--';
      return `<tr>
        <td class="pair-cell">${pairLabel}</td>
        <td>${s.total}</td>
        <td>${s.open}</td>
        <td>${s.closed}</td>
        <td class="positive">${s.wins}</td>
        <td class="negative">${s.losses}</td>
        <td>${winRate}%</td>
        <td class="${pnlClass}">${s.totalPnlUsd > 0 ? '+' : ''}$${s.totalPnlUsd.toFixed(4)}</td>
        <td class="${urClass}">${urText}</td>
        <td>$${(s.totalVolumeUsd ?? 0).toFixed(2)}</td>
        <td>$${s.totalFeesUsd.toFixed(4)}</td>
        <td>${s.avgEntryEdgeBps.toFixed(2)} bps</td>
        <td style="color:#d4a017;font-size:10px;" title="Mid-0 Kalman (D1=${(s.zMid0D1||0).toFixed(2)}, D2=${(s.zMid0D2||0).toFixed(2)})">${s.zMid0D1 != null || s.zMid0D2 != null ? (((s.zMid0D1||0) + (s.zMid0D2||0)) / 2).toFixed(2) : '--'}</td>
        <td>${s.avgSlippageBps.toFixed(2)} bps</td>
        <td class="${s.zMid0D1 != null ? (s.avgEntryEdgeBps - ((s.zMid0D1||0) + (s.zMid0D2||0)) / 2 > 2 ? 'positive' : s.avgEntryEdgeBps - ((s.zMid0D1||0) + (s.zMid0D2||0)) / 2 < 0.5 ? 'negative' : '') : ''}">${s.zMid0D1 != null ? (s.avgEntryEdgeBps - ((s.zMid0D1||0) + (s.zMid0D2||0)) / 2).toFixed(2) + ' bps' : '--'}</td>
        <td>${s.errors}</td>
      </tr>`;
    }).join('');
  } catch (e) {}
}

let openTradesOpen = false;
if (document.getElementById('openTradesToggle')) {
  document.getElementById('openTradesToggle').addEventListener('click', () => {
    openTradesOpen = !openTradesOpen;
    document.getElementById('openTradesPanel').style.display = openTradesOpen ? 'block' : 'none';
    document.getElementById('openTradesArrow').classList.toggle('open', openTradesOpen);
  });
}

if (document.getElementById('closedTradesToggle')) {
  document.getElementById('closedTradesToggle').addEventListener('click', () => {
    closedTradesOpen = !closedTradesOpen;
    document.getElementById('closedTradesPanel').style.display = closedTradesOpen ? 'block' : 'none';
    document.getElementById('closedTradesArrow').classList.toggle('open', closedTradesOpen);
    if (closedTradesOpen) pollBotTrades();
  });
}

let dnBalanceOpen = false;
if (document.getElementById('dnBalanceToggle')) {
  document.getElementById('dnBalanceToggle').addEventListener('click', () => {
    dnBalanceOpen = !dnBalanceOpen;
    document.getElementById('dnBalancePanel').style.display = dnBalanceOpen ? 'block' : 'none';
    document.getElementById('dnBalanceArrow').classList.toggle('open', dnBalanceOpen);
    if (dnBalanceOpen) pollDnStatus();
  });
}

if (document.getElementById('closedTradesLoadMoreBtn')) {
  document.getElementById('closedTradesLoadMoreBtn').addEventListener('click', () => {
    closedTradesLimit += 50;
    pollBotTrades();
  });
}

if (document.getElementById('botStartBtn')) {
  document.getElementById('botStartBtn').addEventListener('click', async () => {
    await fetch('/bot/start', { method: 'POST' });
    pollBot();
  });
}

if (document.getElementById('botStopBtn')) {
  document.getElementById('botStopBtn').addEventListener('click', async () => {
    await fetch('/bot/stop', { method: 'POST' });
    pollBot();
  });
}

if (document.getElementById('botLiquidationBtn')) {
  document.getElementById('botLiquidationBtn').addEventListener('click', async () => {
    await fetch('/bot/liquidation/start', { method: 'POST' });
    pollBot();
  });
}

if (document.getElementById('botStopLiquidationBtn')) {
  document.getElementById('botStopLiquidationBtn').addEventListener('click', async () => {
    await fetch('/bot/liquidation/stop', { method: 'POST' });
    pollBot();
  });
}

const _histCache = {};
async function toggleTradeHistory(tradeId, pairId) {
  const panel = document.getElementById('histPanel_' + tradeId);
  const arrow = document.getElementById('histArrow_' + tradeId);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
    arrow.classList.remove('open');
    return;
  }
  arrow.classList.add('open');
  panel.style.display = 'block';
  panel.innerHTML = '<span style="color:var(--text-muted)">Chargement...</span>';
  try {
    const res = await fetch('/bot/trades/closed?n=20&pair=' + encodeURIComponent(pairId));
    const data = await res.json();
    const trades = data.rows || data || [];
    if (trades.length === 0) {
      panel.innerHTML = '<span style="color:var(--text-muted)">Aucun trade ferm\u00e9 pour cette paire</span>';
      return;
    }
    let html = '<table class="signals-table hist-table"><thead><tr><th>ID</th><th>Dir</th><th>Edge</th><th>Entry A</th><th>Entry B</th><th>Exit A</th><th>Exit B</th><th>PnL bps</th><th>PnL $</th><th>Dur\u00e9e</th><th>Status</th></tr></thead><tbody>';
    for (const t of trades) {
      const pnlVal = parseFloat(t.realized_pnl_usd) || 0;
      const pnlClass = pnlVal > 0 ? 'positive' : pnlVal < 0 ? 'negative' : '';
      const dMs = t.close_ts && t.entry_ts ? parseInt(t.close_ts) - parseInt(t.entry_ts) : 0;
      const statusLabel = t.status === 'closed' ? (t.error_msg || 'closed') : t.status;
      const isError = t.status === 'error';
      html += '<tr' + (isError ? ' class="error-row"' : '') + '>';
      html += '<td>' + t.id + '</td>';
      html += '<td>' + (t.direction == 1 ? '<span class="dir-badge dir-d1">\u2212</span>' : '<span class="dir-badge dir-d2">+</span>') + '</td>';
      html += '<td>' + Number(t.signal_edge_bps).toFixed(2) + '</td>';
      html += '<td>' + (t.leg_a_fill_price ? Number(t.leg_a_fill_price).toFixed(4) : '--') + '</td>';
      html += '<td>' + (t.leg_b_fill_price ? Number(t.leg_b_fill_price).toFixed(4) : '--') + '</td>';
      html += '<td>' + (t.close_leg_a_price ? Number(t.close_leg_a_price).toFixed(4) : '--') + '</td>';
      html += '<td>' + (t.close_leg_b_price ? Number(t.close_leg_b_price).toFixed(4) : '--') + '</td>';
      html += '<td class="' + pnlClass + '">' + (t.realized_pnl_bps ? Number(t.realized_pnl_bps).toFixed(2) : '--') + '</td>';
      html += '<td class="' + pnlClass + '">' + (pnlVal !== 0 ? (pnlVal > 0 ? '+' : '') + '$' + pnlVal.toFixed(4) : '--') + '</td>';
      html += '<td>' + (dMs > 0 ? formatDuration(dMs) : '--') + '</td>';
      html += '<td>' + statusLabel + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = '<span style="color:#dc3545">Erreur: ' + e.message + '</span>';
  }
}

async function forceCloseTrade(pairId) {
  if (!confirm('Fermer la position ' + pairId + ' maintenant ?')) return;
  try {
    const res = await fetch('/bot/force-close-pair/' + encodeURIComponent(pairId), { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      pollBotTrades();
      pollBot();
    } else {
      alert('Erreur: ' + (data.error || 'unknown'));
    }
  } catch (e) {
    alert('Erreur: ' + e.message);
  }
}

async function forceCloseAll() {
  if (!confirm('Fermer TOUTES les positions ouvertes maintenant ?')) return;
  const btn = document.getElementById('forceCloseAllBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Closing...'; }
  try {
    const res = await fetch('/bot/force-close-all', { method: 'POST' });
    const data = await res.json();
    pollBotTrades();
    pollBot();
    if (data.results) {
      const ok = data.results.filter(r => r.ok).length;
      const fail = data.results.filter(r => !r.ok).length;
      if (fail > 0) alert(ok + ' closed, ' + fail + ' failed');
    }
  } catch (e) {
    alert('Erreur: ' + e.message);
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Close All'; }
}

document.getElementById('botResetBtn')?.addEventListener('click', async () => {
  if (!confirm('Reset le bot ? Cela va :\n- Fermer toutes les positions on-chain\n- Supprimer l\'historique des trades\n- Reset les corrections DN et l\'exposition agrégée\n- Stopper le bot')) return;
  const btn = document.getElementById('botResetBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Reset en cours...'; }
  try {
    const res = await fetch('/bot/reset', { method: 'POST' });
    const data = await res.json();
    const closed = data.closedPositions || [];
    const ok = closed.filter(p => p.status !== 'error' && p.status !== 'skipped').length;
    const failed = closed.filter(p => p.status === 'error').length;
    if (closed.length > 0) {
      let msg = `Reset terminé. ${ok}/${closed.length} position(s) on-chain fermée(s).`;
      if (failed > 0) msg += `\n${failed} échec(s) de fermeture.`;
      alert(msg);
    }
  } catch (e) {
    alert('Erreur pendant le reset: ' + (e.message || 'réseau'));
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Reset'; }
  pollBot();
});

document.getElementById('botUpdateConfig')?.addEventListener('click', async () => {
  const cfg = {
    maxPositionUsd: parseFloat(document.getElementById('botPosSize').value),
    maxGlobalPositions: parseInt(document.getElementById('botMaxGlobal').value),
    maxLeverage: parseInt(document.getElementById('botMaxLeverage').value),
    stopLossBps: parseFloat(document.getElementById('botStopLoss').value),
  };
  await fetch('/bot/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  dirtyFields.delete('botPosSize');
  dirtyFields.delete('botMaxGlobal');
  dirtyFields.delete('botMaxLeverage');
  dirtyFields.delete('botStopLoss');
  updateSyncIndicators();
  pollBot();
});

async function applyCostsBps() {
  const val = parseFloat(document.getElementById('botCostsBps').value);
  if (isNaN(val) || val < 0) return;
  const status = document.getElementById('costsSyncStatus');
  status.textContent = '...';
  try {
    await fetch('/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marginBps: val }),
    });
    dirtyFields.delete('botCostsBps');
    updateSyncIndicators();
    status.textContent = '\u2713';
    setTimeout(() => { status.textContent = ''; }, 2000);
    pollBot();
  } catch (e) {
    status.textContent = '\u2717';
  }
}

async function applyGrowthFee() {
  const input = document.getElementById('botGrowthFee');
  const raw = input.value.trim().replace(',', '.');
  let override = null;
  if (raw !== '' && raw !== 'auto') {
    override = parseFloat(raw) / 100;
    if (isNaN(override) || override <= 0) return;
  }
  try {
    await fetch('/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ growthFeeOverride: override }),
    });
    pollBot();
    pollFeeRates();
  } catch (e) {}
}

function _isZScoreMode(mode) {
  return true;
}

function _updateZScoreConfigVisibility(configId, mode) {
  const zCfg = document.getElementById(configId);
  if (zCfg) zCfg.style.display = '';
  const suffix = configId === 'zScoreConfig' ? '' : '2';
  const sensRow = document.getElementById('zSensitivityRow' + suffix);
  if (sensRow) sensRow.style.display = mode === 'kalman' ? 'flex' : 'none';
}

function _highlightModeButtons(selectorId, mode) {
  const sel = document.getElementById(selectorId);
  if (sel) sel.querySelectorAll('.p50-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

function _handleModeClick(selectorId, configId, botEndpoint, e) {
  const btn = e.target.closest('.p50-mode-btn');
  if (!btn) return;
  const mode = btn.dataset.mode;
  _highlightModeButtons(selectorId, mode);
  _updateZScoreConfigVisibility(configId, mode);
  fetch(botEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p50Mode: mode }),
  }).then(() => {
    if (botEndpoint === '/bot/config') pollBot();
    else pollBot2();
  });
}

document.getElementById('p50ModeSelector')?.addEventListener('click', (e) => _handleModeClick('p50ModeSelector', 'zScoreConfig', '/bot/config', e));

function _setupNewConfigHandlers(suffix, botEndpoint) {
  const bufInput = document.getElementById('bufferBpsInput' + suffix);
  if (bufInput) bufInput.addEventListener('change', () => {
    fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bufferBps: parseFloat(bufInput.value) || 0 }) });
  });
  const dtSelect = document.getElementById('dataTimerSelect' + suffix);
  if (dtSelect) dtSelect.addEventListener('change', () => {
    fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataTimer: dtSelect.value }) });
  });
  const slipInput = document.getElementById('slipMarginInput' + suffix);
  if (slipInput) slipInput.addEventListener('change', () => {
    fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slippageMarginBps: parseFloat(slipInput.value) || 0 }) });
  });
  const zmrToggle = document.getElementById('zMeanRevertToggle' + suffix);
  if (zmrToggle) zmrToggle.addEventListener('change', () => {
    fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zMeanRevert: zmrToggle.checked }) });
  });
}
_setupNewConfigHandlers('', '/bot/config');
_setupNewConfigHandlers('2', '/bot2/config');

function _updateZScoreSliders(suffix, data) {
  if (data.zThreshold !== undefined) {
    const sl = document.getElementById('zThresholdSlider' + suffix);
    const vl = document.getElementById('zThresholdVal' + suffix);
    if (sl && document.activeElement !== sl) sl.value = data.zThreshold;
    if (vl) vl.textContent = data.zThreshold;
  }
  if (data.zWindowSec !== undefined) {
    const sl = document.getElementById('zWindowSlider' + suffix);
    const vl = document.getElementById('zWindowVal' + suffix);
    if (sl && document.activeElement !== sl) sl.value = data.zWindowSec;
    if (vl) vl.textContent = data.zWindowSec;
  }
  if (data.zKalmanSensitivity !== undefined) {
    const sel = document.getElementById('zSensitivitySelect' + suffix);
    if (sel && document.activeElement !== sel) sel.value = data.zKalmanSensitivity;
  }
  if (data.minHoldMs !== undefined) {
    const sl = document.getElementById('minHoldSlider' + suffix);
    const vl = document.getElementById('minHoldVal' + suffix);
    const secs = Math.round(data.minHoldMs / 1000);
    if (sl && document.activeElement !== sl) sl.value = secs;
    if (vl) vl.textContent = secs;
  }
}

function _setupZScoreHandlers(suffix, botEndpoint) {
  const thrSlider = document.getElementById('zThresholdSlider' + suffix);
  if (thrSlider) {
    thrSlider.addEventListener('input', () => {
      const vl = document.getElementById('zThresholdVal' + suffix);
      if (vl) vl.textContent = thrSlider.value;
    });
    thrSlider.addEventListener('change', () => {
      fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zThreshold: parseFloat(thrSlider.value) }) });
    });
  }
  const winSlider = document.getElementById('zWindowSlider' + suffix);
  if (winSlider) {
    winSlider.addEventListener('input', () => {
      const vl = document.getElementById('zWindowVal' + suffix);
      if (vl) vl.textContent = winSlider.value;
    });
    winSlider.addEventListener('change', () => {
      fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zWindowSec: parseInt(winSlider.value) }) });
    });
  }
  const sensSel = document.getElementById('zSensitivitySelect' + suffix);
  if (sensSel) {
    sensSel.addEventListener('change', () => {
      fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zKalmanSensitivity: sensSel.value }) });
    });
  }
  const holdSlider = document.getElementById('minHoldSlider' + suffix);
  if (holdSlider) {
    holdSlider.addEventListener('input', () => {
      const vl = document.getElementById('minHoldVal' + suffix);
      if (vl) vl.textContent = holdSlider.value;
    });
    holdSlider.addEventListener('change', () => {
      fetch(botEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minHoldMs: parseInt(holdSlider.value) * 1000 }) });
    });
  }
}

_setupZScoreHandlers('', '/bot/config');
_setupZScoreHandlers('2', '/bot2/config');


document.getElementById('saveGuardrailsBtn')?.addEventListener('click', async () => {
  const payload = {};
  const webhookVal = document.getElementById('alertWebhookInput')?.value?.trim();
  if (webhookVal !== undefined && webhookVal !== '') payload.alertWebhookUrl = webhookVal;
  await fetch('/bot/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  pollBot();
});

async function fetchEdgeFloors() {}

async function fetchSlippageStats() {
  try {
    const res = await fetch('/bot/slippage-stats');
    const data = await res.json();
    const container = document.getElementById('slippageStatsContainer');
    if (!container) return;
    const entries = Object.entries(data).sort((a, b) => b[1].avgSlip - a[1].avgSlip);
    if (entries.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;">Aucun trade avec slippage sur les 3 derniers jours</div>';
      return;
    }
    const colorForSlip = (v) => v > 3 ? '#ef4444' : v > 1 ? '#f59e0b' : '#10b981';
    let html = `<div class="table-scroll"><table class="signals-table compact">
      <thead><tr><th>Paire</th><th>Trades</th><th>Moy.</th><th>P50</th><th>Max</th></tr></thead><tbody>`;
    for (const [pid, s] of entries) {
      const pInfo = pairsList.find(p => p.id === pid);
      const label = pInfo ? pInfo.label : pid;
      html += `<tr>
        <td style="font-size:11px;">${label}</td>
        <td style="text-align:center;font-size:11px;">${s.trades}</td>
        <td style="text-align:center;font-size:11px;font-weight:700;color:${colorForSlip(s.avgSlip)};">${s.avgSlip.toFixed(2)}</td>
        <td style="text-align:center;font-size:11px;color:${colorForSlip(s.p50Slip)};">${s.p50Slip.toFixed(2)}</td>
        <td style="text-align:center;font-size:11px;color:${colorForSlip(s.maxSlip)};">${s.maxSlip.toFixed(2)}</td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {
    const c = document.getElementById('slippageStatsContainer');
    if (c) c.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;">Erreur chargement</div>';
  }
}

async function pollWalletBalances() {
  if (currentView !== 'bot') return;
  try {
    const res = await fetch('/wallet/balances');
    const d = await res.json();
    const fmt2 = v => v === 0 ? '0.00' : Number(v).toFixed(2);
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      el.textContent = fmt2(val);
      el.className = 'token-val' + (val === 0 ? ' zero' : '');
    };
    setVal('balUSDC', d.usdc);
    setVal('balUSDT', d.usdt);
    setVal('balUSDH', d.usdh);
    const total = (d.usdc || 0) + (d.usdt || 0) + (d.usdh || 0);
    const totalEl = document.getElementById('balTotal');
    if (totalEl) {
      totalEl.textContent = fmt2(total);
      totalEl.className = 'token-val total-val';
    }
  } catch (e) {}
}

const _alertAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
let _lastAlertTs = 0;

const SOUND_TYPES = {
  fill:          { label: 'Fill',           defaultOn: true },
  win:           { label: 'Win',            defaultOn: true },
  loss:          { label: 'Loss',           defaultOn: true },
  error:         { label: 'Erreur',         defaultOn: true },
  failed:        { label: 'Failed',         defaultOn: true },
  halt:          { label: 'Halt',           defaultOn: true },
  margin_fail:   { label: 'Margin Fail',    defaultOn: true },
  funding_close: { label: 'Funding Close',  defaultOn: true },
};

function _loadSoundSettings() {
  try {
    const raw = localStorage.getItem('hip3_sound_settings');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function _saveSoundSettings(settings) {
  try { localStorage.setItem('hip3_sound_settings', JSON.stringify(settings)); } catch (e) {}
}

function getSoundSettings() {
  const saved = _loadSoundSettings();
  const defaults = { master: true, volume: 50, types: {} };
  for (const k of Object.keys(SOUND_TYPES)) defaults.types[k] = SOUND_TYPES[k].defaultOn;
  if (!saved) return defaults;
  return {
    master: saved.master !== undefined ? saved.master : defaults.master,
    volume: saved.volume !== undefined ? saved.volume : defaults.volume,
    types: { ...defaults.types, ...(saved.types || {}) },
  };
}

function toggleSoundSettings() {
  const panel = document.getElementById('soundSettingsPanel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : '';
  if (!visible) renderSoundSettingsPanel();
}

function renderSoundSettingsPanel() {
  const settings = getSoundSettings();
  const masterEl = document.getElementById('soundMasterToggle');
  const volumeEl = document.getElementById('soundVolume');
  const volumeLabel = document.getElementById('soundVolumeLabel');
  if (masterEl) masterEl.checked = settings.master;
  if (volumeEl) volumeEl.value = settings.volume;
  if (volumeLabel) volumeLabel.textContent = settings.volume + '%';

  const grid = document.getElementById('soundTypesGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(SOUND_TYPES).map(([key, cfg]) => {
    const checked = settings.types[key] ? 'checked' : '';
    return `<label class="sound-type-toggle">
      <input type="checkbox" data-sound-type="${key}" ${checked} onchange="updateSoundSettings()">
      <span>${cfg.label}</span>
      <button class="sound-preview-btn" onclick="event.preventDefault();previewSound('${key}')">&#9654;</button>
    </label>`;
  }).join('');
}

function updateSoundSettings() {
  const masterEl = document.getElementById('soundMasterToggle');
  const volumeEl = document.getElementById('soundVolume');
  const volumeLabel = document.getElementById('soundVolumeLabel');
  const settings = {
    master: masterEl ? masterEl.checked : true,
    volume: volumeEl ? parseInt(volumeEl.value) : 50,
    types: {},
  };
  if (volumeLabel) volumeLabel.textContent = settings.volume + '%';
  document.querySelectorAll('#soundTypesGrid input[data-sound-type]').forEach(inp => {
    settings.types[inp.dataset.soundType] = inp.checked;
  });
  _saveSoundSettings(settings);
}

function previewSound(type) {
  const settings = getSoundSettings();
  const vol = (settings.volume / 100) * 0.3;
  _playSoundImpl(type, vol);
}

function playAlertSound(type) {
  const now = Date.now();
  if (now - _lastAlertTs < 2000) return;
  const settings = getSoundSettings();
  if (!settings.master) return;
  if (settings.types[type] === false) return;
  _lastAlertTs = now;
  const vol = (settings.volume / 100) * 0.3;
  _playSoundImpl(type, vol);
}

function _playSoundImpl(type, vol) {
  const ctx = _alertAudioCtx;
  if (ctx.state === 'suspended') ctx.resume();

  if (type === 'fill') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = vol;
    osc.frequency.value = 880;
    osc.type = 'sine';
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } else if (type === 'win') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.frequency.value = 990;
    osc2.type = 'sine';
    g2.gain.value = vol;
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.25);
  } else if (type === 'loss') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.3);
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } else if (type === 'error' || type === 'failed') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 200;
    osc.type = 'square';
    gain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } else if (type === 'halt') {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 600;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  } else if (type === 'margin_fail') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 300;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } else if (type === 'funding_close') {
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 500;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.2;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }
}

let _seenActivityTs = 0;

async function pollAlerts() {
  try {
    const res = await fetch('/bot/activity?n=10');
    const entries = await res.json();
    if (!entries || entries.length === 0) return;
    for (const e of entries) {
      if (e.ts <= _seenActivityTs) continue;
      if (e.type === 'filled') playAlertSound('fill');
      else if (e.type === 'win') playAlertSound('win');
      else if (e.type === 'loss') playAlertSound('loss');
      else if (e.type === 'error') playAlertSound('error');
      else if (e.type === 'failed') playAlertSound('failed');
      else if (e.type === 'halt') playAlertSound('halt');
      else if (e.type === 'margin_fail') playAlertSound('margin_fail');
      else if (e.type === 'funding_close') playAlertSound('funding_close');
    }
    _seenActivityTs = Math.max(_seenActivityTs, entries[0].ts);
  } catch (e) {}
}

async function pollBotActivity() {
  if (currentView !== 'bot') return;
  try {
    const res = await fetch('/bot/activity?n=30');
    const entries = await res.json();
    const feed = document.getElementById('botActivityFeed');
    if (!entries || entries.length === 0) {
      feed.innerHTML = '<div class="activity-empty">En attente de signaux...</div>';
      return;
    }

    const iconMap = {
      accepted: '\u2714',
      filled: '\u2714',
      reject: '\u2718',
      blocked: '\u26A0',
      failed: '\u2718',
      error: '\u2718',
      margin_fail: '\u26D4',
      margin_ok: '\u2705',
      auto_disable: '\u26D4',
      halt: '\uD83D\uDED1',
      recap: '\uD83D\uDCCA',
      win: '\uD83D\uDCB0',
      loss: '\u274C',
      funding_close: '\uD83D\uDCB8',
    };

    const reasonLabels = {
      edge_too_small: 'Edge trop faible',
      pair_disabled: 'Paire d\u00E9sactiv\u00E9e',
      pending_order: 'Ordre en cours',
      no_collateral: 'Collat\u00E9ral insuffisant',
      max_positions_pair: 'Max positions paire',
      max_positions_global: 'Max positions global',
      executing: 'Ex\u00E9cution...',
      trade_executed: 'Trade ex\u00E9cut\u00E9',
      trade_failed: 'Trade \u00E9chou\u00E9',
      exception: 'Erreur',
      no_margin: 'Pas de liquidit\u00E9',
      margin_restored: 'Liquidit\u00E9 restaur\u00E9e',
      unwind_failed: '\u00C9chec critique \u2014 BOT STOP',
      fill_failures: 'Trop d\u0027\u00E9checs',
      liquidation_risk: 'Risque de liquidation',
      liquidation_danger: 'DANGER liquidation',
      liquidation_warning: 'Attention liquidation',
      liquidation_imminent: 'Liquidation imminente',
      reserve_breach: 'R\u00E9serve insuffisante',
      slippage_guard: 'Slippage \u00E9lev\u00E9 (log)',
      pre_trade_drift: 'Book a boug\u00E9 \u2014 annul\u00E9',
      insufficient_depth: 'Profondeur insuffisante',
      orphan_leg: 'Leg orpheline (auto-close 30s)',
      coin_closing: 'Close en cours sur ce coin',
      converge_close: 'Convergence — ferm\u00E9',
      repeg: 'Repeg',
      force_close: 'Fermeture forc\u00E9e',
      stop_loss: 'Stop-loss',
      funding_close: 'Funding guard — ferm\u00E9',
      zscore_below: 'Z-Score insuffisant',
      zscore_fees: 'Z: edge < fees',
      zscore_safe_below: 'Z-Safe: score insuffisant',
      zscore_safe_fees: 'Z-Safe: edge < fees+2bps',
      zscore_ultra_below: 'Z-Ultra: score insuffisant',
      zscore_ultra_fees: 'Z-Ultra: edge < fees+4bps',
      zscore_multi_short: 'Z-Multi: kZ court insuffisant',
      zscore_multi_long: 'Z-Multi: kZ long insuffisant',
      zscore_multi_fees: 'Z-Multi: edge < fees',
      zscore_kalman_below: 'Z-Kalman: score insuffisant',
      zscore_kalman_fees: 'Z-Kalman: edge < fees',
    };

    const visibleTypes = _getVisibleTypes();
    const filtered = entries.filter(e => visibleTypes.has(e.type));
    if (filtered.length === 0) {
      feed.innerHTML = '<div class="activity-empty">Aucun \u00E9v\u00E9nement pour ces filtres</div>';
      return;
    }

    feed.innerHTML = filtered.map(e => {
      const icon = iconMap[e.type] || '\u2022';
      const time = new Date(e.ts).toLocaleTimeString();
      if (e.type === 'recap') {
        return `<div class="activity-row recap" style="background:var(--bg-secondary);border-left:3px solid var(--text-muted);padding:4px 8px;margin:2px 0;">
          <span class="activity-icon recap">${icon}</span>
          <span class="activity-time">${time}</span>
          <span class="activity-reason" style="color:var(--text-secondary);font-size:0.8rem;">${e.detail || 'R\u00E9cap'}</span>
        </div>`;
      }
      if (e.type === 'win' || e.type === 'loss') {
        const pairLabel = (pairsList.find(p => p.id === e.pairId) || {}).label || e.pairId;
        const color = e.type === 'win' ? '#10b981' : '#ef4444';
        const label = e.type === 'win' ? 'WIN' : 'LOSS';
        return `<div class="activity-row ${e.type}" style="background:${e.type === 'win' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};border-left:3px solid ${color};padding:4px 8px;margin:2px 0;">
          <span class="activity-icon" style="color:${color}">${icon}</span>
          <span class="activity-time">${time}</span>
          <span style="color:${color};font-weight:bold;">${label}</span>
          <span class="activity-pair">${pairLabel}</span>
          <span class="activity-reason">${e.detail || ''}</span>
        </div>`;
      }
      if (e.type === 'funding_close') {
        const pairLabel = (pairsList.find(p => p.id === e.pairId) || {}).label || e.pairId;
        return `<div class="activity-row funding_close">
          <span class="activity-icon funding_close">${icon}</span>
          <span class="activity-time">${time}</span>
          <span style="color:#f59e0b;font-weight:bold;">FUNDING CLOSE</span>
          <span class="activity-pair">${pairLabel}</span>
          <span class="activity-reason">${e.detail || ''}</span>
        </div>`;
      }
      const pairLabel = (pairsList.find(p => p.id === e.pairId) || {}).label || e.pairId;
      const edge = e.edgeBps != null ? e.edgeBps.toFixed(2) + ' bps' : '--';
      const reason = reasonLabels[e.reason] || e.reason || '';
      const detail = e.detail ? ` (${e.detail})` : '';
      const dir = e.direction === 1 ? '\u25B2' : e.direction === 2 ? '\u25BC' : '';
      const zTag = (e.entryMode && _isZScoreMode(e.entryMode) && e.kalmanZ != null)
        ? ` <span style="color:#d4a017;font-size:0.72rem;">kZ=${e.kalmanZ.toFixed(2)}</span>` : '';
      return `<div class="activity-row ${e.type}">
        <span class="activity-icon ${e.type}">${icon}</span>
        <span class="activity-time">${time}</span>
        <span class="activity-pair">${pairLabel}</span>
        <span class="activity-edge">${dir} ${edge}</span>
        <span class="activity-reason">${reason}${detail}${zTag}</span>
      </div>`;
    }).join('');
  } catch (e) {}
}

let lastFundingPerPair = {};

async function pollBotFunding() {
  if (currentView !== 'bot') return;
  try {
    const res = await fetch('/bot/funding');
    const data = await res.json();
    const fmt = (v) => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(4);
    const fundingVal = data.totalWalletFunding || data.fundingNet || 0;
    const posEl = document.getElementById('botFundingPos');
    if (posEl) animateValue(posEl, fmt(fundingVal >= 0 ? fundingVal : 0), 400);
    const negEl = document.getElementById('botFundingNeg');
    if (negEl) animateValue(negEl, fmt(fundingVal < 0 ? fundingVal : 0), 400);
    const netEl = document.getElementById('botFundingNet');
    animateValue(netEl, fmt(fundingVal), 400);
    netEl.className = 'bot-card-value ' + (fundingVal >= 0 ? 'positive' : 'negative');
    window._lastFundingNet = fundingVal;
    const ls = window._lastLiveStats;
    if (ls) {
      const pnlNet = (ls.totalPnlUsd || 0) - (ls.totalFeesUsd || 0) - (ls.allErrorCostUsd || 0) - (ls.dnAdjustmentCostUsd || 0) + fundingVal;
      const pnlEl = document.getElementById('botPnl');
      const pnlText = `${pnlNet >= 0 ? '+' : ''}$${pnlNet.toFixed(4)}`;
      animateValue(pnlEl, pnlText, 500);
      pnlEl.className = 'bot-card-value ' + (pnlNet >= 0 ? 'positive' : 'negative');
    }
  } catch (e) {}
}

loadPairs();
pollOverview();
const _d1btn = document.getElementById('arbDirD1Btn');
if (_d1btn) _d1btn.classList.add('active');

const missedReasonLabels = {
  max_positions_pair: 'Max positions paire',
  max_positions_global: 'Margin full (max global)',
  no_collateral: 'Margin full (collat\u00E9ral)',
  deployer_collateral: 'Collat\u00E9ral deployer insuffisant',
  pending_order: 'Ordre en cours',
  bot_disabled: 'Bot d\u00E9sactiv\u00E9',
  pair_disabled: 'Paire d\u00E9sactiv\u00E9e',
};

async function pollBotStats() {
  if (currentView !== 'botstats' && currentView !== 'spreads') return;
  try {
    const res = await fetch('/bot/missed-stats');
    const d = await res.json();

    if (currentView === 'botstats') {
      document.getElementById('missedToday').textContent = d.totalMissedToday;
      document.getElementById('missedAllTime').textContent = d.totalMissedAllTime;
      const marginFullCount = (d.allTime.max_positions_global?.count || 0) + (d.allTime.no_collateral?.count || 0);
      document.getElementById('missedMarginFull').textContent = marginFullCount;
      document.getElementById('peakPositions').textContent = d.peakGlobalPositions;
      document.getElementById('currentPositions').textContent = d.currentGlobal;

      document.getElementById('marginUsed').textContent = '$' + d.marginUsedNow.toFixed(2);
      document.getElementById('marginPeak').textContent = '$' + d.marginNeededPeak.toFixed(2);
      document.getElementById('marginOptimal').textContent = '$' + d.marginEstimateOptimal.toFixed(2);
      document.getElementById('statsPosSize').textContent = '$' + (d.maxPositionUsd || d.positionSizeUsd || '--');

      const reasonBody = document.getElementById('missedByReasonBody');
      const reasons = Object.entries(d.allTime).sort((a, b) => b[1].count - a[1].count);
      if (reasons.length === 0) {
        reasonBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      } else {
        reasonBody.innerHTML = reasons.map(([reason, data]) => {
          const avgEdge = data.count > 0 ? (data.totalEdgeBps / data.count).toFixed(2) : '--';
          const topPair = Object.entries(data.pairs).sort((a, b) => b[1] - a[1])[0];
          const topLabel = topPair ? ((pairsList.find(p => p.id === topPair[0]) || {}).label || topPair[0]) + ' (' + topPair[1] + ')' : '--';
          return `<tr>
            <td>${missedReasonLabels[reason] || reason}</td>
            <td>${data.count}</td>
            <td>${avgEdge}</td>
            <td class="pair-cell">${topLabel}</td>
          </tr>`;
        }).join('');
      }

      const dailyBody = document.getElementById('missedDailyBody');
      if (d.daily.length === 0) {
        dailyBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      } else {
        dailyBody.innerHTML = d.daily.map(day => {
          const detail = Object.entries(day.byReason).map(([r, v]) => (missedReasonLabels[r] || r) + ': ' + v.count).join(', ');
          return `<tr>
            <td>${day.date}</td>
            <td>${day.missed}</td>
            <td class="detail-cell" style="max-width:400px">${detail}</td>
          </tr>`;
        }).join('');
      }

      const peakBody = document.getElementById('peakPerPairBody');
      const peakEntries = Object.entries(d.peakPerPair).sort((a, b) => b[1] - a[1]);
      if (peakEntries.length === 0) {
        peakBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      } else {
        peakBody.innerHTML = peakEntries.map(([pid, peak]) => {
          const pairLabel = (pairsList.find(p => p.id === pid) || {}).label || pid;
          const margin = (peak * (d.maxPositionUsd || d.positionSizeUsd || 500) / 10).toFixed(2);
          return `<tr>
            <td class="pair-cell">${pairLabel}</td>
            <td>${peak}</td>
            <td>$${margin}</td>
          </tr>`;
        }).join('');
      }
    }
    if (currentView === 'spreads') {
      const ap = document.getElementById('dataActivePairs');
      const alq = document.getElementById('dataAvgLiquidity');
      if (ap) ap.textContent = pairsList.length;
    }

  } catch (e) {}
}

function toggleApiKeyInput() {
  const row = document.getElementById('apiKeyInputRow');
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  if (row.style.display === 'flex') document.getElementById('apiKeyInput').focus();
}

async function submitApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  try {
    const res = await fetch('/bot/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateKey: key }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('botApiKeyMasked').textContent = data.masked;
      document.getElementById('botWalletAddr').textContent = data.wallet ? `(${data.wallet.slice(0,6)}...${data.wallet.slice(-4)})` : '';
      updateVaultDisplay('bot', data.vault);
      document.getElementById('apiKeyInput').value = '';
      toggleApiKeyInput();
    } else {
      alert('Erreur: ' + (data.error || 'inconnue'));
    }
  } catch (e) {
    alert('Erreur: ' + e.message);
  }
}

async function loadBotApiKey() {
  try {
    const res = await fetch('/bot/api-key');
    const data = await res.json();
    document.getElementById('botApiKeyMasked').textContent = data.masked || '--';
    if (data.wallet) {
      document.getElementById('botWalletAddr').textContent = `(${data.wallet.slice(0,6)}...${data.wallet.slice(-4)})`;
    }
    updateVaultDisplay('bot', data.vault);
  } catch (e) {}
}
loadBotApiKey();

function updateVaultDisplay(prefix, vault) {
  const el = document.getElementById(prefix + 'VaultAddr');
  if (!el) return;
  if (vault) {
    el.textContent = vault.slice(0, 6) + '...' + vault.slice(-4);
    el.style.color = '#d4a017';
    el.style.opacity = '1';
  } else {
    el.textContent = 'Wallet principal';
    el.style.color = '';
    el.style.opacity = '0.8';
  }
}

function toggleVaultInput(apiPrefix, uiPrefix) {
  const id = (uiPrefix || apiPrefix) + 'VaultInputRow';
  const row = document.getElementById(id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  if (row.style.display === 'flex') {
    const input = document.getElementById((uiPrefix || apiPrefix) + 'VaultInput');
    if (input) input.focus();
  }
}

async function submitVault(apiPrefix, uiPrefix) {
  const inputId = (uiPrefix || apiPrefix) + 'VaultInput';
  const addr = (document.getElementById(inputId)?.value || '').trim();
  try {
    const res = await fetch('/' + apiPrefix + '/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultAddress: addr }),
    });
    const data = await res.json();
    if (data.ok) {
      updateVaultDisplay(uiPrefix || apiPrefix, data.vault);
      toggleVaultInput(apiPrefix, uiPrefix);
      document.getElementById(inputId).value = '';
    } else {
      alert(data.error || 'Erreur');
    }
  } catch (e) {
    alert('Erreur: ' + e.message);
  }
}

let _aiActions = [];

async function checkAiKey() {
  try {
    const res = await fetch('/bot/ai/key');
    const data = await res.json();
    const panelEl = document.getElementById('aiPanel');
    const selEl = document.getElementById('aiProviderSelect');
    _updateProviderUI('openai', data.openai, 'aiKeyInput', 'aiKeyBtn', 'aiKeyStatus');
    _updateProviderUI('claude', data.claude, 'claudeKeyInput', 'claudeKeyBtn', 'claudeKeyStatus');
    const hasAny = data.openai.hasKey || data.claude.hasKey;
    panelEl.style.display = hasAny ? '' : 'none';
    if (!data.openai.hasKey && data.claude.hasKey) selEl.value = 'claude';
    else if (data.openai.hasKey) selEl.value = 'openai';
  } catch (e) {}
}

function _updateProviderUI(provider, info, inputId, btnId, statusId) {
  const statusEl = document.getElementById(statusId);
  const inputEl = document.getElementById(inputId);
  const btnEl = document.getElementById(btnId);
  if (info.hasKey) {
    statusEl.textContent = info.masked;
    statusEl.style.color = 'var(--accent-green)';
    inputEl.style.display = 'none';
    btnEl.textContent = 'Changer';
    btnEl.onclick = () => { inputEl.style.display = ''; inputEl.value = ''; btnEl.textContent = 'Connecter'; btnEl.onclick = () => setAiKey(provider); };
  } else {
    statusEl.textContent = '';
    inputEl.style.display = '';
    btnEl.textContent = 'Connecter';
    btnEl.onclick = () => setAiKey(provider);
  }
}

async function setAiKey(provider) {
  const inputId = provider === 'claude' ? 'claudeKeyInput' : 'aiKeyInput';
  const statusId = provider === 'claude' ? 'claudeKeyStatus' : 'aiKeyStatus';
  const key = document.getElementById(inputId).value.trim();
  if (!key) return;
  try {
    const res = await fetch('/bot/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, provider }) });
    const data = await res.json();
    if (data.ok) {
      checkAiKey();
    } else {
      document.getElementById(statusId).textContent = data.error || 'Erreur';
      document.getElementById(statusId).style.color = 'var(--accent-red)';
    }
  } catch (e) {
    document.getElementById(statusId).textContent = 'Erreur connexion';
  }
}

async function askAi() {
  const q = document.getElementById('aiQuestion').value.trim();
  const provider = document.getElementById('aiProviderSelect').value;
  const respEl = document.getElementById('aiResponse');
  const textEl = document.getElementById('aiResponseText');
  const actEl = document.getElementById('aiActions');
  const btn = document.getElementById('aiAskBtn');

  btn.disabled = true;
  btn.textContent = 'Analyse...';
  respEl.style.display = '';
  textEl.innerHTML = '<span class="ai-loading">Analyse en cours (' + (provider === 'claude' ? 'Claude' : 'GPT-4o') + ')...</span>';
  actEl.innerHTML = '';

  try {
    const res = await fetch('/bot/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q || null, provider }) });
    const data = await res.json();
    if (data.error) {
      textEl.textContent = 'Erreur: ' + data.error;
      return;
    }
    const cleanReply = data.reply.replace(/```actions[\s\S]*?```/g, '').trim();
    textEl.textContent = cleanReply;
    _aiActions = data.actions || [];
    if (_aiActions.length > 0) {
      actEl.innerHTML = '<div style="margin-top:8px;font-weight:600;font-size:11px;color:var(--accent-cyan);">Actions propos\u00e9es :</div>';
      _aiActions.forEach((action, i) => {
        const btn = document.createElement('button');
        btn.className = 'ai-action-btn';
        if (action.type === 'config') btn.textContent = 'Appliquer: ' + Object.entries(action.changes).map(([k,v]) => `${k}=${v}`).join(', ');
        else if (action.type === 'pairEdges') btn.textContent = 'Appliquer edges: ' + Object.keys(action.changes).length + ' paires';
        else if (action.type === 'enablePair') btn.textContent = (action.enabled ? 'Activer' : 'D\u00e9sactiver') + ': ' + action.pairId;
        else btn.textContent = JSON.stringify(action);
        btn.onclick = () => applyAiAction(action, btn);
        actEl.appendChild(btn);
      });
    }
  } catch (e) {
    textEl.textContent = 'Erreur: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyser';
  }
}

async function applyAiAction(action, btn) {
  btn.disabled = true;
  btn.textContent += ' ...';
  try {
    const res = await fetch('/bot/ai/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const data = await res.json();
    if (data.ok) {
      btn.textContent = 'Appliqu\u00e9 \u2713';
      btn.className = 'ai-action-btn ai-action-applied';
    } else {
      btn.textContent = 'Erreur: ' + (data.error || '?');
    }
  } catch (e) {
    btn.textContent = 'Erreur';
  }
}

checkAiKey();

async function fetchErrorsTable() {
  try {
    const errorType = document.getElementById('errorsTypeFilter')?.value || '';
    const timeRange = parseInt(document.getElementById('errorsTimeRange')?.value || '0');
    const fromTs = timeRange > 0 ? Date.now() - timeRange : 0;
    const url = `/bot/errors-table?from=${fromTs}&to=${Date.now()}&limit=100${errorType ? '&errorType=' + errorType : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    renderErrorsTable(data);
  } catch (e) {}
}

function renderErrorsTable(data) {
  const groupCards = document.getElementById('errorsGroupCards');
  const body = document.getElementById('errorsTableBody');
  if (!body) return;

  const rootCauseLabels = {
    orphan: 'Orphan',
    orphan_closed: 'Orphan',
    closed_orphan: 'Orphan',
    slippage_guard: 'Slippage',
    both_failed: 'Both Failed',
    error: 'Erreur',
    timeout: 'Timeout',
    margin: 'Margin',
  };

  const rootCauseColors = {
    orphan: '#f59e0b',
    slippage_guard: '#ef4444',
    both_failed: '#dc2626',
    error: '#ef4444',
    timeout: '#8b5cf6',
    margin: '#ec4899',
  };

  if (groupCards && data.groups) {
    if (data.groups.length === 0) {
      groupCards.innerHTML = '';
    } else {
      groupCards.innerHTML = `
        <div class="bot-summary-card">
          <div class="bot-card-label">Total Erreurs</div>
          <div class="bot-card-value negative">${data.totalErrors}</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Co\u00FBt Total</div>
          <div class="bot-card-value negative">$${data.totalCost.toFixed(4)}</div>
        </div>
      ` + data.groups.map(g => {
        const label = rootCauseLabels[g.errorType] || g.errorType;
        return `<div class="bot-summary-card">
          <div class="bot-card-label">${label}</div>
          <div class="bot-card-value">${g.count} <span style="font-size:0.65rem;color:var(--text-muted);">(-$${g.totalCost.toFixed(2)})</span></div>
        </div>`;
      }).join('');
    }
  }

  if (!data.trades || data.trades.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Aucune erreur</td></tr>';
    return;
  }

  body.innerHTML = data.trades.map(t => {
    const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
    const dirTag = t.direction === 1
      ? '<span class="dir-badge dir-d1">\u2212</span>'
      : '<span class="dir-badge dir-d2">+</span>';
    const causeLabel = rootCauseLabels[t.rootCause] || t.rootCause;
    const causeColor = rootCauseColors[t.rootCause] || 'var(--text-muted)';
    const reason = t.errorMsg ? (t.errorMsg.length > 60 ? t.errorMsg.slice(0, 60) + '...' : t.errorMsg) : '-';
    const costCls = t.errorCost > 0 ? 'negative' : '';
    return `<tr>
      <td>${t.id}</td>
      <td>${new Date(t.entryTs).toLocaleString()}</td>
      <td class="pair-cell">${pairLabel}</td>
      <td>${dirTag}</td>
      <td><span class="trade-status status-error">${t.status}</span></td>
      <td style="color:${causeColor};font-weight:600;">${causeLabel}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(t.errorMsg || '').replace(/"/g, '&quot;')}">${reason}</td>
      <td>${t.slippage ? t.slippage.toFixed(2) + ' bps' : '-'}</td>
      <td class="${costCls}">${t.errorCost > 0 ? '-$' + t.errorCost.toFixed(4) : '$0'}</td>
    </tr>`;
  }).join('');
}

async function pollDailyStats() {
  if (currentView !== 'botstats') return;
  try {
    const res = await fetch('/bot/daily-stats');
    const days = await res.json();
    renderHeatmapCalendar(days);
    renderDailyStatsTable(days);
  } catch (e) {}
  try {
    const res2 = await fetch('/bot/corrections-stats');
    const data = await res2.json();
    renderCorrectionsStats(data);
  } catch (e) {}
  fetchErrorsTable();
}

function renderCorrectionsStats(data) {
  const body = document.getElementById('correctionsStatsBody');
  const totalsEl = document.getElementById('correctionsStatsTotals');
  if (!body) return;
  if (!data || !data.rows || data.rows.length === 0) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Aucune correction/erreur</td></tr>';
    if (totalsEl) totalsEl.innerHTML = '';
    return;
  }
  body.innerHTML = data.rows.map(r => {
    const total = (r.dnCostUsd || 0) + (r.errCostUsd || 0);
    return `<tr>
      <td style="font-weight:600;">${r.coin}</td>
      <td>${r.dnCount}</td>
      <td class="negative">$${(r.dnCostUsd || 0).toFixed(4)}</td>
      <td>${r.errorCount}</td>
      <td>${r.orphanCount}</td>
      <td class="negative">$${(r.errCostUsd || 0).toFixed(4)}</td>
      <td class="negative" style="font-weight:700;">$${total.toFixed(4)}</td>
    </tr>`;
  }).join('');
  if (totalsEl && data.totals) {
    const t = data.totals;
    totalsEl.innerHTML = `<tr style="font-weight:700;border-top:2px solid var(--border-primary);">
      <td>Total</td>
      <td>${t.dnCount}</td>
      <td class="negative">$${t.dnCostUsd.toFixed(4)}</td>
      <td>${t.errorCount}</td>
      <td>${t.orphanCount}</td>
      <td class="negative">$${t.errCostUsd.toFixed(4)}</td>
      <td class="negative" style="font-weight:700;">$${t.totalCostUsd.toFixed(4)}</td>
    </tr>`;
  }
}

function renderHeatmapCalendar(days) {
  const container = document.getElementById('heatmapCalendar');
  const tooltip = document.getElementById('heatmapTooltip');
  if (!container) return;
  if (!days || days.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:12px;">Pas encore de donn\u00E9es</div>';
    return;
  }
  const dayMap = {};
  let maxPnl = 0.01;
  for (const d of days) {
    dayMap[d.date] = d;
    if (Math.abs(d.pnl_net) > maxPnl) maxPnl = Math.abs(d.pnl_net);
  }
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  const startDay = startDate.getDay();
  let html = '<div class="heatmap-grid">';
  const monthLabels = [];
  let lastMonth = -1;
  let cellIndex = 0;
  const d = new Date(startDate);
  while (d <= today) {
    const ds = d.toISOString().slice(0, 10);
    const dayData = dayMap[ds];
    let cls = 'heatmap-cell empty';
    let bg = '';
    if (dayData) {
      const pnl = dayData.pnl_net || 0;
      const intensity = Math.min(1, Math.abs(pnl) / maxPnl);
      if (pnl > 0) {
        const alpha = 0.2 + intensity * 0.6;
        bg = `background:rgba(16,185,129,${alpha});`;
        cls = 'heatmap-cell positive';
      } else if (pnl < 0) {
        const alpha = 0.2 + intensity * 0.6;
        bg = `background:rgba(239,68,68,${alpha});`;
        cls = 'heatmap-cell negative';
      } else {
        cls = 'heatmap-cell neutral';
      }
    }
    const m = d.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col: Math.floor(cellIndex / 7), label: ['Jan','F\u00E9v','Mar','Avr','Mai','Jun','Jul','Ao\u00FB','Sep','Oct','Nov','D\u00E9c'][m] });
      lastMonth = m;
    }
    html += `<div class="${cls}" style="${bg}" data-date="${ds}" data-pnl="${dayData ? dayData.pnl_net : ''}" data-trades="${dayData ? dayData.trades : ''}" data-wr="${dayData ? dayData.win_rate : ''}"></div>`;
    d.setDate(d.getDate() + 1);
    cellIndex++;
  }
  html += '</div>';
  const mlHtml = monthLabels.map(m => `<span style="position:absolute;left:${m.col * 15}px;font-size:9px;color:var(--text-muted);">${m.label}</span>`).join('');
  container.innerHTML = `<div style="position:relative;height:14px;margin-bottom:4px;">${mlHtml}</div>${html}`;
  container.querySelectorAll('.heatmap-cell').forEach(cell => {
    cell.addEventListener('mouseenter', (ev) => {
      const date = cell.dataset.date;
      const pnl = cell.dataset.pnl;
      const trades = cell.dataset.trades;
      const wr = cell.dataset.wr;
      if (!date) return;
      tooltip.innerHTML = `<b>${date}</b><br>PnL: ${pnl ? '$' + parseFloat(pnl).toFixed(4) : 'N/A'}<br>Trades: ${trades || 0}<br>Win Rate: ${wr ? wr + '%' : 'N/A'}`;
      tooltip.style.display = 'block';
      const rect = cell.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      tooltip.style.left = (rect.left - contRect.left + 8) + 'px';
      tooltip.style.top = (rect.top - contRect.top - 60) + 'px';
    });
    cell.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

function renderDailyStatsTable(days) {
  const body = document.getElementById('dailyStatsBody');
  const totals = document.getElementById('dailyStatsTotals');
  if (!body) return;
  if (!days || days.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Pas de donn\u00E9es</td></tr>';
    if (totals) totals.innerHTML = '';
    return;
  }
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  body.innerHTML = sorted.map(d => {
    const pnlClass = d.pnl_net > 0 ? 'positive' : d.pnl_net < 0 ? 'negative' : '';
    return `<tr>
      <td>${d.date}</td>
      <td class="${pnlClass}">${d.pnl_net >= 0 ? '+' : ''}$${d.pnl_net.toFixed(4)}</td>
      <td>${d.trades}</td>
      <td class="positive">${d.wins}</td>
      <td class="negative">${d.losses}</td>
      <td>${d.win_rate}%</td>
      <td>$${(d.volume || 0).toFixed(2)}</td>
      <td>$${(d.fees || 0).toFixed(4)}</td>
      <td>${d.errors || 0}</td>
    </tr>`;
  }).join('');
  if (totals) {
    const totPnl = days.reduce((s, d) => s + d.pnl_net, 0);
    const totTrades = days.reduce((s, d) => s + d.trades, 0);
    const totWins = days.reduce((s, d) => s + d.wins, 0);
    const totLosses = days.reduce((s, d) => s + d.losses, 0);
    const totWR = totTrades > 0 ? ((totWins / (totWins + totLosses)) * 100).toFixed(0) : '--';
    const totVol = days.reduce((s, d) => s + (d.volume || 0), 0);
    const totFees = days.reduce((s, d) => s + (d.fees || 0), 0);
    const totErrors = days.reduce((s, d) => s + (d.errors || 0), 0);
    const pnlCls = totPnl >= 0 ? 'positive' : 'negative';
    totals.innerHTML = `<tr style="font-weight:700;border-top:2px solid var(--border-primary);">
      <td>Total</td>
      <td class="${pnlCls}">${totPnl >= 0 ? '+' : ''}$${totPnl.toFixed(4)}</td>
      <td>${totTrades}</td>
      <td class="positive">${totWins}</td>
      <td class="negative">${totLosses}</td>
      <td>${totWR}%</td>
      <td>$${totVol.toFixed(2)}</td>
      <td>$${totFees.toFixed(4)}</td>
      <td>${totErrors}</td>
    </tr>`;
  }
}

let _scanResults = [];
const SCAN_DEPLOYER_COLORS = {xyz:'#4a90d9',flx:'#9b59b6',km:'#e67e22',cash:'#27ae60',vntl:'#e74c3c',hyna:'#f39c12',abcd:'#95a5a6'};
function deployerBadge(d) {
  const c = SCAN_DEPLOYER_COLORS[d] || '#888';
  return `<span style="background:${c};color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;">${d}</span>`;
}

async function scanPairs() {
  const btn = document.getElementById('scanPairsBtn');
  const status = document.getElementById('scanStatus');
  btn.disabled = true;
  status.textContent = 'Scanning...';
  try {
    const res = await fetch('/pairs/scan');
    const data = await res.json();
    _scanResults = data.pairs || [];
    const addedCount = _scanResults.filter(p => p.added).length;
    const newCount = _scanResults.length - addedCount;
    status.textContent = `${_scanResults.length} paires (${addedCount} ajout\u00e9es, ${newCount} disponibles)`;
    document.getElementById('scanResults').style.display = _scanResults.length > 0 ? '' : 'none';
    renderScanTable();
  } catch (e) {
    status.textContent = 'Erreur: ' + e.message;
  }
  btn.disabled = false;
}

function filterScanResults() { renderScanTable(); }

function renderScanTable() {
  const body = document.getElementById('scanResultsBody');
  const coinFilter = (document.getElementById('scanFilterInput').value || '').toUpperCase().trim();
  const depFilter = document.getElementById('scanFilterDeployer').value;
  const showAdded = document.getElementById('scanShowAdded').checked;
  const filtered = _scanResults.filter(p => {
    if (!showAdded && p.added) return false;
    if (coinFilter && !p.coin.toUpperCase().includes(coinFilter)) return false;
    if (depFilter && p.deployerA !== depFilter && p.deployerB !== depFilter) return false;
    return true;
  });
  body.innerHTML = filtered.map((p) => {
    const origIdx = _scanResults.indexOf(p);
    const statusBadge = p.added
      ? '<span style="background:#27ae60;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;">Ajout\u00e9e</span>'
      : '<span style="background:var(--gold);color:#1a1a2e;padding:1px 6px;border-radius:4px;font-size:10px;">Disponible</span>';
    const actionBtn = p.added
      ? `<button class="btn btn-sm" onclick="scanRemovePair(${origIdx})" style="background:#e74c3c;color:#fff;padding:2px 8px;font-size:10px;border-radius:4px;border:none;cursor:pointer;">Retirer</button>`
      : `<button class="btn btn-sm" onclick="scanAddPair(${origIdx})" style="background:var(--gold);color:#1a1a2e;padding:2px 8px;font-size:10px;border-radius:4px;border:none;cursor:pointer;font-weight:700;">Ajouter</button>`;
    return `<tr style="${p.added ? 'opacity:0.7;' : ''}">
      <td>${p.added ? '' : `<input type="checkbox" class="scan-check" data-idx="${origIdx}">`}</td>
      <td><b>${p.coin}</b></td>
      <td>${deployerBadge(p.deployerA)}</td>
      <td>${deployerBadge(p.deployerB)}</td>
      <td>${p.maxLeverage || '--'}</td>
      <td>${statusBadge}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

async function scanAddPair(idx) {
  const p = _scanResults[idx];
  if (!p) return;
  try {
    const res = await fetch('/pairs/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketA: p.marketA || (p.deployerA + ':' + p.coin), marketB: p.marketB || (p.deployerB + ':' + p.coin) }),
    });
    const d = await res.json();
    if (d.ok) {
      p.added = true;
      renderScanTable();
      loadPairs();
      showToast(p.coin + ' ajout\u00e9e', 'success');
    }
  } catch (e) { console.error(e); }
}

async function scanRemovePair(idx) {
  const p = _scanResults[idx];
  if (!p) return;
  const pairId = p.id || (p.deployerA + '-' + p.deployerB + '-' + p.coin);
  try {
    const res = await fetch('/pairs/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId }),
    });
    const d = await res.json();
    if (d.ok) {
      p.added = false;
      renderScanTable();
      loadPairs();
      showToast(p.coin + ' retir\u00e9e', 'success');
    }
  } catch (e) { console.error(e); }
}

function toggleAllScanResults(checked) {
  document.querySelectorAll('.scan-check').forEach(cb => { cb.checked = checked; });
}

async function addSelectedPairs() {
  const checks = document.querySelectorAll('.scan-check:checked');
  if (checks.length === 0) return;
  const btn = document.getElementById('addSelectedPairsBtn');
  btn.disabled = true;
  btn.textContent = 'Ajout en cours...';
  let added = 0;
  for (const cb of checks) {
    const idx = parseInt(cb.dataset.idx);
    const p = _scanResults[idx];
    if (!p || p.added) continue;
    try {
      const res = await fetch('/pairs/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketA: p.marketA || (p.deployerA + ':' + p.coin), marketB: p.marketB || (p.deployerB + ':' + p.coin) }),
      });
      const d = await res.json();
      if (d.ok) { added++; p.added = true; }
    } catch (e) {}
  }
  btn.textContent = `${added} paire(s) ajout\u00e9e(s)`;
  renderScanTable();
  loadPairs();
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Ajouter s\u00e9lectionn\u00e9es';
  }, 2000);
}

setInterval(poll, 1000);
setInterval(pollSpreadChart, 1000);
setInterval(pollFullHistory, 3000);
setInterval(pollCounts, 2000);
async function fetchFeeDrift() {
  try {
    const res = await fetch('/bot/fee-drift');
    const data = await res.json();
    const summary = data.summary;

    const alertBanner = document.getElementById('feeDriftAlertBanner');
    if (summary.alert) {
      alertBanner.style.display = 'block';
      alertBanner.innerHTML = `\u26A0\uFE0F Fee drift alert: avg drift = <strong>${summary.avgDriftBps} bps</strong> (threshold: 0.5 bps)`;
      alertBanner.className = 'fee-drift-alert ' + (summary.avgDriftBps > 0 ? 'drift-over' : 'drift-under');
    } else {
      alertBanner.style.display = 'none';
    }

    const summaryEl = document.getElementById('feeDriftSummary');
    const driftCls = Math.abs(summary.avgDriftBps) > 0.5 ? (summary.avgDriftBps > 0 ? 'negative' : 'positive') : '';
    summaryEl.innerHTML = `
      <div class="bot-summary-card">
        <div class="bot-card-label">Fees Attendus</div>
        <div class="bot-card-value">$${summary.totalExpected}</div>
      </div>
      <div class="bot-summary-card">
        <div class="bot-card-label">Fees R\u00E9alis\u00E9s</div>
        <div class="bot-card-value">$${summary.totalRealized}</div>
      </div>
      <div class="bot-summary-card ${driftCls ? 'lose' : ''}">
        <div class="bot-card-label">Drift Moyen</div>
        <div class="bot-card-value ${driftCls}">${summary.avgDriftBps} bps</div>
      </div>
    `;

    const dailyBody = document.getElementById('feeDriftDailyBody');
    if (data.daily.length === 0) {
      dailyBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
    } else {
      dailyBody.innerHTML = data.daily.map(d => {
        const drift = parseFloat(d.driftUsd);
        const driftClass = Math.abs(drift) < 0.001 ? '' : (drift > 0 ? 'negative' : 'positive');
        return `<tr>
          <td>${d.day}</td>
          <td>${d.trades}</td>
          <td>$${d.totalExpected.toFixed(4)}</td>
          <td>$${d.totalRealized.toFixed(4)}</td>
          <td class="${driftClass}">${drift >= 0 ? '+' : ''}$${drift.toFixed(4)}</td>
        </tr>`;
      }).join('');
    }

    const tradesBody = document.getElementById('feeDriftTradesBody');
    if (data.trades.length === 0) {
      tradesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
    } else {
      tradesBody.innerHTML = data.trades.map(t => {
        const drift = parseFloat(t.driftUsd);
        const driftClass = Math.abs(drift) < 0.0001 ? '' : (drift > 0 ? 'negative' : 'positive');
        const bpsDriftClass = Math.abs(t.driftBps) > 0.5 ? (t.driftBps > 0 ? 'negative' : 'positive') : '';
        const pairLabel = (pairsList.find(p => p.id === t.pair) || {}).label || t.pair;
        return `<tr>
          <td>${t.id}</td>
          <td class="pair-cell">${pairLabel}</td>
          <td><span class="tag ${t.dir == 1 ? 'dir1' : 'dir2'}">D${t.dir}</span></td>
          <td>$${t.expected}</td>
          <td>$${t.realized}</td>
          <td class="${driftClass}">${drift >= 0 ? '+' : ''}$${drift.toFixed(4)}</td>
          <td class="${bpsDriftClass}">${t.driftBps >= 0 ? '+' : ''}${t.driftBps} bps</td>
        </tr>`;
      }).join('');
    }
  } catch (e) {
    console.error('[FeeDrift] Error:', e);
  }
}

async function fetchPoolRanking() {
  try {
    const res = await fetch('/bot/pool-ranking');
    const data = await res.json();
    const body = document.getElementById('poolRankingBody');
    if (!body) return;

    if (!data.pools || data.pools.length === 0) {
      body.innerHTML = '<tr><td colspan="14" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      return;
    }

    body.innerHTML = data.pools.map((p, i) => {
      const pairLabel = (pairsList.find(pr => pr.id === p.pairId) || {}).label || p.pairId;
      const netCls = p.pnlNet >= 0 ? 'positive' : 'negative';
      const pvCls = p.pnlPerVolBps >= 0 ? 'positive' : 'negative';
      const scoreCls = p.score > 0 ? 'positive' : p.score < 0 ? 'negative' : '';
      const medal = i === 0 ? '\uD83E\uDD47 ' : i === 1 ? '\uD83E\uDD48 ' : i === 2 ? '\uD83E\uDD49 ' : '';
      return `<tr>
        <td>${medal}${i + 1}</td>
        <td class="pair-cell">${pairLabel}</td>
        <td class="${scoreCls}" style="font-weight:700;">${p.score.toFixed(3)}</td>
        <td>${p.closedTrades}/${p.totalTrades}</td>
        <td>${p.winRate}%</td>
        <td class="${netCls}">${p.pnlNet >= 0 ? '+' : ''}$${p.pnlNet.toFixed(4)}</td>
        <td class="${pvCls}">${p.pnlPerVolBps.toFixed(2)}</td>
        <td>${p.fillRate}%</td>
        <td>${fmtDuration(p.avgHoldMs)}</td>
        <td>${fmtDuration(p.medianHoldMs)}</td>
        <td>${fmtDuration(p.p90HoldMs)}</td>
        <td>$${p.volume.toFixed(0)}</td>
        <td>$${p.fees.toFixed(4)}</td>
        <td>${p.errors}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('[PoolRanking] Error:', e);
  }
}

async function fetchAllocationAdvisor() {
  try {
    const capital = document.getElementById('allocCapital')?.value || 1000;
    const leverage = document.getElementById('allocLeverage')?.value || 5;
    const risk = document.getElementById('allocRisk')?.value || 'normal';
    const res = await fetch(`/bot/capital-allocation?capital=${capital}&leverage=${leverage}&risk=${risk}`);
    const data = await res.json();
    const summary = document.getElementById('allocAdvisorSummary');
    const body = document.getElementById('allocAdvisorBody');
    if (!body) return;

    if (data.message || !data.allocations || data.allocations.length === 0) {
      if (summary) summary.innerHTML = '';
      body.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">${data.message || 'Aucune donn\u00E9e'}</td></tr>`;
      return;
    }

    const riskLabels = { aggressive: 'Agressif', normal: 'Normal', conservative: 'Conservateur' };
    if (summary) {
      summary.innerHTML = `
        <div class="bot-summary-card"><div class="bot-card-label">Capital</div><div class="bot-card-value">$${parseFloat(data.totalCapital).toLocaleString()}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Max Levier</div><div class="bot-card-value">${data.maxLeverage}x</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Notionnel Max</div><div class="bot-card-value highlight">$${parseFloat(data.maxNotional).toLocaleString()}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Risque</div><div class="bot-card-value">${riskLabels[data.riskPref] || data.riskPref}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Paires</div><div class="bot-card-value">${data.allocations.length}</div></div>`;
    }

    body.innerHTML = data.allocations.map((a, i) => {
      const pairLabel = (pairsList.find(pr => pr.id === a.pairId) || {}).label || a.pairId;
      const netCls = a.pnlNet >= 0 ? 'positive' : 'negative';
      const pvCls = a.pnlPerVolBps >= 0 ? 'positive' : 'negative';
      const scoreCls = a.score > 0 ? 'positive' : a.score < 0 ? 'negative' : '';
      const errCls = a.errorRate > 15 ? 'negative' : a.errorRate > 5 ? '' : 'positive';
      const pctBar = `<div style="display:flex;align-items:center;gap:6px;"><span>${a.allocationPct.toFixed(1)}%</span><div style="width:60px;height:6px;background:var(--border-primary);border-radius:3px;overflow:hidden;"><div style="width:${Math.min(a.allocationPct, 100)}%;height:100%;background:linear-gradient(90deg,var(--accent-gold),var(--accent-amber));border-radius:3px;"></div></div></div>`;
      return `<tr>
        <td>${i + 1}</td>
        <td class="pair-cell">${pairLabel}</td>
        <td>${pctBar}</td>
        <td style="font-weight:700;">$${a.allocationUsd.toFixed(0)}</td>
        <td class="${scoreCls}">${a.score.toFixed(3)}</td>
        <td>${a.winRate.toFixed(1)}%</td>
        <td class="${errCls}">${a.errorRate.toFixed(1)}%</td>
        <td class="${netCls}">${a.pnlNet >= 0 ? '+' : ''}$${a.pnlNet.toFixed(4)}</td>
        <td class="${pvCls}">${a.pnlPerVolBps.toFixed(2)}</td>
        <td>${a.closedTrades}</td>
        <td style="font-size:0.65rem;font-family:'Inter',sans-serif;white-space:normal;max-width:180px;">${a.reasons.join(', ')}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('[AllocationAdvisor] Error:', e);
  }
}

async function fetchPnlReconciliation() {
  try {
    const res = await fetch('/bot/pnl-reconciliation');
    const data = await res.json();
    const totals = data.totals;
    const totEl = document.getElementById('reconTotals');
    if (totEl) {
      const netVal = parseFloat(totals.netPnl) || 0;
      const fundVal = parseFloat(totals.funding) || 0;
      const feesVal = parseFloat(totals.fees) || 0;
      const errVal = parseFloat(totals.errorCost) || 0;
      const netCls = netVal >= 0 ? 'positive' : 'negative';
      totEl.innerHTML = `
        <div class="bot-summary-card"><div class="bot-card-label">Gross PnL</div><div class="bot-card-value">$${totals.grossPnl}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Fees</div><div class="bot-card-value negative">-$${Math.abs(feesVal).toFixed(4)}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Funding</div><div class="bot-card-value ${fundVal >= 0 ? 'positive' : 'negative'}">${fundVal >= 0 ? '+' : ''}$${fundVal.toFixed(4)}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Err Cost</div><div class="bot-card-value negative">-$${Math.abs(errVal).toFixed(4)}</div></div>
        <div class="bot-summary-card highlight"><div class="bot-card-label">Net PnL</div><div class="bot-card-value ${netCls}">${netVal >= 0 ? '+' : ''}$${netVal.toFixed(4)}</div></div>`;
    }
    const body = document.getElementById('reconBody');
    if (body) {
      body.innerHTML = data.trades.map(t => {
        const net = parseFloat(t.netPnl) || 0;
        const cls = net > 0 ? 'positive' : net < 0 ? 'negative' : '';
        return `<tr>
          <td>${t.id}</td><td>${t.pair}</td><td>D${t.dir}</td><td>${t.status}</td><td>${t.holdMin}m</td>
          <td>$${t.grossPnl}</td><td class="negative">-$${Math.abs(parseFloat(t.fees) || 0).toFixed(4)}</td>
          <td class="negative">${(parseFloat(t.errorCost) || 0) > 0 ? '-$'+t.errorCost : '-'}</td>
          <td class="${cls}">${net >= 0 ? '+' : ''}$${net.toFixed(4)}</td>
          <td>${t.signalEdge || '-'}</td><td>${t.slippage || '-'}</td>
        </tr>`;
      }).join('');
    }
  } catch (e) { console.error('Recon fetch error:', e); }
}

async function pollDnStatus() {
  if (currentView !== 'bot' && currentView !== 'botstats') return;
  try {
    const res = await fetch('/bot/dn-status');
    const data = await res.json();
    const badge = document.getElementById('dnStatusBadge');
    const container = document.getElementById('dnStatusContainer');
    if (!badge || !container) return;

    if (data.status === 'critical') {
      badge.className = 'dn-badge dn-critical';
      badge.innerHTML = '&#x26A0; CRITICAL';
    } else if (data.status === 'warning') {
      badge.className = 'dn-badge dn-warning';
      badge.innerHTML = '&#x26A0; WARNING';
    } else {
      badge.className = 'dn-badge dn-ok';
      badge.innerHTML = '&#x2714; OK';
    }

    const compactEl = document.getElementById('dnCompactSummary');
    const tradeCount = (data.trades || []).length;
    const imbalanceCount = (data.trades || []).filter(t => t.level !== 'ok').length;
    const corrCount = (data.aggregate && data.aggregate.corrections) ? data.aggregate.corrections.length : 0;
    if (compactEl) {
      compactEl.textContent = `${tradeCount} checked, ${imbalanceCount} imbalance${imbalanceCount !== 1 ? 's' : ''}, ${corrCount} correction${corrCount !== 1 ? 's' : ''}`;
    }

    if (!data.trades || data.trades.length === 0) {
      const lastStr = data.lastCheck ? new Date(data.lastCheck).toLocaleTimeString() : '--';
      container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:8px;">Aucune position ouverte \u00E0 v\u00E9rifier. Dernier check: ${lastStr}</div>`;
    } else {
      const lastStr = data.lastCheck ? new Date(data.lastCheck).toLocaleTimeString() : '--';
      let html = `<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">Dernier check: ${lastStr}</div>`;
      for (const t of data.trades) {
        const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
        const ratioColor = t.level === 'critical' ? '#ef4444' : t.level === 'warning' ? '#f59e0b' : '#10b981';
        const fillWidth = Math.max(0, Math.min(100, t.ratioPct));
        html += `<div class="dn-trade-row">
          <span style="min-width:30px;font-weight:600;">#${t.tradeId}</span>
          <span style="min-width:100px;">${pairLabel}</span>
          <span style="min-width:55px;color:${ratioColor};font-weight:600;">${t.ratioPct}%</span>
          <span class="dn-ratio-bar"><span class="dn-ratio-fill" style="width:${fillWidth}%;background:${ratioColor};"></span></span>
          <span style="color:var(--text-muted);font-size:0.7rem;">A: $${t.notionalA.toFixed(2)} | B: $${t.notionalB.toFixed(2)}</span>
        </div>`;
      }
      container.innerHTML = html;
    }

    const aggBadge = document.getElementById('dnAggBadge');
    const aggContainer = document.getElementById('dnAggContainer');
    const aggCorrContainer = document.getElementById('dnAggCorrectionsContainer');
    const agg = data.aggregate;

    if (aggBadge && agg) {
      if (agg.status === 'critical') {
        aggBadge.className = 'dn-badge dn-critical';
        aggBadge.innerHTML = '&#x26A0; CRITICAL';
      } else if (agg.status === 'warning') {
        aggBadge.className = 'dn-badge dn-warning';
        aggBadge.innerHTML = '&#x26A0; WARNING';
      } else {
        aggBadge.className = 'dn-badge dn-ok';
        aggBadge.innerHTML = '&#x2714; OK';
      }
    }

    if (aggContainer && agg) {
      const coins = agg.coins || [];
      if (coins.length === 0) {
        aggContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:8px;">Aucune exposition agr\u00E9g\u00E9e d\u00E9tect\u00E9e.</div>';
      } else {
        let aggHtml = '<div class="table-scroll"><table class="signals-table compact" style="font-size:0.72rem;"><thead><tr><th>Coin</th><th>Long ($)</th><th>Short ($)</th><th>Net ($)</th><th>Ratio</th><th>Status</th></tr></thead><tbody>';
        for (const c of coins) {
          const statusColor = c.status === 'critical' ? '#ef4444' : c.status === 'warning' ? '#f59e0b' : '#10b981';
          const statusLabel = c.status === 'critical' ? 'CRITICAL' : c.status === 'warning' ? 'WARNING' : 'OK';
          const closingTag = c.isClosing ? ' <span style="font-size:9px;color:#f59e0b;">(closing)</span>' : '';
          aggHtml += `<tr>
            <td style="font-weight:600;">${c.symbol}${closingTag}</td>
            <td>$${c.totalLong.toFixed(2)}</td>
            <td>$${c.totalShort.toFixed(2)}</td>
            <td style="color:${c.net > 1 ? '#f59e0b' : 'var(--text-secondary)'};">$${c.net.toFixed(2)}</td>
            <td style="color:${statusColor};font-weight:600;">${c.ratio.toFixed(1)}%</td>
            <td><span style="color:${statusColor};font-weight:600;font-size:0.68rem;">${statusLabel}</span></td>
          </tr>`;
        }
        aggHtml += '</tbody></table></div>';
        aggContainer.innerHTML = aggHtml;
      }
    }

    if (aggCorrContainer && agg) {
      const corrections = agg.corrections || [];
      if (corrections.length === 0) {
        aggCorrContainer.innerHTML = '';
      } else {
        let corrHtml = '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">Corrections r\u00E9centes</div>';
        corrHtml += '<div class="table-scroll"><table class="signals-table compact" style="font-size:0.68rem;"><thead><tr><th>Heure</th><th>Coin</th><th>Action</th><th>Size</th><th>Co\u00FBt ($)</th><th>Status</th></tr></thead><tbody>';
        for (const cr of corrections) {
          const timeStr = new Date(cr.ts).toLocaleTimeString();
          const costStr = cr.costUsd !== undefined ? '$' + cr.costUsd.toFixed(4) : '-';
          const statusColor = cr.status === 'filled' ? '#10b981' : '#ef4444';
          corrHtml += `<tr>
            <td>${timeStr}</td>
            <td>${cr.symbol} <span style="color:var(--text-muted);font-size:9px;">(${cr.deployer})</span></td>
            <td style="font-weight:600;">${cr.action.toUpperCase()}</td>
            <td>${cr.size}</td>
            <td>${costStr}</td>
            <td style="color:${statusColor};font-weight:600;">${cr.status}</td>
          </tr>`;
        }
        corrHtml += '</tbody></table></div>';
        aggCorrContainer.innerHTML = corrHtml;
      }
    }
  } catch (e) {}
}

async function pollDeployerStats() {
  if (currentView !== 'main') return;
  try {
    const res = await fetch('/supervisor/deployer-stats');
    const data = await res.json();
    if (!data || data.error) return;
    const fmtVol = v => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + v.toFixed(2);
    for (const [dep, stats] of Object.entries(data)) {
      const cap = dep.charAt(0).toUpperCase() + dep.slice(1);
      const volEl = document.getElementById('depVol' + cap);
      const feesEl = document.getElementById('depFees' + cap);
      const tradesEl = document.getElementById('depTrades' + cap);
      if (volEl) volEl.textContent = fmtVol(stats.totalVolume || 0);
      if (feesEl) feesEl.textContent = '$' + (stats.totalFees || 0).toFixed(4);
      if (tradesEl) tradesEl.textContent = String(stats.tradeCount || 0);
    }
  } catch (e) {}
}

pollDeployerStats();
setInterval(pollDeployerStats, 10000);

setInterval(pollOverview, 3000);
setInterval(pollOverviewActivity, 3000);
setInterval(pollBotActivity, 2000);
setInterval(pollAlerts, 3000);
setInterval(pollWalletBalances, 10000);
setInterval(pollBotFunding, 30000);
setInterval(pollBotStats, 5000);
setInterval(pollDailyStats, 10000);
setInterval(pollDnStatus, 10000);
pollOverviewActivity();
pollDnStatus();
_initActivityFilters();

let bot2ClosedTradesData = [];
let bot2ClosedTradesOpen = false;
(async function checkBot2() {
  try {
    const r = await fetch('/bot2/available');
    const d = await r.json();
    bot2Available = d.available;
  } catch (e) {}
  const nc1 = document.getElementById('bot2NotConfigured');
  const nc2 = document.getElementById('botstats2NotConfigured');
  const c1 = document.getElementById('bot2Content');
  const c2 = document.getElementById('botstats2Content');
  if (bot2Available) {
    if (nc1) nc1.style.display = 'none';
    if (nc2) nc2.style.display = 'none';
    if (c1) c1.style.display = '';
    if (c2) c2.style.display = '';
  } else {
    if (nc1) nc1.style.display = '';
    if (nc2) nc2.style.display = '';
    if (c1) c1.style.display = 'none';
    if (c2) c2.style.display = 'none';
  }
})();

(async function checkBot3() {
  try {
    const r = await fetch('/bot3/available');
    const d = await r.json();
    bot3Available = d.available;
  } catch (e) {}
})();

(async function checkBot4() {
  try {
    const r = await fetch('/bot4/available');
    const d = await r.json();
    bot4Available = d.available;
  } catch (e) {}
})();

(async function checkBot5() {
  try {
    const r = await fetch('/bot5/available');
    const d = await r.json();
    bot5Available = d.available;
  } catch (e) {}
})();

(async function checkBot6() {
  try {
    const r = await fetch('/bot6/available');
    const d = await r.json();
    bot6Available = d.available;
  } catch (e) {}
})();

async function pollBot2() {
  if (currentView !== 'bot2' || !bot2Available) return;
  try {
    const [statusRes, balRes, keyRes, pingRes] = await Promise.all([
      fetch('/bot2/status'), fetch('/bot2/wallet/balances'), fetch('/bot2/api-key'), fetch('/bot2/ping')
    ]);
    const data = await statusRes.json();
    const bal = await balRes.json();
    const key = await keyRes.json();
    const ping = await pingRes.json();
    const dot = document.getElementById('botDot2');
    const text = document.getElementById('botStatusText2');
    if (data.enabled && data.liquidationMode) {
      dot.className = 'status-dot liquidating'; text.textContent = 'LIQUIDATION'; text.style.color = '#f59e0b';
      document.getElementById('botStartBtn2').style.display = 'none'; document.getElementById('botStopBtn2').style.display = '';
      document.getElementById('botLiquidationBtn2').style.display = 'none'; document.getElementById('botStopLiquidationBtn2').style.display = '';
    } else if (data.enabled) {
      dot.className = 'status-dot connected'; text.textContent = 'ACTIVE'; text.style.color = '#10b981';
      document.getElementById('botStartBtn2').style.display = 'none'; document.getElementById('botStopBtn2').style.display = '';
      document.getElementById('botLiquidationBtn2').style.display = ''; document.getElementById('botStopLiquidationBtn2').style.display = 'none';
    } else {
      dot.className = 'status-dot disconnected'; text.textContent = data.initialized ? 'STOPPED' : 'NOT INITIALIZED';
      text.style.color = data.initialized ? '#f59e0b' : '#ef4444';
      document.getElementById('botStartBtn2').style.display = ''; document.getElementById('botStopBtn2').style.display = 'none';
      document.getElementById('botLiquidationBtn2').style.display = 'none'; document.getElementById('botStopLiquidationBtn2').style.display = 'none';
    }
    const ls = data.liveStats || {};
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('botPnl2', '$' + (ls.realizedPnl || 0).toFixed(4));
    el('botFees2', '$' + (ls.totalFees || 0).toFixed(4));
    el('botVolume2', '$' + ((ls.totalVolumeUsd || 0) / 1000).toFixed(2) + 'K');
    el('botOpen2', ls.open || 0);
    el('botClosed2', ls.closed || 0);
    el('botWins2', ls.wins || 0);
    el('botLosses2', ls.losses || 0);
    el('botErrors2', ls.errors || 0);
    el('botOrphansClosed2', ls.orphansClosed || 0);
    const oc2 = ls.orphanCostUsd || 0;
    const ocEl2 = document.getElementById('botOrphanCost2');
    if (ocEl2) { ocEl2.textContent = oc2 > 0 ? `-$${oc2.toFixed(4)}` : '$0.0000'; if (oc2 > 0) ocEl2.className = 'bot-card-value negative'; }
    el('botErrorCost2', '$' + (ls.errorCost || 0).toFixed(4));
    el('botSlippage2', (ls.avgSlippage || 0).toFixed(2) + ' bps');
    const wr = (ls.closed > 0) ? Math.round(ls.wins / ls.closed * 100) : 0;
    el('botWinRate2', wr + '%');
    el('balUSDC2', parseFloat(bal.usdc || 0).toFixed(2));
    el('balUSDT2', parseFloat(bal.usdt || 0).toFixed(2));
    el('balUSDH2', parseFloat(bal.usdh || 0).toFixed(2));
    el('balTotal2', (parseFloat(bal.usdc || 0) + parseFloat(bal.usdt || 0) + parseFloat(bal.usdh || 0)).toFixed(2));
    el('inlinePing2', ping.ok ? ping.pingMs + 'ms' : '?');
    el('inlineExec2', (data.execTime || {}).avg ? data.execTime.avg + 'ms' : '--');
    el('inlineFees2', data.feeRates ? (data.feeRates.takerFeeGrowthBps || '?') + 'bps' : '--');
    el('botApiKeyMasked2', key.masked || '--');
    el('botWalletAddr2', key.wallet || '');
    updateVaultDisplay('bot2', key.vault);
    if (data.maxPositionUsd != null) document.getElementById('botPosSize2').value = data.maxPositionUsd;
    if (data.maxGlobalPositions != null) document.getElementById('botMaxGlobal2').value = data.maxGlobalPositions;
    if (data.maxLeverage != null) document.getElementById('botMaxLeverage2').value = data.maxLeverage;
    if (data.stopLossBps != null) document.getElementById('botStopLoss2').value = data.stopLossBps;
    if (data.costsBps != null) document.getElementById('botCostsBps2').value = data.costsBps;
    if (data.p50Mode) {
      _bot2P50Mode = data.p50Mode;
      _highlightModeButtons('p50ModeSelector2', data.p50Mode);
      _updateZScoreConfigVisibility('zScoreConfig2', data.p50Mode);
      _updateZScoreSliders('2', data);
      _updateBot2ConfigMargeHeaders();
    }
    if (data.bufferBps !== undefined) {
      const bi2 = document.getElementById('bufferBpsInput2');
      if (bi2 && document.activeElement !== bi2) bi2.value = data.bufferBps;
    }
    if (data.slippageMarginBps !== undefined) {
      const si2 = document.getElementById('slipMarginInput2');
      if (si2 && document.activeElement !== si2) si2.value = data.slippageMarginBps;
    }
    if (data.dataTimer) {
      const dt2 = document.getElementById('dataTimerSelect2');
      if (dt2 && document.activeElement !== dt2) dt2.value = data.dataTimer;
    }
    if (data.zMeanRevert !== undefined) {
      const zmr2 = document.getElementById('zMeanRevertToggle2');
      if (zmr2) zmr2.checked = data.zMeanRevert;
    }
    if (data.feeRoundTripBps !== undefined) {
      const efd2 = document.getElementById('entryFeesDisplay2');
      if (efd2) efd2.textContent = data.feeRoundTripBps.toFixed(2) + ' bps RT';
    }
    if (data.enabledPairs) {
      const c = document.getElementById('botPairToggles2');
      if (c && c.children.length === 0) {
        for (const p of pairsList) {
          const on = data.enabledPairs[p.id] !== false;
          const d = document.createElement('div');
          d.className = 'pair-toggle-item';
          d.innerHTML = `<label class="pair-toggle"><input type="checkbox" data-pair="${p.id}" ${on ? 'checked' : ''} onchange="toggleBot2Pair('${p.id}', this.checked)"><span class="pair-toggle-label">${p.label || p.id}</span></label>`;
          c.appendChild(d);
        }
      }
    }
    el('botFundingNet2', '$' + (ls.fundingNet || 0).toFixed(4));

    const el2 = ls.e2eLatency || data.e2eLatency;
    if (el2 && el2.count > 0) {
      const _lc2 = v => v <= 500 ? 'latency-incredible' : v <= 1500 ? 'latency-good' : v <= 3000 ? 'latency-ok' : 'latency-bad';
      const eAvg2 = document.getElementById('botEntryLatAvg2');
      const eP502 = document.getElementById('botEntryLatP50_2');
      const eP952 = document.getElementById('botEntryLatP95_2');
      const eCnt2 = document.getElementById('botEntryLatCount2');
      if (eAvg2) eAvg2.innerHTML = `<span class="${_lc2(el2.avg)}">${el2.avg}ms</span>`;
      if (eP502) eP502.innerHTML = `<span class="${_lc2(el2.p50)}">${el2.p50}ms</span>`;
      if (eP952) eP952.innerHTML = `<span class="${_lc2(el2.p95)}">${el2.p95}ms</span>`;
      if (eCnt2) eCnt2.textContent = el2.count;
    }

    const cl2 = ls.closeLatency || data.closeLatency;
    if (cl2 && cl2.count > 0) {
      const clsAvg = cl2.avg <= 500 ? 'latency-incredible' : cl2.avg <= 1500 ? 'latency-good' : cl2.avg <= 3000 ? 'latency-ok' : 'latency-bad';
      const clsP50 = cl2.p50 <= 500 ? 'latency-incredible' : cl2.p50 <= 1500 ? 'latency-good' : cl2.p50 <= 3000 ? 'latency-ok' : 'latency-bad';
      const clsP95 = cl2.p95 <= 1000 ? 'latency-incredible' : cl2.p95 <= 2000 ? 'latency-good' : cl2.p95 <= 5000 ? 'latency-ok' : 'latency-bad';
      const avgEl2 = document.getElementById('botCloseLatAvg2');
      const p50El2 = document.getElementById('botCloseLatP50_2');
      const p95El2 = document.getElementById('botCloseLatP95_2');
      const cntEl2 = document.getElementById('botCloseLatCount2');
      if (avgEl2) avgEl2.innerHTML = `<span class="${clsAvg}">${cl2.avg}ms</span>`;
      if (p50El2) p50El2.innerHTML = `<span class="${clsP50}">${cl2.p50}ms</span>`;
      if (p95El2) p95El2.innerHTML = `<span class="${clsP95}">${cl2.p95}ms</span>`;
      if (cntEl2) cntEl2.textContent = cl2.count;
    }

    const banner2 = document.getElementById('marginHealthBanner2');
    if (banner2) {
      const mh = ls.marginHealth || data.marginHealth;
      if (mh && mh.level && mh.level !== 'ok') {
        banner2.style.display = '';
        const color = mh.level === 'critical' ? '#ef4444' : '#f59e0b';
        banner2.innerHTML = `<span style="color:${color};font-weight:700;">&#x26A0; Margin ${mh.level.toUpperCase()}</span> — Usage: ${(mh.usagePct || 0).toFixed(1)}% | Free: $${(mh.freeMargin || 0).toFixed(2)}`;
        banner2.style.borderColor = color;
      } else {
        banner2.style.display = 'none';
      }
    }

    const pnlNet2 = (ls.realizedPnl || 0) - (ls.totalFees || 0) + (ls.fundingNet || 0);
    pushPnlHistory2(pnlNet2);
    _drawSparklineFromHistory('botPnlSparkline2', _pnlHistory2);

    if (!_pnlHistory2Loaded) {
      _pnlHistory2Loaded = true;
      try {
        const dailyRes2 = await fetch('/bot2/daily-stats');
        const dailyData2 = await dailyRes2.json();
        if (dailyData2 && dailyData2.length > 0) {
          const sorted2 = dailyData2.slice().sort((a, b) => a.date.localeCompare(b.date));
          let cumPnl2 = 0;
          for (const day of sorted2) {
            cumPnl2 += (day.pnl_net || 0);
            pushPnlHistory2(cumPnl2);
          }
        }
      } catch (e2) {}
    }

    pollFeeRates2();
  } catch (e) {}
}

async function pollFeeRates2() {
  try {
    const res = await fetch('/bot2/fees');
    const d = await res.json();
    const feesEl = document.getElementById('inlineFees2');
    if (feesEl && d.takerFeeGrowthBps) {
      const srcIcon = d.source === 'api' ? '\u2705' : '\u26A0';
      const ovr = d.growthFeeOverride !== null ? ' [ovr]' : '';
      feesEl.innerHTML = `Growth: ${d.takerFeeGrowthBps} bps | NoGrowth: ${d.takerFeeNoGrowthBps} bps ${srcIcon}${ovr}`;
    }
    const gfInput2 = document.getElementById('botGrowthFee2');
    if (gfInput2 && !gfInput2.matches(':focus')) {
      gfInput2.value = d.growthFeeOverride !== null ? (d.growthFeeOverride * 100).toFixed(4) : '';
      gfInput2.placeholder = d.growthFeeOverride === null ? `auto (${(d.takerFeeGrowth * 100).toFixed(4)})` : 'auto';
    }
    const badge2 = document.getElementById('feeSourceBadge2');
    if (badge2 && d.lastRefresh) {
      const ago = Math.round((Date.now() - d.lastRefresh) / 1000);
      const agoStr = ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m`;
      badge2.innerHTML = d.source === 'api'
        ? `<span style="color:#10b981;">API \u2713 ${agoStr}</span>`
        : `<span style="color:#f59e0b;">Config</span>`;
    }
  } catch (e) {}
}

async function pollBot2Trades() {
  if (currentView !== 'bot2' || !bot2Available) return;
  try {
    const [openRes, closedRes] = await Promise.all([fetch('/bot2/trades/open'), fetch('/bot2/trades/closed?n=50')]);
    const openTrades = await openRes.json();
    const closedData = await closedRes.json();
    const closedTrades = closedData.rows || closedData;
    bot2ClosedTradesData = closedTrades;
    document.getElementById('openTradesCount2').textContent = openTrades.length;
    const openBody = document.getElementById('botOpenTradesBody2');
    if (openTrades.length === 0) {
      openBody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:var(--text-muted);">Aucune position ouverte</td></tr>';
    } else {
      const now = Date.now();
      openBody.innerHTML = openTrades.map(t => {
        const pairLabel = (pairsList.find(p => p.id === t.pair_id) || {}).label || t.pair_id;
        return `<tr>
          <td>${t.id}</td><td class="pair-cell">${pairLabel}</td>
          <td>${t.direction == 1 ? '<span class="dir-badge dir-d1">\u2212</span>' : '<span class="dir-badge dir-d2">+</span>'}</td>
          <td>${t.leg_a_side || '--'}</td><td>${t.leg_b_side || '--'}</td>
          <td>${Number(t.signal_edge_bps).toFixed(2)}</td>
          <td>${t.slippage_entry_bps != null ? Number(t.slippage_entry_bps).toFixed(2) : '--'}</td>
          <td>${t.leg_a_fill_price ? Number(t.leg_a_fill_price).toFixed(4) : '--'}</td>
          <td>${t.leg_b_fill_price ? Number(t.leg_b_fill_price).toFixed(4) : '--'}</td>
          <td>${t.fees_usd ? '$' + Number(t.fees_usd).toFixed(4) : '--'}</td>
          <td>--</td>
          <td>${new Date(parseInt(t.entry_ts)).toLocaleTimeString()}</td>
          <td>${formatDuration(now - parseInt(t.entry_ts))}</td>
          <td><button class="force-close-btn" onclick="forceCloseBot2Trade(${t.id})">\u2715</button></td>
        </tr>`;
      }).join('');
    }
    document.getElementById('closedTradesCount2').textContent = closedData.total || closedTrades.length;
    if (bot2ClosedTradesOpen) {
      const closedBody = document.getElementById('botClosedTradesBody2');
      if (closedTrades.length === 0) {
        closedBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--text-muted);">Aucun trade</td></tr>';
      } else {
        closedBody.innerHTML = closedTrades.map(t => renderClosedRow(t)).join('');
      }
    }
  } catch (e) {}
}

async function pollBot2Activity() {
  if (currentView !== 'bot2' || !bot2Available) return;
  try {
    const res = await fetch('/bot2/activity?n=30');
    const entries = await res.json();
    const feed = document.getElementById('botActivityFeed2');
    if (!feed) return;
    feed.innerHTML = entries.map(e => {
      const ts = new Date(e.ts).toLocaleTimeString();
      const typeClass = e.type === 'trade_open' ? 'activity-open' : e.type === 'trade_close' ? 'activity-close' : e.type === 'error' ? 'activity-error' : '';
      return `<div class="activity-entry ${typeClass}"><span class="activity-time">${ts}</span><span class="activity-type">${e.type}</span>${e.pairId ? `<span class="activity-pair">${e.pairId}</span>` : ''}<span class="activity-msg">${e.message || ''}</span></div>`;
    }).join('');
  } catch (e) {}
}

async function pollBot2PairStats() {
  if (currentView !== 'bot2' || !bot2Available) return;
  try {
    const res = await fetch('/bot2/pair-stats');
    const stats = await res.json();
    const body = document.getElementById('botPairStatsBody2');
    if (!body) return;
    const rows = Object.entries(stats).sort((a, b) => (b[1].totalTrades || 0) - (a[1].totalTrades || 0));
    if (rows.length === 0) { body.innerHTML = '<tr><td colspan="17" style="text-align:center;color:var(--text-muted);">Aucune donn&eacute;e</td></tr>'; return; }
    body.innerHTML = rows.map(([pid, s]) => {
      const label = (pairsList.find(p => p.id === pid) || {}).label || pid;
      return `<tr>
        <td class="pair-cell">${label}</td><td>${s.totalTrades || 0}</td><td>${s.open || 0}</td><td>${s.closed || 0}</td>
        <td class="positive">${s.wins || 0}</td><td class="negative">${s.losses || 0}</td>
        <td>${s.closed > 0 ? Math.round(s.wins / s.closed * 100) : 0}%</td>
        <td class="${(s.realizedPnl || 0) >= 0 ? 'positive' : 'negative'}">$${(s.realizedPnl || 0).toFixed(4)}</td>
        <td>--</td><td>$${((s.totalVolumeUsd || 0) / 1000).toFixed(1)}K</td>
        <td>$${(s.fees || 0).toFixed(4)}</td>
        <td>${(s.avgEdge || s.avgEntryEdgeBps || 0).toFixed(2)}</td><td style="color:#d4a017;font-size:10px;" title="Mid-0 Kalman (D1=${(s.zMid0D1||0).toFixed(2)}, D2=${(s.zMid0D2||0).toFixed(2)})">${s.zMid0D1 != null || s.zMid0D2 != null ? (((s.zMid0D1||0) + (s.zMid0D2||0)) / 2).toFixed(2) : '--'}</td>
        <td>${(s.avgSlippage || 0).toFixed(2)}</td><td>${s.zMid0D1 != null ? ((s.avgEdge || s.avgEntryEdgeBps || 0) - ((s.zMid0D1||0) + (s.zMid0D2||0)) / 2).toFixed(2) : (s.margin || 0).toFixed(2)}</td>
        <td>${s.errors || 0}</td>
      </tr>`;
    }).join('');
  } catch (e) {}
}

async function bot2Action(action) {
  try {
    if (action === 'reset') {
      if (!confirm('Reset Bot+ ? Cela va :\n- Fermer toutes les positions on-chain\n- Supprimer l\'historique des trades\n- Reset les corrections DN et l\'exposition agrégée\n- Stopper le bot')) return;
      const btn = document.getElementById('botResetBtn2');
      if (btn) { btn.disabled = true; btn.textContent = 'Reset en cours...'; }
      try {
        const res = await fetch('/bot2/reset', { method: 'POST' });
        const data = await res.json();
        const closed = data.closedPositions || [];
        const ok = closed.filter(p => p.status !== 'error' && p.status !== 'skipped').length;
        const failed = closed.filter(p => p.status === 'error').length;
        if (closed.length > 0) {
          let msg = `Reset Bot+ terminé. ${ok}/${closed.length} position(s) on-chain fermée(s).`;
          if (failed > 0) msg += `\n${failed} échec(s) de fermeture.`;
          alert(msg);
        }
      } catch (e) {
        alert('Erreur pendant le reset Bot+: ' + (e.message || 'réseau'));
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Reset'; }
      pollBot2();
      return;
    }
    const method = (action === 'start' || action === 'stop' || action.startsWith('liquidation')) ? 'POST' : 'GET';
    await fetch('/bot2/' + action, { method });
    pollBot2();
  } catch (e) {}
}

async function applyBot2Config() {
  const cfg = {
    maxPositionUsd: parseFloat(document.getElementById('botPosSize2').value),
    maxGlobalPositions: parseInt(document.getElementById('botMaxGlobal2').value),
    maxLeverage: parseInt(document.getElementById('botMaxLeverage2').value),
    stopLossBps: parseFloat(document.getElementById('botStopLoss2').value),
  };
  await fetch('/bot2/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  pollBot2();
}
async function applyBot2CostsBps() {
  const v = parseFloat(document.getElementById('botCostsBps2').value);
  await fetch('/bot2/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costsBps: v }) });
}
function _updateBot2ConfigMargeHeaders() {
  const refTh2 = document.getElementById('cfgMargeRefTh2');
  const beTh2 = document.getElementById('cfgMargeBeTh2');
  if (refTh2) refTh2.textContent = 'Fees RT';
  if (beTh2) beTh2.textContent = 'Mid-0';
}

async function setBot2P50Mode(mode) {
  await fetch('/bot2/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p50Mode: mode }) });
  _bot2P50Mode = mode;
  _highlightModeButtons('p50ModeSelector2', mode);
  _updateZScoreConfigVisibility('zScoreConfig2', mode);
  _updateBot2ConfigMargeHeaders();
}
async function toggleBot2Pair(pairId, enabled) {
  await fetch('/bot2/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairId, enabled }) });
}
async function forceCloseBot2Trade(pairId) {
  await fetch('/bot2/force-close-pair/' + encodeURIComponent(pairId), { method: 'POST' });
  pollBot2Trades();
}
async function forceCloseAll2() {
  if (!confirm('Fermer TOUTES les positions Bot+ ?')) return;
  await fetch('/bot2/force-close-all', { method: 'POST' });
  pollBot2Trades();
}
function toggleApiKeyInput2() {
  const row = document.getElementById('apiKeyInputRow2');
  row.style.display = row.style.display === 'none' ? '' : 'none';
}
async function submitApiKey2() {
  const key = document.getElementById('apiKeyInput2').value;
  if (!key) return;
  try {
    const r = await fetch('/bot2/api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privateKey: key }) });
    const d = await r.json();
    if (d.ok) { document.getElementById('apiKeyInputRow2').style.display = 'none'; document.getElementById('apiKeyInput2').value = ''; pollBot2(); }
    else alert(d.error || 'Erreur');
  } catch (e) { alert('Erreur: ' + e.message); }
}

async function pollBot2Stats() {
  if (currentView !== 'botstats2' || !bot2Available) return;
  try {
    const [missedRes, statusRes] = await Promise.all([fetch('/bot2/missed-stats'), fetch('/bot2/status')]);
    const missed = await missedRes.json();
    const data = await statusRes.json();
    const ls = data.liveStats || {};
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('missedToday2', missed.today || 0);
    el('missedAllTime2', missed.allTime || 0);
    el('missedMarginFull2', missed.marginFull || 0);
    el('peakPositions2', missed.peakPositions || 0);
    el('currentPositions2', ls.open || 0);
    const posSize = data.maxPositionUsd || data.positionSizeUsd || 500;
    const maxLev = data.maxLeverage || 10;
    const marginPerPos = posSize * 2 / maxLev;
    el('marginUsed2', '$' + ((ls.open || 0) * marginPerPos).toFixed(0));
    el('marginPeak2', '$' + ((missed.peakPositions || 0) * marginPerPos).toFixed(0));
    el('marginOptimal2', '$' + (((missed.peakPositions || 0) + 2) * marginPerPos).toFixed(0));
    el('statsPosSize2', '$' + posSize);
  } catch (e) {}
}

async function pollBot2DailyStats() {
  if (currentView !== 'botstats2' || !bot2Available) return;
  try {
    const res = await fetch('/bot2/daily-stats');
    const days = await res.json();
    const body = document.getElementById('dailyStatsBody2');
    if (!body) return;
    body.innerHTML = days.map(d => `<tr>
      <td>${d.date}</td><td class="${d.pnl_net >= 0 ? 'positive' : 'negative'}">$${d.pnl_net.toFixed(4)}</td>
      <td>${d.trades}</td><td class="positive">${d.wins}</td><td class="negative">${d.losses}</td>
      <td>${d.win_rate}%</td><td>$${(d.volume / 1000).toFixed(1)}K</td><td>$${d.fees.toFixed(4)}</td><td>${d.errors}</td>
    </tr>`).join('');
    const totalsEl = document.getElementById('dailyStatsTotals2');
    if (totalsEl && days.length > 0) {
      const t = days.reduce((a, d) => ({ pnl: a.pnl + d.pnl_net, trades: a.trades + d.trades, wins: a.wins + d.wins, losses: a.losses + d.losses, vol: a.vol + d.volume, fees: a.fees + d.fees, errs: a.errs + d.errors }), { pnl: 0, trades: 0, wins: 0, losses: 0, vol: 0, fees: 0, errs: 0 });
      totalsEl.innerHTML = `<tr style="font-weight:bold;border-top:2px solid var(--gold);">
        <td>TOTAL</td><td class="${t.pnl >= 0 ? 'positive' : 'negative'}">$${t.pnl.toFixed(4)}</td>
        <td>${t.trades}</td><td>${t.wins}</td><td>${t.losses}</td>
        <td>${t.trades > 0 ? Math.round(t.wins / t.trades * 100) : 0}%</td><td>$${(t.vol / 1000).toFixed(1)}K</td><td>$${t.fees.toFixed(4)}</td><td>${t.errs}</td>
      </tr>`;
    }
  } catch (e) {}
}

async function fetchPnlReconciliation2() {
  try {
    const res = await fetch('/bot2/pnl-reconciliation');
    const data = await res.json();
    const totals = data.totals || {};
    const el = document.getElementById('reconTotals2');
    if (el) {
      el.innerHTML = ['grossPnl', 'fees', 'funding', 'errorCost', 'netPnl'].map(k => {
        const v = parseFloat(totals[k] || 0);
        const labels = { grossPnl: 'Gross PnL', fees: 'Fees', funding: 'Funding', errorCost: 'Err Cost', netPnl: 'Net PnL' };
        return `<div class="bot-summary-card ${k === 'netPnl' ? 'highlight' : ''}"><div class="bot-card-label">${labels[k]}</div><div class="bot-card-value ${v >= 0 ? 'positive' : 'negative'}">$${v.toFixed(4)}</div></div>`;
      }).join('');
    }
    const body = document.getElementById('reconBody2');
    if (body) {
      body.innerHTML = (data.trades || []).map(t => `<tr>
        <td>${t.id}</td><td>${t.pair}</td><td>${t.dir == 1 ? '&#9650;' : '&#9660;'}</td><td>${t.status}</td><td>${t.holdMin}m</td>
        <td class="${parseFloat(t.grossPnl) >= 0 ? 'positive' : 'negative'}">$${t.grossPnl}</td><td>$${t.fees}</td>
        <td>$${t.errorCost}</td>
        <td class="${parseFloat(t.netPnl) >= 0 ? 'positive' : 'negative'}">$${t.netPnl}</td>
        <td>${t.signalEdge || '--'}</td><td>${t.slippage || '--'}</td>
      </tr>`).join('');
    }
  } catch (e) {}
}

async function pollBot2CorrectionsStats() {
  if (currentView !== 'botstats2' || !bot2Available) return;
  try {
    const res = await fetch('/bot2/corrections-stats');
    const data = await res.json();
    const body = document.getElementById('correctionsStatsBody2');
    if (!body) return;
    body.innerHTML = (data.rows || []).map(r => `<tr>
      <td>${r.coin}</td><td>${r.dnCount}</td><td>$${r.dnCostUsd.toFixed(4)}</td>
      <td>${r.errorCount}</td><td>${r.orphanCount}</td><td>$${r.errCostUsd.toFixed(4)}</td>
      <td>$${(r.dnCostUsd + r.errCostUsd).toFixed(4)}</td>
    </tr>`).join('');
    const t = data.totals || {};
    const tf = document.getElementById('correctionsStatsTotals2');
    if (tf) tf.innerHTML = `<tr style="font-weight:bold;"><td>TOTAL</td><td>${t.dnCount || 0}</td><td>$${(t.dnCostUsd || 0).toFixed(4)}</td><td>${t.errorCount || 0}</td><td>${t.orphanCount || 0}</td><td>$${(t.errCostUsd || 0).toFixed(4)}</td><td>$${(t.totalCostUsd || 0).toFixed(4)}</td></tr>`;
  } catch (e) {}
}

let _dustPanelOpen = false;
async function pollDust() {
  if (!_dustPanelOpen) return;
  try {
    const res = await fetch('/bot/dust');
    const data = await res.json();
    const badge = document.getElementById('dustCount');
    if (badge) badge.textContent = data.trades.length || '0';
    const info = document.getElementById('dustThresholdInfo');
    if (info) info.textContent = `Seuil: $${data.thresholdUsd.toFixed(2)} (${(data.dustFactor * 100).toFixed(0)}% de $${data.baseSize})`;
    const container = document.getElementById('dustTradesContainer');
    if (!container) return;
    const closeAllBtn = document.getElementById('dustCloseAllBtn');
    if (closeAllBtn) closeAllBtn.style.display = data.trades.length > 0 ? '' : 'none';
    if (data.trades.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">Aucune position dust d\u00E9tect\u00E9e \u2714</div>';
      return;
    }
    let html = '<div class="table-scroll"><table class="signals-table compact"><thead><tr><th>ID</th><th>Paire</th><th>Dir</th><th>Coin A</th><th>Coin B</th><th>Notionnel A</th><th>Notionnel B</th><th>Moy.</th><th>Dur\u00E9e</th><th></th></tr></thead><tbody>';
    for (const t of data.trades) {
      const dur = fmtDuration(Date.now() - t.entryTs);
      const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
      html += `<tr>
        <td>${t.id}</td>
        <td class="pair-cell">${pairLabel}</td>
        <td><span class="tag ${t.direction === 1 ? 'dir1' : 'dir2'}">D${t.direction}</span></td>
        <td>${t.legACoin.split(':')[1]} (${t.legASide})</td>
        <td>${t.legBCoin.split(':')[1]} (${t.legBSide})</td>
        <td>$${t.notionalA.toFixed(2)}</td>
        <td>$${t.notionalB.toFixed(2)}</td>
        <td style="color:var(--accent-red);font-weight:600;">$${t.avgNotional.toFixed(2)}</td>
        <td>${dur}</td>
        <td><button class="btn-sm btn-danger" onclick="dustCloseTrade(${t.id})">Close</button></td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {}
}

async function dustCloseTrade(tradeId) {
  if (!confirm('Fermer cette position dust #' + tradeId + ' ?')) return;
  try {
    const res = await fetch('/bot/dust/close/' + tradeId, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      pollDust();
      pollBotStatus();
    } else {
      alert('Erreur: ' + (data.error || 'unknown'));
    }
  } catch (e) { alert('Erreur: ' + e.message); }
}

async function dustCloseAll() {
  if (!confirm('Fermer TOUTES les positions dust ?')) return;
  try {
    const res = await fetch('/bot/dust/close-all', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      pollDust();
      pollBotStatus();
    } else {
      alert('Erreur: ' + (data.error || 'unknown'));
    }
  } catch (e) { alert('Erreur: ' + e.message); }
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'dustCleanerToggle' || e.target.closest('#dustCleanerToggle')) {
    const panel = document.getElementById('dustCleanerPanel');
    const arrow = document.getElementById('dustCleanerArrow');
    _dustPanelOpen = panel.style.display === 'none';
    if (panel) panel.style.display = _dustPanelOpen ? '' : 'none';
    if (arrow) arrow.innerHTML = _dustPanelOpen ? '&#9660;' : '&#9654;';
    if (_dustPanelOpen) pollDust();
  }
});

setInterval(pollDust, 10000);

let _stablePanelOpen = false;
async function pollStableBalances() {
  if (!_stablePanelOpen) return;
  try {
    const [stableRes, crossRes] = await Promise.all([
      fetch('/bot/stable-balances'),
      fetch('/bot/cross-balance').catch(() => null),
    ]);
    const data = await stableRes.json();
    const badge = document.getElementById('stableDriftBadge');
    if (badge) {
      if (data.criticalDrift) {
        badge.className = 'dn-badge dn-warn';
        badge.innerHTML = '&#x26A0;';
        badge.title = 'Drift critique: ' + (data.maxDrift * 100).toFixed(1) + '%';
      } else {
        badge.className = 'dn-badge dn-ok';
        badge.innerHTML = '&#x2714;';
        badge.title = 'Drift OK: ' + (data.maxDrift * 100).toFixed(1) + '%';
      }
    }

    const usdcIn = document.getElementById('stableTargetUsdc');
    const usdtIn = document.getElementById('stableTargetUsdt');
    const usdhIn = document.getElementById('stableTargetUsdh');
    const driftIn = document.getElementById('stableDriftThreshold');
    if (usdcIn && !usdcIn.matches(':focus')) usdcIn.value = Math.round((data.targets.usdc || 0) * 100);
    if (usdtIn && !usdtIn.matches(':focus')) usdtIn.value = Math.round((data.targets.usdt || 0) * 100);
    if (usdhIn && !usdhIn.matches(':focus')) usdhIn.value = Math.round((data.targets.usdh || 0) * 100);
    if (driftIn && !driftIn.matches(':focus')) driftIn.value = Math.round((data.driftThreshold || 0.1) * 100);

    const intraTimerEl = document.getElementById('intraTimerSlider');
    const intraCooldownEl = document.getElementById('intraCooldownSlider');
    if (data.intraRebalanceIntervalSec !== undefined) {
      if (intraTimerEl && !intraTimerEl.matches(':active')) {
        intraTimerEl.value = data.intraRebalanceIntervalSec;
        document.getElementById('intraTimerVal').textContent = data.intraRebalanceIntervalSec + 's';
      }
    }
    if (data.intraRebalanceCooldownSec !== undefined) {
      if (intraCooldownEl && !intraCooldownEl.matches(':active')) {
        intraCooldownEl.value = data.intraRebalanceCooldownSec;
        document.getElementById('intraCooldownVal').textContent = data.intraRebalanceCooldownSec + 's';
      }
    }

    const container = document.getElementById('stableBalancesContainer');
    if (!container) return;
    const b = data.balances;
    const tokens = ['usdc', 'usdt', 'usdh'];
    let html = '<div class="table-scroll"><table class="signals-table compact"><thead><tr><th>Token</th><th>Balance</th><th>Actuel %</th><th>Cible %</th><th>Drift</th><th>Barre</th></tr></thead><tbody>';
    for (const tk of tokens) {
      const bal = b[tk] || 0;
      const actualPct = (data.actual[tk] * 100).toFixed(1);
      const targetPct = ((data.targets[tk] || 0) * 100).toFixed(0);
      const driftPct = (data.drift[tk] * 100).toFixed(1);
      const driftAbs = Math.abs(data.drift[tk]);
      const driftColor = driftAbs > data.driftThreshold ? 'var(--accent-red)' : driftAbs > data.driftThreshold * 0.5 ? 'var(--accent-amber)' : 'var(--accent-green)';
      const barW = Math.min(100, Math.max(0, data.actual[tk] * 100));
      const targetW = Math.min(100, Math.max(0, (data.targets[tk] || 0) * 100));
      html += '<tr>';
      html += '<td style="font-weight:600;">' + tk.toUpperCase() + '</td>';
      html += '<td>$' + bal.toFixed(2) + '</td>';
      html += '<td>' + actualPct + '%</td>';
      html += '<td>' + targetPct + '%</td>';
      html += '<td style="color:' + driftColor + ';font-weight:600;">' + (parseFloat(driftPct) > 0 ? '+' : '') + driftPct + '%</td>';
      html += '<td style="width:120px;">';
      html += '<div style="position:relative;height:14px;background:rgba(0,0,0,0.06);border-radius:7px;overflow:hidden;">';
      html += '<div style="position:absolute;left:0;top:0;height:100%;width:' + barW + '%;background:' + driftColor + ';border-radius:7px;opacity:0.6;transition:width 0.3s;"></div>';
      html += '<div style="position:absolute;left:' + targetW + '%;top:0;height:100%;width:2px;background:var(--text-primary);opacity:0.5;" title="Cible"></div>';
      html += '</div>';
      html += '</td>';
      html += '</tr>';
    }
    html += '<tr style="font-weight:bold;border-top:2px solid var(--border-primary);"><td>TOTAL</td><td>$' + b.total.toFixed(2) + '</td><td colspan="2"></td><td style="color:' + (data.criticalDrift ? 'var(--accent-red)' : 'var(--accent-green)') + ';">Max: ' + (data.maxDrift * 100).toFixed(1) + '%</td><td></td></tr>';
    html += '</tbody></table></div>';
    if (data.rebalancing) {
      html += '<div style="color:var(--accent-amber);font-size:11px;margin-top:6px;">&#x23F3; Rebalance en cours...</div>';
    }
    container.innerHTML = html;

    if (crossRes) {
      const crossData = await crossRes.json();
      _renderCrossWalletDashboard(crossData);
    }
  } catch (e) {}
}

function _renderCrossWalletDashboard(data) {
  const section = document.getElementById('crossWalletSection');
  if (!section) return;
  if (!data.bot2Active) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const fmt2 = v => v === 0 ? '0.00' : Number(v).toFixed(2);

  const bot1Card = document.getElementById('crossBot1Card');
  const bot2Card = document.getElementById('crossBot2Card');
  const b1 = data.bot1 || {};
  const b2 = data.bot2 || {};

  const b1Total = (b1.balances.usdc || 0) + (b1.balances.usdt || 0) + (b1.balances.usdh || 0);
  const b2Total = (b2.balances.usdc || 0) + (b2.balances.usdt || 0) + (b2.balances.usdh || 0);

  document.getElementById('crossBot1Balance').textContent = '$' + fmt2(b1Total);
  document.getElementById('crossBot2Balance').textContent = '$' + fmt2(b2Total);

  const m1 = b1.margin || {};
  const m2 = b2.margin || {};
  document.getElementById('crossBot1Margin').textContent = 'Marge libre: ' + fmt2(m1.freePct || 0) + '% ($' + fmt2(m1.free || 0) + ')';
  document.getElementById('crossBot2Margin').textContent = 'Marge libre: ' + fmt2(m2.freePct || 0) + '% ($' + fmt2(m2.free || 0) + ')';

  const s1El = document.getElementById('crossBot1Status');
  const s2El = document.getElementById('crossBot2Status');

  bot1Card.className = 'cross-wallet-card';
  bot2Card.className = 'cross-wallet-card';

  if (b1.isDry) {
    s1El.textContent = 'DRY';
    s1El.className = 'cross-wallet-status cw-dry';
    bot1Card.classList.add('status-dry');
  } else if (b1.canDonate) {
    s1El.textContent = 'CAN DONATE';
    s1El.className = 'cross-wallet-status cw-donate';
    bot1Card.classList.add('status-donate');
  } else {
    s1El.textContent = 'OK';
    s1El.className = 'cross-wallet-status cw-ok';
  }

  if (b2.isDry) {
    s2El.textContent = 'DRY';
    s2El.className = 'cross-wallet-status cw-dry';
    bot2Card.classList.add('status-dry');
  } else if (b2.canDonate) {
    s2El.textContent = 'CAN DONATE';
    s2El.className = 'cross-wallet-status cw-donate';
    bot2Card.classList.add('status-donate');
  } else {
    s2El.textContent = 'OK';
    s2El.className = 'cross-wallet-status cw-ok';
  }

  const autoToggle = document.getElementById('crossAutoToggle');
  if (autoToggle) autoToggle.checked = data.config.autoEnabled;

  const cooldownInfo = document.getElementById('crossCooldownInfo');
  if (cooldownInfo) {
    if (data.cooldownActive) {
      cooldownInfo.textContent = '\u23F3 Cooldown: ' + data.cooldownRemainingSec + 's';
      cooldownInfo.style.color = 'var(--accent-amber)';
    } else {
      cooldownInfo.textContent = '';
    }
  }

  const transferBtn = document.getElementById('crossTransferBtn');
  if (transferBtn) {
    const canTransfer = !data.cooldownActive && ((b1.isDry && b2.canDonate) || (b2.isDry && b1.canDonate));
    transferBtn.disabled = !canTransfer;
    transferBtn.style.opacity = canTransfer ? '1' : '0.5';
  }

  const checkSlider = document.getElementById('crossCheckSlider');
  const cooldownSlider = document.getElementById('crossCooldownSlider');
  const dryInput = document.getElementById('crossDryThreshold');
  const donateInput = document.getElementById('crossDonateThreshold');
  if (checkSlider && !checkSlider.matches(':active')) {
    checkSlider.value = data.config.crossCheckIntervalSec;
    document.getElementById('crossCheckVal').textContent = Math.round(data.config.crossCheckIntervalSec / 60) + 'min';
  }
  if (cooldownSlider && !cooldownSlider.matches(':active')) {
    cooldownSlider.value = data.config.crossCooldownSec;
    document.getElementById('crossCooldownVal').textContent = Math.round(data.config.crossCooldownSec / 60) + 'min';
  }
  if (dryInput && !dryInput.matches(':focus') && data.config.dryThresholdPct !== undefined) {
    dryInput.value = data.config.dryThresholdPct;
  }
  if (donateInput && !donateInput.matches(':focus') && data.config.donateThresholdPct !== undefined) {
    donateInput.value = data.config.donateThresholdPct;
  }

  const histContainer = document.getElementById('crossWalletHistory');
  if (histContainer && data.history && data.history.length > 0) {
    const recent = data.history.slice(-5).reverse();
    let hHtml = '<div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Derniers transferts</div>';
    for (const h of recent) {
      const time = new Date(h.ts).toLocaleString();
      const tokens = (h.actions || []).map(a => {
        const cls = a.status === 'ok' ? 'ok' : 'error';
        return '<span class="cross-history-token ' + cls + '">' + a.token + ' $' + (a.amount || 0).toFixed(2) + '</span>';
      }).join(' ');
      hHtml += '<div class="cross-history-entry"><span style="color:var(--text-muted);">' + time + '</span> <span class="cross-history-dir">' + h.direction + '</span> ' + tokens + '</div>';
    }
    histContainer.innerHTML = hHtml;
  } else if (histContainer) {
    histContainer.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:4px 0;">Aucun transfert.</div>';
  }
}

async function crossToggleAuto(enabled) {
  try {
    await fetch('/bot/cross-rebalance-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoEnabled: enabled })
    });
    showToast(enabled ? 'Auto-rebalance activé' : 'Auto-rebalance désactivé', 'success');
  } catch (e) { console.error('crossToggleAuto error:', e); }
}

async function crossUpdateConfig() {
  const checkSlider = document.getElementById('crossCheckSlider');
  const cooldownSlider = document.getElementById('crossCooldownSlider');
  const dryInput = document.getElementById('crossDryThreshold');
  const donateInput = document.getElementById('crossDonateThreshold');
  const cfg = {};
  if (checkSlider) {
    cfg.crossCheckIntervalSec = parseInt(checkSlider.value);
    const valEl = document.getElementById('crossCheckVal');
    if (valEl) valEl.textContent = Math.round(cfg.crossCheckIntervalSec / 60) + 'min';
  }
  if (cooldownSlider) {
    cfg.crossCooldownSec = parseInt(cooldownSlider.value);
    const valEl = document.getElementById('crossCooldownVal');
    if (valEl) valEl.textContent = Math.round(cfg.crossCooldownSec / 60) + 'min';
  }
  if (dryInput) cfg.dryThresholdPct = parseFloat(dryInput.value);
  if (donateInput) cfg.donateThresholdPct = parseFloat(donateInput.value);
  try {
    await fetch('/bot/cross-rebalance-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  } catch (e) { console.error('crossUpdateConfig error:', e); }
}

async function crossForceTransfer() {
  const btn = document.getElementById('crossTransferBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Transfert...'; }
  try {
    const r = await fetch('/bot/cross-rebalance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.ok) showToast('Transfert cross-wallet effectué', 'success');
    else showToast('Erreur: ' + (data.error || 'unknown'), 'error');
  } catch (e) { showToast('Erreur transfert: ' + e.message, 'error'); }
  if (btn) { btn.textContent = 'Transférer Maintenant'; btn.disabled = false; }
}

async function applyStableTargets() {
  const usdc = parseFloat(document.getElementById('stableTargetUsdc').value) / 100;
  const usdt = parseFloat(document.getElementById('stableTargetUsdt').value) / 100;
  const usdh = parseFloat(document.getElementById('stableTargetUsdh').value) / 100;
  const drift = parseFloat(document.getElementById('stableDriftThreshold').value) / 100;
  const sum = usdc + usdt + usdh;
  if (sum < 0.95 || sum > 1.05) {
    alert('La somme des cibles doit faire 100% (actuellement ' + (sum * 100).toFixed(0) + '%)');
    return;
  }
  const status = document.getElementById('stableRebalanceStatus');
  try {
    const res = await fetch('/bot/stable-rebalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets: { usdc, usdt, usdh }, driftThreshold: drift })
    });
    const data = await res.json();
    if (data.ok) {
      if (status) { status.textContent = '\u2714 Cibles mises \u00E0 jour'; status.style.color = 'var(--accent-green)'; }
      pollStableBalances();
    } else {
      if (status) { status.textContent = '\u2718 ' + (data.error || 'Erreur'); status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 3000);
}

async function triggerStableRebalance() {
  if (!confirm('Lancer le rebalance USDT\u2194USDH maintenant ?')) return;
  const status = document.getElementById('stableRebalanceStatus');
  if (status) { status.textContent = '\u23F3 Rebalance en cours...'; status.style.color = 'var(--accent-amber)'; }
  try {
    const res = await fetch('/bot/stable-rebalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rebalance' })
    });
    const data = await res.json();
    if (data.ok) {
      const actCount = (data.actions || []).length;
      const filledCount = (data.actions || []).filter(a => a.status === 'filled').length;
      if (status) { status.textContent = '\u2714 ' + filledCount + '/' + actCount + ' actions remplies'; status.style.color = 'var(--accent-green)'; }
      setTimeout(pollStableBalances, 3000);
    } else {
      if (status) { status.textContent = '\u2718 ' + (data.error || 'Erreur'); status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 5000);
}

async function applyIntraTimers() {
  const interval = parseInt(document.getElementById('intraTimerSlider').value);
  const cooldown = parseInt(document.getElementById('intraCooldownSlider').value);
  const status = document.getElementById('intraTimerStatus');
  try {
    const res = await fetch('/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intraRebalanceIntervalSec: interval, intraRebalanceCooldownSec: cooldown })
    });
    const data = await res.json();
    if (data.ok) {
      if (status) { status.textContent = '\u2714 Timers mis \u00E0 jour'; status.style.color = 'var(--accent-green)'; }
    } else {
      if (status) { status.textContent = '\u2718 Erreur'; status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 3000);
}

async function toggleCrossAuto() {
  const checked = document.getElementById('crossAutoToggle').checked;
  try {
    await fetch('/bot/cross-rebalance-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoEnabled: checked })
    });
  } catch (e) {}
}

async function triggerCrossTransfer() {
  if (!confirm('Transf\u00E9rer des fonds entre wallets maintenant ?')) return;
  const status = document.getElementById('crossTransferStatus');
  if (status) { status.textContent = '\u23F3 Transfert...'; status.style.color = 'var(--accent-amber)'; }
  try {
    const res = await fetch('/bot/cross-rebalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.ok) {
      const okCount = (data.actions || []).filter(a => a.status === 'ok').length;
      if (status) { status.textContent = '\u2714 ' + data.direction + ' ' + okCount + ' transferts OK'; status.style.color = 'var(--accent-green)'; }
      setTimeout(pollStableBalances, 3000);
    } else {
      if (status) { status.textContent = '\u2718 ' + (data.error || 'Erreur'); status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 5000);
}

async function applyCrossConfig() {
  const checkInterval = parseInt(document.getElementById('crossCheckSlider').value);
  const cooldown = parseInt(document.getElementById('crossCooldownSlider').value);
  const dry = parseFloat(document.getElementById('crossDryThreshold').value);
  const donate = parseFloat(document.getElementById('crossDonateThreshold').value);
  const status = document.getElementById('crossConfigStatus');
  try {
    const res = await fetch('/bot/cross-rebalance-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crossCheckIntervalSec: checkInterval,
        crossCooldownSec: cooldown,
        dryThresholdPct: dry,
        donateThresholdPct: donate,
      })
    });
    const data = await res.json();
    if (data.ok) {
      if (status) { status.textContent = '\u2714 Config OK'; status.style.color = 'var(--accent-green)'; }
    } else {
      if (status) { status.textContent = '\u2718 Erreur'; status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 3000);
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'stableRebalanceToggle' || e.target.closest('#stableRebalanceToggle')) {
    const panel = document.getElementById('stableRebalancePanel');
    const arrow = document.getElementById('stableRebalanceArrow');
    _stablePanelOpen = panel.style.display === 'none';
    if (panel) panel.style.display = _stablePanelOpen ? '' : 'none';
    if (arrow) arrow.innerHTML = _stablePanelOpen ? '&#9660;' : '&#9654;';
    if (_stablePanelOpen) pollStableBalances();
  }
});

setInterval(pollStableBalances, 15000);

document.addEventListener('click', function(e) {
  if (e.target.id === 'openTradesToggle2' || e.target.closest('#openTradesToggle2')) {
    const panel = document.getElementById('openTradesPanel2');
    const arrow = document.getElementById('openTradesArrow2');
    if (panel) { panel.style.display = panel.style.display === 'none' ? '' : 'none'; }
    if (arrow) arrow.innerHTML = panel.style.display === 'none' ? '&#9654;' : '&#9660;';
  }
  if (e.target.id === 'closedTradesToggle2' || e.target.closest('#closedTradesToggle2')) {
    const panel = document.getElementById('closedTradesPanel2');
    const arrow = document.getElementById('closedTradesArrow2');
    bot2ClosedTradesOpen = !bot2ClosedTradesOpen;
    if (panel) panel.style.display = bot2ClosedTradesOpen ? '' : 'none';
    if (arrow) arrow.innerHTML = bot2ClosedTradesOpen ? '&#9660;' : '&#9654;';
    if (bot2ClosedTradesOpen) pollBot2Trades();
  }
});


let _chartEdge = null;
let _allPairsChartInstances = {};
let _chartTimeSeconds = 900;
let _chartTimeHours = null;
let _chartTimeTick = null;
let _chartsRefreshTimer = null;
let _volSpreadMode = 'staticZ';
let _chartSignalsCache = {};

const DEPLOYER_COLORS = {
  flx: '#06b6d4', xyz: '#c084fc', cash: '#f472b6', km: '#fb923c',
  vntl: '#a3e635', hyna: '#f87171', abcd: '#facc15'
};

function _getDeployerColor(deployer) {
  const key = (deployer || '').toLowerCase().split(':')[0];
  return DEPLOYER_COLORS[key] || '#94a3b8';
}

function _getDeployerFromPair(pair) {
  if (!pair) return { a: '', b: '' };
  const parts = (pair.id || pair.label || '').split('-');
  if (parts.length >= 2) return { a: parts[0], b: parts[1] };
  return { a: '', b: '' };
}

function _initChartPairSelect() {
  const sel = document.getElementById('chartPairSelect');
  if (!sel || sel.options.length > 0) return;
  pairsList.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label || p.id;
    sel.appendChild(opt);
  });
}

function setChartTimeWindow(btn) {
  document.querySelectorAll('.chart-time-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (btn.dataset.tick) {
    _chartTimeTick = parseInt(btn.dataset.tick);
    _chartTimeSeconds = null;
    _chartTimeHours = null;
  } else if (btn.dataset.seconds) {
    _chartTimeSeconds = parseInt(btn.dataset.seconds);
    _chartTimeHours = null;
    _chartTimeTick = null;
  } else if (btn.dataset.hours) {
    _chartTimeHours = parseInt(btn.dataset.hours);
    _chartTimeSeconds = null;
    _chartTimeTick = null;
  }
  _destroyAllPairsCharts();
  refreshAllPairsCharts();
}

function setVolSpreadMode(mode) {
  _volSpreadMode = mode;
  document.querySelectorAll('.vol-spread-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  _destroyAllPairsCharts();
  refreshAllPairsCharts();
}

function _destroyAllPairsCharts() {
  Object.values(_allPairsChartInstances).forEach(obj => {
    if (obj.price) obj.price.destroy();
    if (obj.spread) obj.spread.destroy();
    if (obj.spreadBps) obj.spreadBps.destroy();
    if (obj.edgeDepth) obj.edgeDepth.destroy();
    if (obj.spreadRatio) obj.spreadRatio.destroy();
    if (obj.copula) obj.copula.destroy();
  });
  _allPairsChartInstances = {};
}

function _rankArray(arr) {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  for (let k = 0; k < indexed.length; k++) ranks[indexed[k].i] = (k + 1) / (arr.length + 1);
  return ranks;
}

function _pearsonCorr(x, y) {
  const n = x.length;
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i]*x[i]; syy += y[i]*y[i]; sxy += x[i]*y[i]; }
  const d = Math.sqrt((n*sxx - sx*sx) * (n*syy - sy*sy));
  return d > 0 ? (n*sxy - sx*sy) / d : 0;
}

function _spearmanCorr(x, y) {
  return _pearsonCorr(_rankArray(x), _rankArray(y));
}

function _kendallTau(x, y) {
  const n = x.length;
  if (n < 3) return 0;
  let conc = 0, disc = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[j] - x[i], dy = y[j] - y[i];
      if (dx * dy > 0) conc++; else if (dx * dy < 0) disc++;
    }
  }
  const total = conc + disc;
  return total > 0 ? (conc - disc) / total : 0;
}

function _detectCopulaFit(tau) {
  const at = Math.abs(tau);
  if (at > 0.6) return 'Gumbel';
  if (at > 0.35) return 'Clayton';
  if (at > 0.15) return 'Frank';
  return 'Gaussian';
}

function _computeCopulaStats(midA, midB) {
  const pairs = [];
  for (let i = 0; i < midA.length; i++) {
    if (midA[i] != null && midB[i] != null && midA[i] > 0 && midB[i] > 0) pairs.push({ a: midA[i], b: midB[i] });
  }
  if (pairs.length < 10) return null;
  let sampled = pairs;
  if (pairs.length > 500) {
    const step = Math.floor(pairs.length / 500);
    sampled = pairs.filter((_, i) => i % step === 0);
  }
  const a = sampled.map(p => p.a), b = sampled.map(p => p.b);
  const pearson = _pearsonCorr(a, b);
  const spearman = _spearmanCorr(a, b);
  const kendall = _kendallTau(a, b);
  const bestFit = _detectCopulaFit(kendall);
  const uA = _rankArray(a), uB = _rankArray(b);
  return { pearson, spearman, kendall, bestFit, correlation: Math.abs(pearson), uA, uB };
}

function _computeStaticZ(spreadBps, win) {
  const z = [], upper = [], lower = [];
  for (let i = 0; i < spreadBps.length; i++) {
    if (i < win) { z.push(null); upper.push(null); lower.push(null); continue; }
    const slice = spreadBps.slice(i - win, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    z.push(std > 0.001 ? (spreadBps[i] - mean) / std : 0);
    upper.push(2); lower.push(-2);
  }
  return { values: z, upper, lower, label: 'Z-Score' };
}

function _computeOU(spreadBps, win) {
  const values = [], upper = [], lower = [];
  for (let i = 0; i < spreadBps.length; i++) {
    if (i < win + 1) { values.push(null); upper.push(null); lower.push(null); continue; }
    const slice = spreadBps.slice(i - win, i);
    const n = slice.length;
    const mu = slice.reduce((a, b) => a + b, 0) / n;
    let sumDx = 0, sumX = 0, sumXsq = 0;
    for (let j = 1; j < n; j++) {
      const dx = slice[j] - slice[j - 1];
      sumDx += dx; sumX += slice[j - 1]; sumXsq += slice[j - 1] * slice[j - 1];
    }
    const nm1 = n - 1;
    const meanX = sumX / nm1;
    const varX = sumXsq / nm1 - meanX * meanX;
    const theta = varX > 0.0001 ? Math.max(0.01, Math.min(5, -(sumDx / nm1) / (meanX - mu + 0.0001))) : 0.5;
    const residuals = [];
    for (let j = 1; j < n; j++) {
      const predicted = slice[j - 1] + theta * (mu - slice[j - 1]);
      residuals.push(slice[j] - predicted);
    }
    const sigmaOU = Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / residuals.length) || 0.001;
    values.push(sigmaOU > 0.001 ? (spreadBps[i] - mu) / sigmaOU : 0);
    upper.push(2); lower.push(-2);
  }
  return { values, upper, lower, label: 'OU Z-Score' };
}

function _computeKalman(spreadBps) {
  const values = [], upper = [], lower = [];
  let xHat = spreadBps[0] || 0, P = 1.0;
  const Q = 0.01, R = 0.5;
  for (let i = 0; i < spreadBps.length; i++) {
    const z = spreadBps[i];
    const pPred = P + Q;
    const K = pPred / (pPred + R);
    const innovation = z - xHat;
    xHat = xHat + K * innovation;
    P = (1 - K) * pPred;
    const uncertainty = Math.sqrt(P + R);
    const kZ = uncertainty > 0.001 ? innovation / uncertainty : 0;
    if (i < 2) { values.push(null); upper.push(null); lower.push(null); continue; }
    values.push(kZ); upper.push(2); lower.push(-2);
  }
  return { values, upper, lower, label: 'Kalman Z-Score' };
}

function _computeEWMA(spreadBps) {
  const values = [], upper = [], lower = [];
  const spanFast = 12, spanSlow = 26;
  const alphaFast = 2 / (spanFast + 1), alphaSlow = 2 / (spanSlow + 1), alphaVol = 2 / (spanSlow + 1);
  let ewmaFast = null, ewmaSlow = null, ewmaVol = null;
  for (let i = 0; i < spreadBps.length; i++) {
    const v = spreadBps[i];
    if (ewmaFast === null) { ewmaFast = v; ewmaSlow = v; ewmaVol = 0; }
    else {
      ewmaFast = alphaFast * v + (1 - alphaFast) * ewmaFast;
      ewmaSlow = alphaSlow * v + (1 - alphaSlow) * ewmaSlow;
      ewmaVol = alphaVol * Math.abs(v - ewmaSlow) + (1 - alphaVol) * ewmaVol;
    }
    if (i < spanSlow) { values.push(null); upper.push(null); lower.push(null); continue; }
    values.push(ewmaFast - ewmaSlow);
    upper.push(2 * ewmaVol);
    lower.push(-2 * ewmaVol);
  }
  return { values, upper, lower, label: 'EWMA(12-26)' };
}

async function _fetchChartSignals(pairId) {
  try {
    const res = await fetch(`/bot/chart-signals/${pairId}`);
    const json = await res.json();
    _chartSignalsCache[pairId] = json.signals || [];
  } catch (e) {
    _chartSignalsCache[pairId] = [];
  }
}

function _buildSignalMarkers(pairId, labels, midA) {
  const sigs = _chartSignalsCache[pairId] || [];
  if (!sigs.length || !labels.length) return { entryPts: [], exitPts: [] };
  const entryPts = [];
  const exitPts = [];
  for (const sig of sigs) {
    let bestIdx = -1, bestDiff = Infinity;
    for (let i = 0; i < labels.length; i++) {
      const diff = Math.abs(labels[i] - sig.ts);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDiff < 10000) {
      if (sig.type === 'entry') {
        entryPts.push({ idx: bestIdx, val: midA[bestIdx], dir: sig.direction });
      } else {
        exitPts.push({ idx: bestIdx, val: midA[bestIdx] });
      }
    }
  }
  return { entryPts, exitPts };
}

async function refreshAllPairsCharts() {
  if (currentView !== 'charts') return;
  const grid = document.getElementById('chartsAllPairsGrid');
  if (!grid) return;

  try {
    let allData = {};
    const isTick = !!_chartTimeTick;

    if (_chartTimeTick) {
      const promises = pairsList.map(async p => {
        try {
          const res = await fetch(`/bot/chart-data-tick/${p.id}?seconds=${_chartTimeTick}`);
          const json = await res.json();
          if (json.labels && json.labels.length > 0) {
            allData[p.id] = {
              labels: json.labels,
              midA: json.midA,
              midB: json.midB,
              bestBidA: json.bestBidA,
              bestAskA: json.bestAskA,
              bestBidB: json.bestBidB,
              bestAskB: json.bestAskB,
              d1: json.dir1EdgeBps,
              d2: json.dir2EdgeBps,
              midSpreadBps: json.spreadBps,
              depthA: json.depthA,
              depthB: json.depthB,
            };
          }
        } catch (e) {}
      });
      await Promise.all(promises);
    } else if (_chartTimeSeconds) {
      const res = await fetch(`/bot/chart-data-all-1s?seconds=${_chartTimeSeconds}`);
      const json = await res.json();
      allData = json.pairs || {};
    } else if (_chartTimeHours) {
      for (const p of pairsList) {
        try {
          const res = await fetch(`/bot/chart-data/${p.id}?hours=${_chartTimeHours}`);
          const json = await res.json();
          if (json.snapshots && json.snapshots.length > 0) {
            const snaps = json.snapshots;
            allData[p.id] = {
              labels: snaps.map(s => parseInt(s.ts)),
              midA: snaps.map(s => s.mid_a ? parseFloat(s.mid_a) : null),
              midB: snaps.map(s => s.mid_b ? parseFloat(s.mid_b) : null),
              midSpreadBps: snaps.map(s => {
                if (s.mid_spread_bps !== undefined) return parseFloat(s.mid_spread_bps || 0);
                const a = parseFloat(s.mid_a || 0), b = parseFloat(s.mid_b || 0);
                return b > 0 ? ((a / b) - 1) * 10000 : 0;
              })
            };
          }
        } catch (e) {}
      }
    }

    const pairIds = pairsList.map(p => p.id).filter(id => allData[id]);
    if (pairIds.length === 0 && grid.children.length === 0) {
      grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:0.85rem;">Waiting for chart data...</div>';
      return;
    }

    const sigPromises = pairIds.map(id => _fetchChartSignals(id));
    await Promise.all(sigPromises);

    pairIds.forEach(pairId => {
      const pair = pairsList.find(p => p.id === pairId);
      if (!pair) return;
      const d = allData[pairId];
      if (!d) return;

      let card = document.getElementById('chart-card-' + pairId);
      if (!card) {
        card = document.createElement('div');
        card.id = 'chart-card-' + pairId;
        card.className = 'chart-pair-card glass-card';

        const deployers = _getDeployerFromPair(pair);
        const colorA = _getDeployerColor(deployers.a);
        const colorB = _getDeployerColor(deployers.b);

        card.innerHTML = `
          <div class="chart-pair-header">
            <span class="chart-pair-name">${pair.label || pairId}</span>
            <span class="deployer-badge" style="background:${colorA}22;color:${colorA};border:1px solid ${colorA}44;">${deployers.a}</span>
            <span class="deployer-badge" style="background:${colorB}22;color:${colorB};border:1px solid ${colorB}44;">${deployers.b}</span>
            <span class="chart-right-annot" id="chart-annot-${pairId}"></span>
          </div>
          <div style="position:relative;height:160px;"><canvas id="chart-price-${pairId}"></canvas></div>
          <div style="position:relative;height:120px;margin-top:4px;"><canvas id="chart-spread-${pairId}"></canvas></div>
          <div style="position:relative;height:80px;margin-top:4px;"><canvas id="chart-spreadbps-${pairId}"></canvas></div>
          <div class="chart-spread-ratio-row"><canvas id="chart-ratio-${pairId}"></canvas></div>
          <div style="position:relative;height:80px;margin-top:4px;"><canvas id="chart-edge-depth-${pairId}"></canvas></div>
          <div class="chart-copula-row">
            <div class="chart-copula-stats" id="copula-stats-${pairId}"></div>
            <div class="chart-copula-scatter"><canvas id="chart-copula-${pairId}"></canvas></div>
          </div>
        `;
        grid.appendChild(card);
      }

      const deployers = _getDeployerFromPair(pair);
      const colorA = _getDeployerColor(deployers.a);
      const colorB = _getDeployerColor(deployers.b);

      const rawLabels = d.labels || [];
      const labels = rawLabels.map(ts => {
        if (typeof ts === 'number' && ts > 1e12) {
          return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: isTick ? '2-digit' : undefined });
        }
        return ts;
      });
      const midA = d.midA || [];
      const midB = d.midB || [];
      const bestBidA = d.bestBidA || [];
      const bestAskA = d.bestAskA || [];
      const bestBidB = d.bestBidB || [];
      const bestAskB = d.bestAskB || [];
      const d1Edge = d.d1 || [];
      const d2Edge = d.d2 || [];
      const depthA = d.depthA || [];
      const depthB = d.depthB || [];

      const lastA = midA.filter(v => v != null).pop();
      const lastB = midB.filter(v => v != null).pop();
      const lastSpread = (d.midSpreadBps || []).filter(v => v != null).pop();
      const lastD1 = d1Edge.filter(v => v != null).pop();
      const lastD2 = d2Edge.filter(v => v != null).pop();
      const annotEl = document.getElementById('chart-annot-' + pairId);
      if (annotEl) {
        let parts = [];
        if (lastA != null) parts.push(`<span style="color:${colorA}">$${Number(lastA).toFixed(4)}</span>`);
        if (lastB != null) parts.push(`<span style="color:${colorB}">$${Number(lastB).toFixed(4)}</span>`);
        if (lastSpread != null) parts.push(`<span style="color:var(--accent-purple);">${Number(lastSpread).toFixed(2)}bps</span>`);
        if (lastD1 != null) parts.push(`<span style="color:#c6940a;">\u2212:${Number(lastD1).toFixed(1)}</span>`);
        if (lastD2 != null) parts.push(`<span style="color:#3b82f6;">+:${Number(lastD2).toFixed(1)}</span>`);
        if (d.zStats) {
          const s1 = d.zStats.d1?.stdBps ?? 0;
          const s2 = d.zStats.d2?.stdBps ?? 0;
          const m1 = d.zStats.d1?.meanBps ?? 0;
          const m2 = d.zStats.d2?.meanBps ?? 0;
          const zm1 = d.zStats.d1?.zMin;
          const zm2 = d.zStats.d2?.zMin;
          const em = d.zStats.d1?.edgeMinBps ?? 0;
          const zmStr1 = zm1 != null ? zm1.toFixed(1) : '∞';
          const zmStr2 = zm2 != null ? zm2.toFixed(1) : '∞';
          parts.push(`<span style="color:var(--text-tertiary);font-size:0.75em;" title="1σ d1=${s1.toFixed(1)}bps d2=${s2.toFixed(1)}bps | μ d1=${m1.toFixed(1)} d2=${m2.toFixed(1)} | edgeMin=${em.toFixed(1)}bps | Zmin d1=${zmStr1} d2=${zmStr2}">σ=${s1.toFixed(1)}/${s2.toFixed(1)} Zmin=${zmStr1}/${zmStr2}</span>`);
        }
        annotEl.innerHTML = parts.join(' <span style="color:var(--border-secondary);">|</span> ');
      }

      const hasBidAsk = bestBidA.length > 0 && bestBidA.some(v => v > 0);
      const markers = _buildSignalMarkers(pairId, rawLabels, midA);
      const priceDatasets = [
        { label: deployers.a, data: midA, borderColor: colorA, backgroundColor: colorA + '18', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false, order: 2 },
        { label: deployers.b, data: midB, borderColor: colorB, backgroundColor: colorB + '18', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false, order: 2 }
      ];

      if (hasBidAsk) {
        priceDatasets.push(
          { label: 'Ask A', data: bestAskA, borderColor: 'transparent', backgroundColor: colorA + '12', borderWidth: 0, pointRadius: 0, fill: '+1', order: 3 },
          { label: 'Bid A', data: bestBidA, borderColor: 'transparent', backgroundColor: 'transparent', borderWidth: 0, pointRadius: 0, fill: false, order: 3 },
          { label: 'Ask B', data: bestAskB, borderColor: 'transparent', backgroundColor: colorB + '12', borderWidth: 0, pointRadius: 0, fill: '+1', order: 4 },
          { label: 'Bid B', data: bestBidB, borderColor: 'transparent', backgroundColor: 'transparent', borderWidth: 0, pointRadius: 0, fill: false, order: 4 }
        );
      }

      if (markers.entryPts && markers.entryPts.length > 0) {
        const entryData = new Array(labels.length).fill(null);
        const entryColors = [];
        for (const ep of markers.entryPts) {
          entryData[ep.idx] = ep.val;
          entryColors.push(ep.dir === 1 ? '#10b981' : '#f59e0b');
        }
        priceDatasets.push({
          label: 'Entry', data: entryData, borderColor: entryColors, backgroundColor: entryColors,
          pointRadius: 5, pointStyle: 'triangle', borderWidth: 1.5, showLine: false, order: 1
        });
      }
      if (markers.exitPts && markers.exitPts.length > 0) {
        const exitData = new Array(labels.length).fill(null);
        for (const ep of markers.exitPts) exitData[ep.idx] = ep.val;
        priceDatasets.push({
          label: 'Exit', data: exitData, borderColor: '#ef4444', backgroundColor: '#ef444488',
          pointRadius: 5, pointStyle: 'rectRot', borderWidth: 1.5, showLine: false, order: 1
        });
      }

      const priceCtx = document.getElementById('chart-price-' + pairId);
      if (priceCtx) {
        if (_allPairsChartInstances[pairId]?.price) _allPairsChartInstances[pairId].price.destroy();
        if (!_allPairsChartInstances[pairId]) _allPairsChartInstances[pairId] = {};
        _allPairsChartInstances[pairId].price = new Chart(priceCtx, {
          type: 'line',
          data: { labels, datasets: priceDatasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, labels: { font: { size: 9 }, usePointStyle: true, boxWidth: 6, filter: item => !['Ask A', 'Bid A', 'Ask B', 'Bid B'].includes(item.text) } }
            },
            scales: {
              x: { display: true, ticks: { maxTicksLimit: 6, font: { size: 8 }, maxRotation: 0 }, grid: { display: false } },
              y: { ticks: { font: { size: 8 } }, grid: { color: 'rgba(0,0,0,0.04)' } }
            }
          }
        });
      }

      const spreadBps = d.midSpreadBps || midA.map((a, i) => {
        const b = midB[i];
        if (a == null || b == null || b === 0) return 0;
        return ((a / b) - 1) * 10000;
      });

      const win = 20;
      let result;
      if (_volSpreadMode === 'ou') result = _computeOU(spreadBps, win);
      else if (_volSpreadMode === 'kalman') result = _computeKalman(spreadBps);
      else if (_volSpreadMode === 'ewma') result = _computeEWMA(spreadBps);
      else result = _computeStaticZ(spreadBps, win);

      const spreadCtx = document.getElementById('chart-spread-' + pairId);
      if (spreadCtx) {
        if (_allPairsChartInstances[pairId]?.spread) _allPairsChartInstances[pairId].spread.destroy();
        const zeroLine = new Array(labels.length).fill(0);
        _allPairsChartInstances[pairId].spread = new Chart(spreadCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: result.label, data: result.values, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1.2, pointRadius: 0, tension: 0.3, fill: true },
              { label: '+2\u03C3', data: result.upper, borderColor: '#ef4444', borderDash: [4, 2], borderWidth: 0.8, pointRadius: 0, fill: false },
              { label: '\u22122\u03C3', data: result.lower, borderColor: '#ef4444', borderDash: [4, 2], borderWidth: 0.8, pointRadius: 0, fill: false },
              { label: '0', data: zeroLine, borderColor: 'rgba(100,116,139,0.4)', borderDash: [2, 4], borderWidth: 0.6, pointRadius: 0, fill: false }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              x: { display: false },
              y: { ticks: { font: { size: 8 } }, grid: { color: 'rgba(0,0,0,0.04)' },
                title: { display: true, text: result.label, font: { size: 8 } }
              }
            }
          }
        });
      }

      const spreadBpsCtx = document.getElementById('chart-spreadbps-' + pairId);
      if (spreadBpsCtx) {
        if (_allPairsChartInstances[pairId]?.spreadBps) _allPairsChartInstances[pairId].spreadBps.destroy();
        const bpsDemeaned = [], bpsUpperBand = [], bpsLowerBand = [];
        for (let i = 0; i < spreadBps.length; i++) {
          if (i < win) { bpsDemeaned.push(null); bpsUpperBand.push(null); bpsLowerBand.push(null); continue; }
          const slice = spreadBps.slice(i - win, i);
          const m = slice.reduce((a, b) => a + b, 0) / slice.length;
          const variance = slice.reduce((a, b) => a + (b - m) * (b - m), 0) / slice.length;
          const std = Math.sqrt(variance);
          bpsDemeaned.push(spreadBps[i] - m);
          bpsUpperBand.push(2 * std);
          bpsLowerBand.push(-2 * std);
        }
        _allPairsChartInstances[pairId].spreadBps = new Chart(spreadBpsCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Spread \u0394bps', data: bpsDemeaned, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.08)', borderWidth: 1.2, pointRadius: 0, tension: 0.3, fill: true },
              { label: '0', data: new Array(labels.length).fill(0), borderColor: 'rgba(198,148,10,0.7)', borderDash: [4, 3], borderWidth: 1, pointRadius: 0, fill: false },
              { label: '+2\u03C3', data: bpsUpperBand, borderColor: 'rgba(239,68,68,0.4)', borderDash: [3, 2], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '-2\u03C3', data: bpsLowerBand, borderColor: 'rgba(34,197,94,0.4)', borderDash: [3, 2], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '+Fees', data: new Array(labels.length).fill(1.75), borderColor: 'rgba(249,115,22,0.6)', borderDash: [6, 3], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '-Fees', data: new Array(labels.length).fill(-1.75), borderColor: 'rgba(249,115,22,0.6)', borderDash: [6, 3], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '+Fees+Slip', data: new Array(labels.length).fill(3.0), borderColor: 'rgba(234,179,8,0.6)', borderDash: [5, 3], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '-Fees+Slip', data: new Array(labels.length).fill(-3.0), borderColor: 'rgba(234,179,8,0.6)', borderDash: [5, 3], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '+Fees+3Slip', data: new Array(labels.length).fill(4.75), borderColor: 'rgba(220,38,38,0.6)', borderDash: [4, 3], borderWidth: 0.7, pointRadius: 0, fill: false },
              { label: '-Fees+3Slip', data: new Array(labels.length).fill(-4.75), borderColor: 'rgba(220,38,38,0.6)', borderDash: [4, 3], borderWidth: 0.7, pointRadius: 0, fill: false }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              x: { display: false },
              y: { ticks: { font: { size: 7 }, callback: v => v.toFixed(1) }, grid: { color: 'rgba(0,0,0,0.04)' },
                title: { display: true, text: '\u0394 Spread bps', font: { size: 7 } }
              }
            }
          }
        });
      }

      const edgeDepthCtx = document.getElementById('chart-edge-depth-' + pairId);
      if (edgeDepthCtx && (d1Edge.length > 0 || depthA.length > 0)) {
        if (_allPairsChartInstances[pairId]?.edgeDepth) _allPairsChartInstances[pairId].edgeDepth.destroy();
        const edgeDepthDatasets = [];
        const pairMetaEdge = pairsList.find(pp => pp.id === pairId);
        const pairFeeRtEdge = pairMetaEdge ? (pairMetaEdge.feeRoundTripBps || 3.28) : 3.28;
        if (d1Edge.length > 0) {
          const feeRefLine = new Array(labels.length).fill(pairFeeRtEdge);
          const zeroRefLine = new Array(labels.length).fill(0);
          edgeDepthDatasets.push(
            { label: '\u2212 Edge', data: d1Edge, borderColor: '#c6940a', borderWidth: 1.2, pointRadius: 0, tension: 0.3, fill: false, yAxisID: 'yEdge', order: 1 },
            { label: '+ Edge', data: d2Edge, borderColor: '#3b82f6', borderWidth: 1.2, pointRadius: 0, tension: 0.3, fill: false, yAxisID: 'yEdge', order: 1 },
            { label: `Fee RT ${pairFeeRtEdge.toFixed(1)}`, data: feeRefLine, borderColor: 'rgba(239,68,68,0.6)', borderDash: [6, 3], borderWidth: 0.8, pointRadius: 0, fill: false, yAxisID: 'yEdge', order: 0 },
            { label: '0', data: zeroRefLine, borderColor: 'rgba(100,116,139,0.3)', borderDash: [2, 4], borderWidth: 0.5, pointRadius: 0, fill: false, yAxisID: 'yEdge', order: 0 }
          );
        }
        if (depthA.length > 0) {
          edgeDepthDatasets.push(
            { label: 'Depth A', data: depthA, type: 'bar', backgroundColor: colorA + '30', borderColor: colorA + '60', borderWidth: 0.5, yAxisID: 'yDepth', order: 2, barPercentage: 1.0, categoryPercentage: 1.0 },
            { label: 'Depth B', data: depthB, type: 'bar', backgroundColor: colorB + '30', borderColor: colorB + '60', borderWidth: 0.5, yAxisID: 'yDepth', order: 2, barPercentage: 1.0, categoryPercentage: 1.0 }
          );
        }
        _allPairsChartInstances[pairId].edgeDepth = new Chart(edgeDepthCtx, {
          type: 'line',
          data: { labels, datasets: edgeDepthDatasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, labels: { font: { size: 8 }, usePointStyle: true, boxWidth: 5 } }
            },
            scales: {
              x: { display: false },
              yEdge: {
                position: 'left', ticks: { font: { size: 7 } }, grid: { color: 'rgba(0,0,0,0.04)' },
                title: { display: true, text: 'Edge bps', font: { size: 7 } }
              },
              yDepth: {
                position: 'right', ticks: { font: { size: 7 }, callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)) },
                grid: { display: false },
                title: { display: true, text: 'Depth $', font: { size: 7 } }
              }
            }
          }
        });
      }

      const ratioData = midA.map((a, i) => {
        const b = midB[i];
        if (a == null || b == null || b === 0) return null;
        return a / b;
      });
      const ratioCtx = document.getElementById('chart-ratio-' + pairId);
      if (ratioCtx) {
        if (_allPairsChartInstances[pairId]?.spreadRatio) _allPairsChartInstances[pairId].spreadRatio.destroy();
        const ratioMean = ratioData.filter(v => v != null);
        const rm = ratioMean.length > 0 ? ratioMean.reduce((a, b) => a + b, 0) / ratioMean.length : 1;
        const meanLine = new Array(labels.length).fill(rm);
        _allPairsChartInstances[pairId].spreadRatio = new Chart(ratioCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Spread Ratio', data: ratioData, borderColor: '#c6940a', backgroundColor: 'rgba(198,148,10,0.06)', borderWidth: 1.2, pointRadius: 0, tension: 0.3, fill: true },
              { label: 'Mean', data: meanLine, borderColor: 'rgba(198,148,10,0.4)', borderDash: [4, 3], borderWidth: 0.8, pointRadius: 0, fill: false }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              x: { display: false },
              y: { ticks: { font: { size: 7 }, callback: v => v.toFixed(4) }, grid: { color: 'rgba(0,0,0,0.04)' },
                title: { display: true, text: 'A/B Ratio', font: { size: 7 } }
              }
            }
          }
        });
      }

      const copulaStats = _computeCopulaStats(midA, midB);
      const copulaStatsEl = document.getElementById('copula-stats-' + pairId);
      if (copulaStatsEl && copulaStats) {
        const corrClass = copulaStats.correlation > 0.7 ? 'green' : copulaStats.correlation > 0.4 ? 'gold' : 'red';
        copulaStatsEl.innerHTML = `
          <div style="font-size:0.62rem;font-weight:700;color:var(--text-secondary);margin-bottom:2px;">Copula Statistics</div>
          <div class="copula-stat-row"><span class="copula-stat-label">Pearson's \u03C1</span><span class="copula-stat-value gold">${copulaStats.pearson.toFixed(4)}</span></div>
          <div class="copula-stat-row"><span class="copula-stat-label">Spearman's \u03C1<sub>s</sub></span><span class="copula-stat-value gold">${copulaStats.spearman.toFixed(4)}</span></div>
          <div class="copula-stat-row"><span class="copula-stat-label">Kendall's \u03C4</span><span class="copula-stat-value gold">${copulaStats.kendall.toFixed(4)}</span></div>
          <div class="copula-stat-row"><span class="copula-stat-label">Best Fit</span><span class="copula-stat-value" style="color:#ef4444;">${copulaStats.bestFit}</span></div>
          <div class="copula-stat-row"><span class="copula-stat-label">Correlation</span><span class="copula-stat-value ${corrClass}">${(copulaStats.correlation * 100).toFixed(1)}%</span></div>
        `;
      } else if (copulaStatsEl) {
        copulaStatsEl.innerHTML = '<div style="font-size:0.62rem;color:var(--text-muted);padding:10px;">Insufficient data</div>';
      }

      const copulaCtx = document.getElementById('chart-copula-' + pairId);
      if (copulaCtx && copulaStats) {
        if (_allPairsChartInstances[pairId]?.copula) _allPairsChartInstances[pairId].copula.destroy();
        const scatterData = copulaStats.uA.map((u, i) => ({ x: u, y: copulaStats.uB[i] }));
        _allPairsChartInstances[pairId].copula = new Chart(copulaCtx, {
          type: 'scatter',
          data: {
            datasets: [{
              label: 'Empirical Copula',
              data: scatterData,
              backgroundColor: 'rgba(56,189,248,0.45)',
              borderColor: 'rgba(56,189,248,0.1)',
              pointRadius: 1.8,
              pointHoverRadius: 3
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: {
              legend: { display: false },
              title: { display: true, text: `Empirical Copula \u2014 ${deployers.a} / ${deployers.b}`, font: { size: 8 }, color: 'var(--text-secondary)' }
            },
            scales: {
              x: { min: 0, max: 1, ticks: { font: { size: 7 }, stepSize: 0.25 }, grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false } },
              y: { min: 0, max: 1, ticks: { font: { size: 7 }, stepSize: 0.25 }, grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false } }
            }
          }
        });
      }
    });

    if (_chartsRefreshTimer) clearInterval(_chartsRefreshTimer);
    _chartsRefreshTimer = setInterval(() => {
      if (currentView === 'charts') refreshAllPairsCharts();
    }, isTick ? 2000 : 5000);
  } catch (e) {
    console.error('All-pairs charts error:', e);
  }
}

async function refreshEdgeChart() {
  const pairId = document.getElementById('chartPairSelect')?.value;
  const hours = parseInt(document.getElementById('chartWindowSelect')?.value || '4');
  if (!pairId) return;
  try {
    const res = await fetch(`/bot/chart-data/${pairId}?hours=${hours}`);
    const data = await res.json();
    if (!data.snapshots || data.snapshots.length === 0) return;
    const snaps = data.snapshots;
    const labels = snaps.map(s => new Date(parseInt(s.ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    _renderEdgeChart(snaps, labels, data.entryMinBps);
  } catch (e) {
    console.error('Edge chart error:', e);
  }
}

function _renderEdgeChart(snaps, labels, entryMinBps) {
  const ctx = document.getElementById('chartEdge');
  if (!ctx) return;
  const d1 = snaps.map(s => parseFloat(s.dir1_edge_bps || 0));
  const d2 = snaps.map(s => parseFloat(s.dir2_edge_bps || 0));
  const threshold = snaps.map(() => entryMinBps);
  if (_chartEdge) _chartEdge.destroy();
  _chartEdge = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '\u2212 Edge', data: d1, borderColor: '#c6940a', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: '+ Edge', data: d2, borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Threshold', data: threshold, borderColor: '#ef4444', borderDash: [6, 3], borderWidth: 1, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { font: { size: 11 }, usePointStyle: true } } },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
        y: { title: { display: true, text: 'bps', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } }
      }
    }
  });
}

let _histPage = 1;
let _histTotalPages = 1;

let _histBotId = 'bot1';

function openActivityHistoryModal(botId) {
  _histBotId = botId || 'bot1';
  const modal = document.getElementById('activityHistoryModal');
  if (!modal) return;
  modal.style.display = '';
  const pairSelect = document.getElementById('histFilterPair');
  if (pairSelect && pairSelect.options.length <= 1) {
    for (const p of pairsList) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label || p.id;
      pairSelect.appendChild(opt);
    }
  }
  loadActivityHistory(1);
}

function closeActivityHistoryModal() {
  const modal = document.getElementById('activityHistoryModal');
  if (modal) modal.style.display = 'none';
}

function clearHistoryFilters() {
  document.getElementById('histFilterPair').value = '';
  document.getElementById('histFilterType').value = '';
  document.getElementById('histFilterMotif').value = '';
  document.getElementById('histFilterSearch').value = '';
  document.getElementById('histFilterFrom').value = '';
  document.getElementById('histFilterTo').value = '';
  loadActivityHistory(1);
}

async function loadActivityHistory(page) {
  if (page < 1) return;
  _histPage = page;
  const pair = document.getElementById('histFilterPair').value;
  const type = document.getElementById('histFilterType').value;
  const motif = document.getElementById('histFilterMotif').value;
  const search = document.getElementById('histFilterSearch').value;
  const fromVal = document.getElementById('histFilterFrom').value;
  const toVal = document.getElementById('histFilterTo').value;

  const params = new URLSearchParams();
  params.set('page', page);
  params.set('limit', '100');
  if (pair) params.set('pair', pair);
  if (type) params.set('type', type);
  if (motif) params.set('motif', motif);
  if (search) params.set('search', search);
  if (fromVal) params.set('from', new Date(fromVal).getTime());
  if (toVal) params.set('to', new Date(toVal).getTime());

  try {
    const baseUrl = _histBotId === 'bot2' ? '/bot2/activity-history' : '/bot/activity-history';
    const res = await fetch(baseUrl + '?' + params.toString());
    const data = await res.json();
    _histTotalPages = data.totalPages || 1;
    const body = document.getElementById('historyTableBody');
    const countEl = document.getElementById('histResultCount');
    const pageInfo = document.getElementById('histPageInfo');
    const prevBtn = document.getElementById('histPrevBtn');
    const nextBtn = document.getElementById('histNextBtn');

    if (countEl) countEl.textContent = `${data.total} r\u00E9sultat${data.total !== 1 ? 's' : ''}`;
    if (pageInfo) pageInfo.textContent = `Page ${data.page}/${_histTotalPages}`;
    if (prevBtn) prevBtn.disabled = data.page <= 1;
    if (nextBtn) nextBtn.disabled = data.page >= _histTotalPages;

    if (!body) return;
    if (!data.entries || data.entries.length === 0) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">Aucun r\u00E9sultat</td></tr>';
      return;
    }

    body.innerHTML = data.entries.map(e => {
      const dt = new Date(e.ts);
      const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const pairLabel = (pairsList.find(p => p.id === e.pairId) || {}).label || e.pairId || '-';
      const dirStr = e.direction === 1 ? '<span class="dir-badge dir-d1">D1</span>' : e.direction === 2 ? '<span class="dir-badge dir-d2">D2</span>' : '-';
      const typeTag = `<span class="hist-type-tag ${e.type || ''}">${e.type || '-'}</span>`;
      const latStr = e.latencyMs ? `${e.latencyMs}ms` : '-';
      const motifStr = e.motif || '-';
      const msgStr = (e.message || '').substring(0, 120);
      return `<tr>
        <td>${dateStr} ${timeStr}</td>
        <td>${typeTag}</td>
        <td>${pairLabel}</td>
        <td>${dirStr}</td>
        <td style="font-size:0.68rem;">${motifStr}</td>
        <td>${latStr}</td>
        <td style="font-size:0.68rem;white-space:normal;max-width:300px;word-break:break-word;">${msgStr}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Activity history error:', e);
  }
}

let _sseSource = null;
let _sseReconnectTimer = null;
let _sseConnected = false;

function _connectSSE() {
  if (_sseSource) {
    try { _sseSource.close(); } catch (e) {}
  }
  try {
    _sseSource = new EventSource('/bot/events');

    _sseSource.onopen = function() {
      _sseConnected = true;
      if (_sseReconnectTimer) { clearTimeout(_sseReconnectTimer); _sseReconnectTimer = null; }
    };

    _sseSource.onmessage = function(ev) {
      try {
        const event = JSON.parse(ev.data);
        _handleSSEEvent(event);
      } catch (e) {}
    };

    _sseSource.onerror = function() {
      _sseConnected = false;
      try { _sseSource.close(); } catch (e) {}
      _sseSource = null;
      if (!_sseReconnectTimer) {
        _sseReconnectTimer = setTimeout(_connectSSE, 5000);
      }
    };
  } catch (e) {
    _sseConnected = false;
    if (!_sseReconnectTimer) {
      _sseReconnectTimer = setTimeout(_connectSSE, 5000);
    }
  }
}

function _handleSSEEvent(event) {
  if (!event || !event.type) return;

  if (event.type === 'ENTRY_FILLED') {
    playAlertSound('fill');
    pollOverviewActivity();
    pollBotActivity();
    pollBotTrades();
    pollOverview();
  }

  if (event.type === 'ENTRY_FAILED') {
    pollOverviewActivity();
    pollBotActivity();
    pollOverview();
  }

  if (event.type === 'CLOSE_SUBMITTED') {
    _updateTradeCloseStatus(event.tradeId, 'closing', event.reason);
  }

  if (event.type === 'CLOSE_FILLED') {
    _updateTradeCloseStatus(event.tradeId, 'closed', event.reason);
    pollOverviewActivity();
    pollBotActivity();
    pollBotTrades();
    pollOverview();
    pollBotPairStats();
  }

  if (event.type === 'CLOSE_FAILED') {
    _updateTradeCloseStatus(event.tradeId, 'error', event.error);
    pollOverviewActivity();
    pollBotActivity();
    pollBotTrades();
    pollOverview();
  }
}

function _updateTradeCloseStatus(tradeId, status, detail) {
  if (!tradeId) return;
  const row = document.querySelector(`tr[data-trade-id="${tradeId}"]`);
  if (!row) return;
  const statusCell = row.querySelector('.trade-status');
  if (!statusCell) return;
  const colorMap = { closing: '#f59e0b', closed: '#10b981', error: '#ef4444' };
  const labelMap = { closing: 'CLOSING...', closed: 'CLOSED', error: 'ERROR' };
  statusCell.style.color = colorMap[status] || '';
  statusCell.textContent = labelMap[status] || status;
  if (status === 'closing') {
    row.style.opacity = '0.7';
  } else if (status === 'closed') {
    row.style.opacity = '0.5';
    setTimeout(() => { pollBotTrades(); }, 1000);
  } else if (status === 'error') {
    row.style.opacity = '1';
    row.style.borderLeft = '3px solid #ef4444';
  }
}

_connectSSE();

async function toggleDirectionSplit() {
  const toggle = document.getElementById('dirSplitToggle');
  const enabled = toggle?.checked || false;
  try {
    await fetch('/supervisor/direction-split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    document.getElementById('dirSplitLabel').textContent = enabled ? 'ON' : 'OFF';
  } catch (e) { console.error('Direction split toggle error:', e); }
}

const _sbPnlHistories = {};
const _SB_PNL_MAX = 120;
const _sbPanelState = {};
for (const [key, cfg] of Object.entries(typeof BOT_PANEL_REGISTRY !== 'undefined' ? BOT_PANEL_REGISTRY : {})) {
  _sbPnlHistories[cfg.prefix] = [];
  _sbPanelState[cfg.prefix] = { pairsLoaded: false, dustOpen: false, stableOpen: false, dnOpen: false };
}

function _sbEl(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function _sbFmt(v) { return '$' + (v || 0).toFixed(4); }
function _sbFmt2(v) { return '$' + (v || 0).toFixed(2); }

function _sbUpdateBotPanel(prefix, data, balData, keyData, pingData) {
  const dot = document.getElementById(prefix + 'Dot');
  const text = document.getElementById(prefix + 'StatusText');
  const startBtn = document.getElementById(prefix + 'StartBtn');
  const stopBtn = document.getElementById(prefix + 'StopBtn');
  const resetBtn = document.getElementById(prefix + 'ResetBtn');

  const liqBtn = document.getElementById(prefix + 'LiqBtn');
  if (data.enabled && data.liquidationMode) {
    if (dot) dot.className = 'status-dot liquidating';
    if (text) { text.textContent = 'LIQUIDATION'; text.style.color = '#f59e0b'; }
    if (startBtn) { startBtn.style.display = 'none'; }
    if (stopBtn) { stopBtn.style.display = ''; stopBtn.disabled = false; stopBtn.textContent = 'Stop'; }
    if (liqBtn) { liqBtn.classList.add('active'); liqBtn.textContent = 'LIQUIDATION ON'; }
  } else if (data.enabled) {
    if (dot) dot.className = 'status-dot connected';
    if (text) { text.textContent = 'ACTIVE'; text.style.color = '#10b981'; }
    if (startBtn) { startBtn.style.display = 'none'; startBtn.disabled = false; startBtn.textContent = 'Start'; }
    if (stopBtn) { stopBtn.style.display = ''; stopBtn.disabled = false; stopBtn.textContent = 'Stop'; }
    if (liqBtn) { liqBtn.classList.remove('active'); liqBtn.textContent = 'Liquidation'; }
  } else {
    if (dot) dot.className = 'status-dot disconnected';
    if (text) { text.textContent = data.initialized ? 'STOPPED' : 'NOT INITIALIZED'; text.style.color = data.initialized ? '#f59e0b' : '#ef4444'; }
    if (startBtn) { startBtn.style.display = ''; startBtn.disabled = false; startBtn.textContent = 'Start'; }
    if (stopBtn) { stopBtn.style.display = 'none'; stopBtn.disabled = false; stopBtn.textContent = 'Stop'; }
    if (liqBtn) { liqBtn.classList.remove('active'); liqBtn.textContent = 'Liquidation'; }
  }

  const ls = data.liveStats || {};

  const fees = ls.totalFeesUsd || ls.totalFees || 0;
  const rawPnl = ls.totalPnlUsd || ls.realizedPnl || 0;
  const errCost = (ls.allErrorCostUsd || 0) + (ls.dnAdjustmentCostUsd || 0) + (ls.errorCost || 0);
  const fundNet = ls.fundingNet || ls.walletFunding || 0;
  const pnlNet = rawPnl - fees - errCost + fundNet;

  const pnlEl = document.getElementById(prefix + 'Pnl');
  if (pnlEl) {
    pnlEl.textContent = (pnlNet >= 0 ? '+' : '') + '$' + pnlNet.toFixed(4);
    pnlEl.className = 'bot-card-value ' + (pnlNet >= 0 ? 'positive' : 'negative');
  }

  if (!_sbPnlHistories[prefix]) _sbPnlHistories[prefix] = [];
  const history = _sbPnlHistories[prefix];
  history.push({ ts: Date.now(), val: pnlNet });
  if (history.length > _SB_PNL_MAX) history.shift();
  _drawSparklineFromHistory(prefix + 'PnlSparkline', history);

  _sbEl(prefix + 'TotalFees', _sbFmt(fees));
  const volUsd = ls.totalVolumeUsd || ls.totalVolume || 0;
  _sbEl(prefix + 'Volume', '$' + (volUsd / 1000).toFixed(2) + 'K');
  _sbEl(prefix + 'Open', ls.open || ls.openTrades || 0);
  _sbEl(prefix + 'Closed', ls.closed || 0);
  const wins = ls.wins || 0;
  const losses = ls.losses || 0;
  const closed = ls.closed || 0;
  _sbEl(prefix + 'Wins', wins);
  _sbEl(prefix + 'Losses', losses);
  _sbEl(prefix + 'WinRate', closed > 0 ? Math.round(wins / closed * 100) + '%' : '--%');
  _sbEl(prefix + 'Slippage', (ls.avgEntrySlippageBps || ls.avgSlippage || 0).toFixed(2) + ' bps');
  _sbEl(prefix + 'Errors', ls.errors || 0);
  const orphCost = ls.orphanCostUsd || 0;
  const orphEl = document.getElementById(prefix + 'OrphanCost');
  if (orphEl) { orphEl.textContent = orphCost > 0 ? '-$' + orphCost.toFixed(4) : '$0.0000'; if (orphCost > 0) orphEl.className = 'bot-card-value negative'; }
  const fundEl = document.getElementById(prefix + 'FundingNet');
  if (fundEl) { fundEl.textContent = _sbFmt(fundNet); fundEl.className = 'bot-card-value ' + (fundNet >= 0 ? 'positive' : 'negative'); }

  const execLat = ls.execLatency || data.execTime || {};
  const closeLat = ls.closeLatency || data.closeLatency || {};
  const avgLatEl = document.getElementById(prefix + 'AvgLatency');
  if (avgLatEl) {
    const entryAvg = execLat.avg != null ? execLat.avg : null;
    const closeAvg = closeLat.avg != null ? closeLat.avg : null;
    if (entryAvg != null) {
      const cls = entryAvg <= 200 ? 'latency-good' : entryAvg <= 500 ? 'latency-ok' : 'latency-bad';
      avgLatEl.innerHTML = `<span class="${cls}">${entryAvg}ms</span>` + (closeAvg != null ? ` <span style="font-size:0.6rem;color:var(--text-muted);">/ ${closeAvg}ms</span>` : '');
    } else {
      avgLatEl.textContent = '--';
    }
  }

  if (balData) {
    const fmt2 = v => v === 0 ? '0.00' : Number(v).toFixed(2);
    _sbEl(prefix + 'BalUSDC', fmt2(balData.usdc || 0));
    const regEntry = Object.values(BOT_PANEL_REGISTRY).find(r => r.prefix === prefix);
    const isCash = regEntry && regEntry.deployer === 'cash';
    const secondaryVal = isCash ? (balData.usdt || 0) : (balData.usdh || 0);
    _sbEl(prefix + 'BalSecondary', fmt2(secondaryVal));
    _sbEl(prefix + 'BalTotal', fmt2((parseFloat(balData.usdc || 0)) + parseFloat(secondaryVal)));
  }
  if (pingData) {
    _sbEl(prefix + 'Ping', pingData.ok ? pingData.pingMs + 'ms' : '?');
  }
  if (keyData) {
    _sbEl(prefix + 'ApiKeyMasked', keyData.masked || '--');
    _sbEl(prefix + 'WalletAddr', keyData.wallet || '');
    updateVaultDisplay(prefix, keyData.vault);
  }
  if (data.feeRates) {
    _sbEl(prefix + 'Fees', (data.feeRates.takerFeeGrowthBps || '?') + 'bps');
  }

  if (!_sbUserDirty[prefix]) {
    if (data.maxPositionUsd != null) { const el = document.getElementById(prefix + 'MaxPosUsd'); if (el) el.value = data.maxPositionUsd; }
    if (data.maxLossBps != null) { const el = document.getElementById(prefix + 'MaxLossBps'); if (el) el.value = data.maxLossBps; }
    if (data.closeBufferBps != null) { const el = document.getElementById(prefix + 'CloseBuffer'); if (el) el.value = data.closeBufferBps; }
    if (data.maxGlobalPositions != null) { const el = document.getElementById(prefix + 'MaxGlobal'); if (el) el.value = data.maxGlobalPositions; }
    if (data.maxLeverage != null) { const el = document.getElementById(prefix + 'MaxLeverage'); if (el) el.value = data.maxLeverage; }
    if (data.stopLossBps != null) { const el = document.getElementById(prefix + 'StopLoss'); if (el) el.value = data.stopLossBps; }
  }

  if (data.p50Mode) {
    _highlightModeButtons(prefix + 'P50ModeSelector', data.p50Mode);
  }

  if (data.tiersEnabled !== undefined) {
    const tiersCheck = document.getElementById(prefix + 'TiersEnabled');
    if (tiersCheck) tiersCheck.checked = data.tiersEnabled;
  }

  const pairZMap = data.pairZThresholds || {};
  const pairBufMap = data.pairBufferBps || {};

  if (pairsList.length > 0) {
    const container = document.getElementById(prefix + 'PairToggles');
    const regEntry = typeof BOT_PANEL_REGISTRY !== 'undefined' ? Object.values(BOT_PANEL_REGISTRY).find(r => r.prefix === prefix) : null;
    const botPfx = regEntry ? regEntry.botPrefix : ((prefix === 'sb1') ? 'bot' : 'bot2');
    const deployerFilter = regEntry ? regEntry.deployer : null;
    if (container && container.children.length === 0) {
      const enabledSet = data.enabledPairs
        ? (Array.isArray(data.enabledPairs) ? new Set(data.enabledPairs) : data.enabledPairs)
        : new Set();
      const filteredPairs = deployerFilter ? pairsList.filter(p => p.id.startsWith(deployerFilter + '-')) : pairsList;
      const toggleFn = 'sbTogglePair';
      container.innerHTML = filteredPairs.map(p => {
        const isOn = data.enabledPairs
          ? (Array.isArray(enabledSet) || enabledSet instanceof Set ? enabledSet.has(p.id) : (enabledSet[p.id] !== false))
          : false;
        const pZ = pairZMap[p.id] ?? '';
        const pB = pairBufMap[p.id] ?? '';
        return `<div class="pair-toggle-row">
          <div class="pair-toggle ${isOn ? 'active' : ''}" data-pair="${p.id}" onclick="${toggleFn}('${botPfx}','${p.id}',this)">
            <span class="pair-toggle-label">${p.label || p.id}</span>
            <span class="pair-tier-badge" id="${prefix}Tier_${p.id}"></span>
          </div>
          <input type="number" class="pair-override-input" data-pair="${p.id}" data-field="z" placeholder="Z" step="0.1" min="0" max="5" value="${pZ}" title="Z override" onchange="sbSetPairOverride('${botPfx}','${p.id}','zThreshold',this.value)">
          <input type="number" class="pair-override-input" data-pair="${p.id}" data-field="buf" placeholder="Buf" step="0.5" min="0" max="20" value="${pB}" title="Buffer override (bps)" onchange="sbSetPairOverride('${botPfx}','${p.id}','bufferBps',this.value)">
        </div>`;
      }).join('');
    } else if (container && container.children.length > 0) {
      const inputs = container.querySelectorAll('.pair-override-input');
      for (const inp of inputs) {
        if (document.activeElement === inp) continue;
        const pid = inp.dataset.pair;
        const field = inp.dataset.field;
        const serverVal = field === 'z' ? (pairZMap[pid] ?? '') : (pairBufMap[pid] ?? '');
        if (inp.value !== String(serverVal)) inp.value = serverVal;
      }
    }
  }

  _sbSnapshotServerConfig(prefix, data);
  _sbCheckDirty(prefix);

  return { pnlNet, fees, fundNet, open: ls.open || ls.openTrades || 0, closed: closed, volume: volUsd, trades: (ls.totalTrades || ls.closed || 0) };
}

async function pollSuperBot() {
  if (currentView !== 'superbot') return;
  try {
    const _safeJson = async (r) => { try { return r ? await r.json() : null; } catch (_) { return null; } };
    const supRes = await fetch('/supervisor/status').catch(() => null);
    const supStatus = await _safeJson(supRes);

    if (supStatus && supStatus.routing) {
      _sbEl('sbRouteTotal', supStatus.routing.routed || 0);
      _sbEl('sbRouteRej', supStatus.routing.rejected || 0);
      const perBot = supStatus.routing.perBot || {};
      for (let i = 1; i <= 6; i++) {
        _sbEl('sbRouteBot' + i, perBot['bot' + (i === 1 ? '' : i)] || perBot['bot' + i] || 0);
      }
    }

    const registry = typeof BOT_PANEL_REGISTRY !== 'undefined' ? BOT_PANEL_REGISTRY : {};
    const botEntries = Object.entries(registry);
    const allFetches = botEntries.map(([key, cfg]) => {
      const bp = cfg.botPrefix;
      const statusUrl = bp === 'bot' ? '/bot/status' : `/${bp}/status`;
      const balUrl = bp === 'bot' ? '/wallet/balances' : `/${bp}/wallet/balances`;
      const keyUrl = `/${bp}/api-key`;
      const pingUrl = `/${bp}/ping`;
      return Promise.all([
        fetch(statusUrl).catch(() => null),
        fetch(balUrl).catch(() => null),
        fetch(keyUrl).catch(() => null),
        fetch(pingUrl).catch(() => null),
      ]);
    });
    const allResults = await Promise.all(allFetches);

    let combOpen = 0, combPnl = 0, combFees = 0, combFund = 0, combVol = 0, combTrades = 0;

    for (let i = 0; i < botEntries.length; i++) {
      const [key, cfg] = botEntries[i];
      const [statusRes, balRes, keyRes, pingRes] = allResults[i];
      const data = await _safeJson(statusRes);
      const balData = await _safeJson(balRes);
      const keyData = await _safeJson(keyRes);
      const pingData = await _safeJson(pingRes);

      if (!data) continue;
      const s = _sbUpdateBotPanel(cfg.prefix, data, balData, keyData, pingData);
      combOpen += s.open || 0;
      combPnl += s.pnlNet || 0;
      combFees += s.fees || 0;
      combFund += s.fundNet || 0;
      combVol += s.volume || 0;
      combTrades += s.trades || 0;

      _sbPollTrades(cfg.botPrefix, cfg.prefix);
      _sbPollActivity(cfg.botPrefix, cfg.prefix);

      const st = _sbPanelState[cfg.prefix];
      if (st) {
        if (st.dnOpen) _sbPollDn(cfg.botPrefix, cfg.prefix);
        if (st.dustOpen) _sbPollDust(cfg.botPrefix, cfg.prefix);
        if (st.stableOpen) _sbPollStable(cfg.botPrefix, cfg.prefix);
      }

      pollPairTiers(cfg.botPrefix, cfg.prefix + 'TiersBody', cfg.prefix);
    }

    _sbEl('sbCombOpen', combOpen);
    _sbEl('sbCombPnl', _sbFmt2(combPnl));
    _sbEl('sbCombFees', _sbFmt2(combFees));
    _sbEl('sbCombFund', _sbFmt2(combFund));
    _sbEl('sbCombVolume', '$' + (combVol / 1000).toFixed(2) + 'K');
    _sbEl('sbCombTrades', combTrades);

  } catch (e) { console.error('SuperBot poll error:', e); }
}

async function supervisorRestart() {
  if (!confirm('Redémarrer les bots ? Les positions ouvertes resteront gérées.')) return;
  try {
    const res = await safeFetchJson('/supervisor/restart', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      alert('Engines redémarrés avec succès.');
    } else {
      alert('Erreur restart: ' + (res.error || 'inconnu'));
    }
  } catch (e) {
    alert('Erreur réseau: ' + (e.message || 'inconnu'));
  }
  try { await pollSuperBot(); } catch (_) {}
}

function _botPrefixToUiPrefix(botPrefix) {
  if (typeof BOT_PANEL_REGISTRY !== 'undefined') {
    const entry = Object.values(BOT_PANEL_REGISTRY).find(r => r.botPrefix === botPrefix);
    if (entry) return entry.prefix;
  }
  return botPrefix;
}

function _botLabel(botPrefix) {
  if (typeof BOT_PANEL_REGISTRY !== 'undefined') {
    const entry = Object.values(BOT_PANEL_REGISTRY).find(r => r.botPrefix === botPrefix);
    if (entry) return `Bot${entry.botNum} (${entry.deployer.toUpperCase()})`;
  }
  return botPrefix;
}

async function sbBotAction(botPrefix, action) {
  const uiPfx = _botPrefixToUiPrefix(botPrefix);
  try {
    if (action === 'reset') {
      if (!confirm('Reset ' + _botLabel(botPrefix) + '?\n- Close all on-chain positions\n- Clear trade history\n- Stop the bot')) return;
      const btnId = uiPfx + 'ResetBtn';
      const btn = document.getElementById(btnId);
      if (btn) { btn.disabled = true; btn.textContent = 'Resetting...'; }
      showToast('Reset in progress...', 'info');
      fetch('/' + botPrefix + '/reset', { method: 'POST' }).then(r => r.json()).then(data => {
        const closed = data.closedPositions || [];
        const ok = closed.filter(p => p.status !== 'error' && p.status !== 'skipped').length;
        const failed = closed.filter(p => p.status === 'error').length;
        if (closed.length > 0) {
          showToast(`Reset done: ${ok}/${closed.length} positions closed` + (failed > 0 ? ` (${failed} failed)` : ''), failed > 0 ? 'error' : 'success');
        } else {
          showToast('Reset done (no positions)', 'success');
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Reset'; }
        pollSuperBot().catch(() => {});
      }).catch(() => {
        showToast('Reset error', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Reset'; }
      });
      return;
    }
    const label = _botLabel(botPrefix);
    fetch('/' + botPrefix + '/' + action, { method: 'POST' }).then(() => {
      if (action === 'stop') showToast(label + ' stopped', 'success');
      else showToast(label + ' started', 'success');
      pollSuperBot().catch(() => {});
    }).catch(() => showToast('Error: ' + action, 'error'));
  } catch (e) { console.error('sbBotAction error:', e); }
}

async function sbToggleLiquidation(botPrefix, uiPfx) {
  const btn = document.getElementById(uiPfx + 'LiqBtn');
  const isActive = btn && btn.classList.contains('active');
  const action = isActive ? 'stop' : 'start';
  const label = _botLabel(botPrefix);
  if (!isActive) {
    if (!confirm(`Enable Liquidation mode for ${label}?\n\n- Block new position opens\n- Let existing positions close normally`)) return;
  }
  if (btn) {
    if (action === 'start') {
      btn.classList.add('active');
      btn.textContent = 'LIQUIDATION ON';
      showToast(label + ' Liquidation activée', 'success');
    } else {
      btn.classList.remove('active');
      btn.textContent = 'Liquidation';
      showToast(label + ' Liquidation désactivée', 'success');
    }
  }
  fetch('/' + botPrefix + '/liquidation/' + action, { method: 'POST' }).then(() => {
    pollSuperBot().catch(() => {});
  }).catch(() => {
    if (btn) { btn.disabled = false; btn.textContent = isActive ? 'LIQUIDATION ON' : 'Liquidation'; }
    showToast('Erreur liquidation', 'error');
  });
}

async function sbResetAll() {
  if (!confirm('FULL RESET of all 6 bot wallets?\n\n- Close ALL on-chain positions\n- Delete all trade history\n- Stop all bots\n\nThis is irreversible.')) return;
  const btn = document.getElementById('sbResetAllBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Resetting...'; }
  showToast('Full reset — closing positions...', 'info');
  const botPrefixes = ['bot', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6'];
  Promise.all(botPrefixes.map(bp =>
    fetch('/' + bp + '/reset', { method: 'POST' }).then(r => r.json()).then(d => ({ bot: bp, data: d })).catch(e => ({ bot: bp, error: e.message }))
  )).then(results => {
    let ok = 0, total = 0, errors = 0;
    for (const r of results) {
      if (!r.error) {
        const closed = r.data.closedPositions || [];
        ok += closed.filter(p => p.status !== 'error' && p.status !== 'skipped').length;
        errors += closed.filter(p => p.status === 'error').length;
        total += closed.length;
      } else { errors++; }
    }
    showToast(`Reset done: ${ok}/${total} positions closed` + (errors > 0 ? ` (${errors} failed)` : ''), errors > 0 ? 'error' : 'success');
    if (btn) { btn.disabled = false; btn.textContent = 'Reset All (6 Bots)'; }
    pollSuperBot().catch(() => {});
  });
}

function sbToggleApiKey(prefix) {
  const row = document.getElementById(prefix + 'ApiKeyInputRow');
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

async function sbSubmitApiKey(botPrefix, uiPrefix) {
  const input = document.getElementById(uiPrefix + 'ApiKeyInput');
  if (!input || !input.value) return;
  try {
    const r = await fetch('/' + botPrefix + '/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateKey: input.value })
    });
    const d = await r.json();
    if (d.ok) {
      document.getElementById(uiPrefix + 'ApiKeyInputRow').style.display = 'none';
      input.value = '';
      showToast('API key set for ' + _botLabel(botPrefix), 'success');
      try { await pollSuperBot(); } catch (_) {}
    } else { alert(d.error || 'Erreur'); }
  } catch (e) { alert('Erreur: ' + e.message); }
}

async function sbApplyConfig(botPrefix, uiPrefix) {
  const g = id => document.getElementById(uiPrefix + id);
  const cfg = {
    maxPositionUsd: parseFloat(g('MaxPosUsd')?.value || 500),
    maxGlobalPositions: parseInt(g('MaxGlobal').value),
    maxLeverage: parseInt(g('MaxLeverage').value),
    stopLossBps: parseFloat(g('StopLoss').value),
  };
  const maxLossEl = g('MaxLossBps');
  if (maxLossEl) cfg.maxLossBps = parseFloat(maxLossEl.value);
  const closeBufferEl = g('CloseBuffer');
  if (closeBufferEl) cfg.closeBufferBps = parseFloat(closeBufferEl.value);
  const zEl = g('ZThreshold');
  if (zEl) cfg.zThreshold = parseFloat(zEl.value);
  const bufEl = g('BufferBps');
  if (bufEl) cfg.bufferBps = parseFloat(bufEl.value);
  const slipEl = g('SlipMargin');
  if (slipEl) cfg.slippageMarginBps = parseFloat(slipEl.value);
  const timerEl = g('DataTimer');
  if (timerEl) cfg.dataTimer = timerEl.value;
  const zmrEl = g('ZMeanRevert');
  if (zmrEl) cfg.zMeanRevert = zmrEl.checked;
  const usdcEl = g('StableUsdc'), usdtEl = g('StableUsdt'), usdhEl = g('StableUsdh');
  if (usdcEl && usdtEl && usdhEl) {
    cfg.stableTargets = {
      usdc: parseFloat(usdcEl.value) / 100,
      usdt: parseFloat(usdtEl.value) / 100,
      usdh: parseFloat(usdhEl.value) / 100,
    };
  }
  showToast('Config ' + uiPrefix.toUpperCase() + ' appliquée', 'success');
  _sbFlashSaved(uiPrefix);
  fetch('/' + botPrefix + '/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  }).then(r => {
    if (!r.ok) showToast('Erreur config ' + uiPrefix.toUpperCase(), 'error');
    pollSuperBot().catch(() => {});
  }).catch(() => showToast('Erreur réseau config', 'error'));
}

async function sbSetP50Mode(botPrefix, mode, uiPrefix) {
  try {
    await fetch('/' + botPrefix + '/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p50Mode: mode })
    });
    const sel = document.getElementById(uiPrefix + 'P50ModeSelector');
    if (sel) sel.querySelectorAll('.p50-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  } catch (e) { console.error('sbSetP50Mode error:', e); }
}


async function sbTogglePair(botPrefix, pairId, el) {
  const isNowActive = !el.classList.contains('active');
  try {
    await fetch('/' + botPrefix + '/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId, enabled: isNowActive })
    });
    el.classList.toggle('active');
  } catch (e) { console.error('sbTogglePair error:', e); }
}

async function sbForceCloseAll(botPrefix) {
  if (!confirm('Fermer TOUTES les positions ' + (botPrefix === 'bot' ? 'Bot 1' : 'Bot 2') + ' ?')) return;
  try {
    await fetch('/' + botPrefix + '/force-close-all', { method: 'POST' });
    pollSuperBot();
  } catch (e) { console.error('sbForceCloseAll error:', e); }
}

async function sbForceClosePosition(botPrefix, pairId) {
  if (!confirm('Fermer la position ' + pairId + ' ?')) return;
  try {
    await fetch('/' + botPrefix + '/force-close-pair/' + encodeURIComponent(pairId), { method: 'POST' });
    pollSuperBot();
  } catch (e) { console.error('sbForceClosePosition error:', e); }
}

function _fmtLeg(coin, side, px) {
  if (!coin) return '<span class="leg-info">--</span>';
  const c = coin.split(':');
  const dex = c[0] || '';
  const sym = c[1] || coin;
  const sideTag = (side === 'B' || side === 'buy') ? 'L' : 'S';
  const pxFmt = px ? parseFloat(px).toFixed(2) : '--';
  return `<span class="leg-info"><span class="leg-coin">${dex}:${sym}</span> ${sideTag} <span class="leg-px">@${pxFmt}</span></span>`;
}

async function _sbPollTrades(botPrefix, uiPrefix) {
  try {
    const [posRes, fillsRes] = await Promise.all([
      fetch('/' + botPrefix + '/positions'),
      fetch('/' + botPrefix + '/fills?n=30')
    ]);
    const positions = await posRes.json();
    const fillsData = await fillsRes.json();
    const fills = Array.isArray(fillsData) ? fillsData : (fillsData.rows || []);

    const openPositions = Array.isArray(positions) ? positions.filter(p => p.status === 'open') : [];
    _sbEl(uiPrefix + 'OpenTradesCount', openPositions.length);
    const openBody = document.getElementById(uiPrefix + 'OpenTradesBody');
    if (openBody) {
      if (openPositions.length === 0) {
        openBody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">Aucune position ouverte</td></tr>';
      } else {
        const now = Date.now();
        openBody.innerHTML = openPositions.map(p => {
          const pairLabel = (pairsList.find(pr => pr.id === p.pairId) || {}).label || p.pairId;
          const holdMs = now - parseInt(p.openedAt || now);
          const hold = holdMs > 3600000 ? (holdMs / 3600000).toFixed(1) + 'h' : (holdMs / 60000).toFixed(0) + 'm';
          const dirLabel = p.direction == 1 ? '<span class="dir-badge dir-d1">\u2212</span>' : '<span class="dir-badge dir-d2">+</span>';
          const size = Number(p.size || 0).toFixed(4);
          const vwapA = Number(p.vwapA || 0).toFixed(4);
          const vwapB = Number(p.vwapB || 0).toFixed(4);
          const slip = Number(p.avgSlipBps || 0).toFixed(1);
          const pnlBps = Number(p.spreadPnlBps || 0).toFixed(1);
          const pnlUsd = Number(p.spreadPnlUsd || 0).toFixed(4);
          const pnlColor = parseFloat(pnlBps) >= 0 ? '#10b981' : '#ef4444';
          const fills = p.totalFills || 0;
          return `<tr class="trades-compact"><td class="pair-cell">${pairLabel}</td><td>${dirLabel}</td><td>${size}</td><td>${vwapA}</td><td>${vwapB}</td><td>${slip}</td><td style="color:${pnlColor}">${pnlBps}bps</td><td style="color:${pnlColor}">$${pnlUsd}</td><td>${fills}</td><td>${hold}</td><td><button class="force-close-btn" onclick="sbForceClosePosition('${botPrefix}','${p.pairId}')">\u2715</button></td></tr>`;
        }).join('');
      }
    }

    _sbEl(uiPrefix + 'FillsCount', fills.length);
    const fillsBody = document.getElementById(uiPrefix + 'FillsBody');
    if (fillsBody) {
      if (fills.length === 0) {
        fillsBody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">Aucun fill</td></tr>';
      } else {
        fillsBody.innerHTML = fills.map(f => {
          const ts = new Date(parseInt(f.ts)).toLocaleTimeString();
          const pairLabel = (pairsList.find(pr => pr.id === f.pairId) || {}).label || f.pairId;
          const typeColor = f.fillType === 'entry' ? '#10b981' : f.fillType === 'orphan_unwind' ? '#f59e0b' : '#3b82f6';
          const dirLabel = f.direction == 1 ? 'D1' : 'D2';
          const pnl = f.pnlUsd ? Number(f.pnlUsd).toFixed(4) : '--';
          const pnlCls = parseFloat(f.pnlUsd || 0) >= 0 ? 'positive' : 'negative';
          return `<tr class="trades-compact"><td>${ts}</td><td class="pair-cell">${pairLabel}</td><td style="color:${typeColor}">${f.fillType}</td><td>${dirLabel}</td><td>${Number(f.size || 0).toFixed(4)}</td><td>${Number(f.priceA || 0).toFixed(4)}</td><td>${Number(f.priceB || 0).toFixed(4)}</td><td>${Number(f.edgeBps || 0).toFixed(1)}</td><td class="${pnlCls}">${pnl}</td><td>$${Number(f.feesUsd || 0).toFixed(4)}</td></tr>`;
        }).join('');
      }
    }

  } catch (e) { console.error('_sbPollTrades error:', e); }
}

const _activityFilterState = JSON.parse(localStorage.getItem('sbActivityTypeFilters') || '{}');
const _defaultActiveTypes = ['fill_entry','win','loss','accepted','reject','blocked','error','failed','halt','margin_fail','margin_ok','funding_close','stable_rebalance'];

function _isActivityTypeVisible(type) {
  if (_activityFilterState[type] !== undefined) return _activityFilterState[type];
  return _defaultActiveTypes.includes(type);
}

function toggleSbActivityFilter(btn) {
  const type = btn.dataset.type;
  const isNowActive = !btn.classList.contains('active');
  btn.classList.toggle('active', isNowActive);
  _activityFilterState[type] = isNowActive;
  localStorage.setItem('sbActivityTypeFilters', JSON.stringify(_activityFilterState));
  if (typeof BOT_PANEL_REGISTRY !== 'undefined') {
    for (const cfg of Object.values(BOT_PANEL_REGISTRY)) {
      _sbPollActivity(cfg.botPrefix, cfg.prefix);
    }
  }
}

function _initActivityFilterButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const btns = container.querySelectorAll('.af-btn');
  btns.forEach(btn => {
    const type = btn.dataset.type;
    const visible = _isActivityTypeVisible(type);
    btn.classList.toggle('active', visible);
  });
}
async function _sbPollActivity(botPrefix, uiPrefix) {
  try {
    const res = await fetch('/' + botPrefix + '/activity?n=40');
    const entries = await res.json();
    const feed = document.getElementById(uiPrefix + 'ActivityFeed');
    if (!feed) return;
    const filtered = entries.filter(e => _isActivityTypeVisible(e.type));
    feed.innerHTML = filtered.slice(0, 20).map(e => {
      const ts = new Date(e.ts).toLocaleTimeString();
      const typeClass = e.type === 'trade_open' || e.type === 'fill_entry' ? 'activity-open' : (e.type === 'win' ? 'activity-close' : (e.type === 'error' || e.type === 'failed' || e.type === 'loss' ? 'activity-error' : ''));
      const latTag = (e.type === 'filled' || e.type === 'fill_entry') && e.latencyMs ? ` <span class="activity-latency">${e.latencyMs}ms</span>` : '';
      return `<div class="activity-entry ${typeClass}"><span class="activity-time">${ts}</span><span class="activity-type">${e.type}</span>${e.pairId ? `<span class="activity-pair">${e.pairId}</span>` : ''}<span class="activity-msg">${e.message || ''}${latTag}</span></div>`;
    }).join('');
  } catch (e) {}
}

async function _sbPollDn(botPrefix, uiPrefix) {
  try {
    const res = await fetch('/' + botPrefix + '/dn-status');
    const data = await res.json();
    const badge = document.getElementById(uiPrefix + 'DnBadge');
    const container = document.getElementById(uiPrefix + 'DnContainer');
    if (!container) return;

    if (badge) {
      if (data.status === 'critical') { badge.className = 'dn-badge dn-critical'; badge.innerHTML = '&#x26A0;'; }
      else if (data.status === 'warning') { badge.className = 'dn-badge dn-warn'; badge.innerHTML = '&#x26A0;'; }
      else { badge.className = 'dn-badge dn-ok'; badge.innerHTML = '&#x2714;'; }
    }

    if (!data.trades || data.trades.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:8px;">Aucune position ouverte</div>';
    } else {
      let html = '';
      for (const t of data.trades) {
        const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
        const ratioColor = t.level === 'critical' ? '#ef4444' : t.level === 'warning' ? '#f59e0b' : '#10b981';
        html += `<div class="dn-trade-row"><span style="min-width:30px;font-weight:600;">#${t.tradeId}</span><span style="min-width:100px;">${pairLabel}</span><span style="color:${ratioColor};font-weight:600;">${t.ratioPct}%</span><span style="color:var(--text-muted);font-size:0.7rem;">A: $${t.notionalA.toFixed(2)} | B: $${t.notionalB.toFixed(2)}</span></div>`;
      }
      container.innerHTML = html;
    }
  } catch (e) {}
}

async function _sbPollDust(botPrefix, uiPrefix) {
  try {
    const res = await fetch('/' + botPrefix + '/dust');
    const data = await res.json();
    _sbEl(uiPrefix + 'DustCount', (data.trades || []).length || '0');
    const info = document.getElementById(uiPrefix + 'DustThresholdInfo');
    if (info && data.thresholdUsd !== undefined) info.textContent = 'Seuil: $' + data.thresholdUsd.toFixed(2);
    const container = document.getElementById(uiPrefix + 'DustContainer');
    if (!container) return;
    const trades = data.trades || [];
    if (trades.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">Aucune position dust \u2714</div>';
    } else {
      let html = '<div class="table-scroll"><table class="signals-table compact"><thead><tr><th>ID</th><th>Paire</th><th>Dir</th><th>Moy.</th><th>Dur\u00E9e</th><th></th></tr></thead><tbody>';
      for (const t of trades) {
        const dur = fmtDuration(Date.now() - t.entryTs);
        const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
        html += `<tr><td>${t.id}</td><td class="pair-cell">${pairLabel}</td><td><span class="tag ${t.direction === 1 ? 'dir1' : 'dir2'}">D${t.direction}</span></td><td style="color:var(--accent-red);font-weight:600;">$${t.avgNotional.toFixed(2)}</td><td>${dur}</td><td><button class="btn-sm btn-danger" onclick="sbDustCloseTrade('${botPrefix}',${t.id})">Close</button></td></tr>`;
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }
  } catch (e) {}
}

async function sbDustCloseTrade(botPrefix, tradeId) {
  if (!confirm('Fermer cette position dust #' + tradeId + ' ?')) return;
  try {
    const res = await fetch('/' + botPrefix + '/dust/close/' + tradeId, { method: 'POST' });
    const data = await res.json();
    if (data.ok) pollSuperBot();
    else alert('Erreur: ' + (data.error || 'unknown'));
  } catch (e) { alert('Erreur: ' + e.message); }
}

async function sbDustCloseAll(botPrefix) {
  if (!confirm('Fermer TOUTES les positions dust ' + (botPrefix === 'bot' ? 'Bot 1' : 'Bot 2') + ' ?')) return;
  try {
    const res = await fetch('/' + botPrefix + '/dust/close-all', { method: 'POST' });
    const data = await res.json();
    if (data.ok) pollSuperBot();
    else alert('Erreur: ' + (data.error || 'unknown'));
  } catch (e) { alert('Erreur: ' + e.message); }
}

async function _sbPollStable(botPrefix, uiPrefix) {
  try {
    const res = await fetch('/' + botPrefix + '/stable-balances');
    const data = await res.json();
    const badge = document.getElementById(uiPrefix + 'StableDriftBadge');
    if (badge) {
      if (data.criticalDrift) { badge.className = 'dn-badge dn-warn'; badge.innerHTML = '&#x26A0;'; }
      else { badge.className = 'dn-badge dn-ok'; badge.innerHTML = '&#x2714;'; }
    }
    const container = document.getElementById(uiPrefix + 'StableBalancesContainer');
    if (!container) return;
    const b = data.balances;
    const tokens = ['usdc', 'usdt', 'usdh'];
    let html = '<div class="table-scroll"><table class="signals-table compact"><thead><tr><th>Token</th><th>Balance</th><th>Actuel %</th><th>Cible %</th><th>Drift</th></tr></thead><tbody>';
    for (const tk of tokens) {
      const bal = b[tk] || 0;
      const actualPct = (data.actual[tk] * 100).toFixed(1);
      const targetPct = ((data.targets[tk] || 0) * 100).toFixed(0);
      const driftPct = (data.drift[tk] * 100).toFixed(1);
      const driftAbs = Math.abs(data.drift[tk]);
      const driftColor = driftAbs > data.driftThreshold ? 'var(--accent-red)' : 'var(--accent-green)';
      html += `<tr><td style="font-weight:600;">${tk.toUpperCase()}</td><td>$${bal.toFixed(2)}</td><td>${actualPct}%</td><td>${targetPct}%</td><td style="color:${driftColor};font-weight:600;">${parseFloat(driftPct) > 0 ? '+' : ''}${driftPct}%</td></tr>`;
    }
    html += `<tr style="font-weight:bold;border-top:2px solid var(--border-primary);"><td>TOTAL</td><td>$${b.total.toFixed(2)}</td><td colspan="3"></td></tr>`;
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {}
}

async function sbTriggerStableRebalance(botPrefix) {
  const uiPrefix = _botPrefixToUiPrefix(botPrefix);
  const usdc = parseFloat(document.getElementById(uiPrefix + 'StableUsdc').value) / 100;
  const usdt = parseFloat(document.getElementById(uiPrefix + 'StableUsdt').value) / 100;
  const usdh = parseFloat(document.getElementById(uiPrefix + 'StableUsdh').value) / 100;
  const sum = usdc + usdt + usdh;
  if (sum < 0.95 || sum > 1.05) {
    alert('La somme des cibles doit faire 100% (actuellement ' + (sum * 100).toFixed(0) + '%)');
    return;
  }
  if (!confirm('Lancer le rebalance des stablecoins ?')) return;
  try {
    const res = await fetch('/' + botPrefix + '/stable-rebalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets: { usdc, usdt, usdh }, action: 'rebalance' })
    });
    const data = await res.json();
    if (data.ok) {
      alert('Rebalance OK');
      pollSuperBot();
    } else {
      alert('Erreur: ' + (data.error || 'unknown'));
    }
  } catch (e) { alert('Erreur: ' + e.message); }
}

function _initBotPanelStateListeners() {
  if (typeof BOT_PANEL_REGISTRY === 'undefined') return;
  for (const cfg of Object.values(BOT_PANEL_REGISTRY)) {
    const p = cfg.prefix;
    const bp = cfg.botPrefix;
    const stateAccordions = [
      { toggle: `${p}DnBalanceToggle`, panel: `${p}DnBalancePanel`, key: 'dnOpen', onOpen: () => _sbPollDn(bp, p) },
      { toggle: `${p}DustCleanerToggle`, panel: `${p}DustCleanerPanel`, key: 'dustOpen', onOpen: () => _sbPollDust(bp, p) },
      { toggle: `${p}StableRebalanceToggle`, panel: `${p}StableRebalancePanel`, key: 'stableOpen', onOpen: () => _sbPollStable(bp, p) },
    ];
    for (const acc of stateAccordions) {
      const toggle = document.getElementById(acc.toggle);
      if (toggle) {
        toggle.addEventListener('click', () => {
          const panel = document.getElementById(acc.panel);
          if (!panel) return;
          const opening = panel.style.display === 'none';
          if (_sbPanelState[p]) _sbPanelState[p][acc.key] = opening;
          if (opening && acc.onOpen) acc.onOpen();
        });
      }
    }
  }
}

setInterval(pollSuperBot, 4000);

function sbToggleTiers(botPrefix, uiPrefix, enabled) {
  fetch('/' + botPrefix + '/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tiersEnabled: enabled }),
  }).catch(e => console.error('sbToggleTiers error:', e));
}

function sbSetPairOverride(botPrefix, pairId, field, value) {
  const body = { pairId };
  body[field] = value === '' || value === null ? 0 : parseFloat(value);
  fetch('/' + botPrefix + '/pair-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(e => console.error('sbSetPairOverride error:', e));
}

async function applyGrowthFee2() {
  const input = document.getElementById('botGrowthFee2');
  const raw = input.value.trim().replace(',', '.');
  let override = null;
  if (raw !== '' && raw !== 'auto') {
    override = parseFloat(raw) / 100;
    if (isNaN(override) || override <= 0) return;
  }
  try {
    await fetch('/bot2/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ growthFeeOverride: override }),
    });
    pollBot2();
    pollFeeRates2();
  } catch (e) {}
}

function _loadSoundSettings2() {
  try {
    const raw = localStorage.getItem('hip3_sound_settings_bot2');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function _saveSoundSettings2(settings) {
  try { localStorage.setItem('hip3_sound_settings_bot2', JSON.stringify(settings)); } catch (e) {}
}

function getSoundSettings2() {
  const saved = _loadSoundSettings2();
  const defaults = { master: true, volume: 50, types: {} };
  for (const k of Object.keys(SOUND_TYPES)) defaults.types[k] = SOUND_TYPES[k].defaultOn;
  if (!saved) return defaults;
  return {
    master: saved.master !== undefined ? saved.master : defaults.master,
    volume: saved.volume !== undefined ? saved.volume : defaults.volume,
    types: { ...defaults.types, ...(saved.types || {}) },
  };
}

function toggleSoundSettings2() {
  const panel = document.getElementById('soundSettingsPanel2');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : '';
  if (!visible) renderSoundSettingsPanel2();
}

function renderSoundSettingsPanel2() {
  const settings = getSoundSettings2();
  const masterEl = document.getElementById('soundMasterToggle2');
  const volumeEl = document.getElementById('soundVolume2');
  const volumeLabel = document.getElementById('soundVolumeLabel2');
  if (masterEl) masterEl.checked = settings.master;
  if (volumeEl) volumeEl.value = settings.volume;
  if (volumeLabel) volumeLabel.textContent = settings.volume + '%';
  const grid = document.getElementById('soundTypesGrid2');
  if (!grid) return;
  grid.innerHTML = Object.entries(SOUND_TYPES).map(([key, cfg]) => {
    const checked = settings.types[key] ? 'checked' : '';
    return `<label class="sound-type-toggle">
      <input type="checkbox" data-sound-type="${key}" ${checked} onchange="updateSoundSettings2()">
      <span>${cfg.label}</span>
      <button class="sound-preview-btn" onclick="event.preventDefault();previewSound('${key}')">&#9654;</button>
    </label>`;
  }).join('');
}

function updateSoundSettings2() {
  const masterEl = document.getElementById('soundMasterToggle2');
  const volumeEl = document.getElementById('soundVolume2');
  const volumeLabel = document.getElementById('soundVolumeLabel2');
  const settings = {
    master: masterEl ? masterEl.checked : true,
    volume: volumeEl ? parseInt(volumeEl.value) : 50,
    types: {},
  };
  if (volumeLabel) volumeLabel.textContent = settings.volume + '%';
  document.querySelectorAll('#soundTypesGrid2 input[data-sound-type]').forEach(inp => {
    settings.types[inp.dataset.soundType] = inp.checked;
  });
  _saveSoundSettings2(settings);
}

let _dustPanelOpen2 = false;
async function pollDust2() {
  if (!_dustPanelOpen2) return;
  try {
    const res = await fetch('/bot2/dust');
    const data = await res.json();
    const badge = document.getElementById('dustCount2');
    if (badge) badge.textContent = (data.trades || []).length || '0';
    const info = document.getElementById('dustThresholdInfo2');
    if (info && data.thresholdUsd !== undefined) info.textContent = `Seuil: $${data.thresholdUsd.toFixed(2)} (${(data.dustFactor * 100).toFixed(0)}% de $${data.baseSize})`;
    const container = document.getElementById('dustTradesContainer2');
    if (!container) return;
    const closeAllBtn = document.getElementById('dustCloseAllBtn2');
    const trades = data.trades || [];
    if (closeAllBtn) closeAllBtn.style.display = trades.length > 0 ? '' : 'none';
    if (trades.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">Aucune position dust d\u00E9tect\u00E9e \u2714</div>';
      return;
    }
    let html = '<div class="table-scroll"><table class="signals-table compact"><thead><tr><th>ID</th><th>Paire</th><th>Dir</th><th>Coin A</th><th>Coin B</th><th>Notionnel A</th><th>Notionnel B</th><th>Moy.</th><th>Dur\u00E9e</th><th></th></tr></thead><tbody>';
    for (const t of trades) {
      const dur = fmtDuration(Date.now() - t.entryTs);
      const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
      html += `<tr>
        <td>${t.id}</td>
        <td class="pair-cell">${pairLabel}</td>
        <td><span class="tag ${t.direction === 1 ? 'dir1' : 'dir2'}">D${t.direction}</span></td>
        <td>${t.legACoin.split(':')[1]} (${t.legASide})</td>
        <td>${t.legBCoin.split(':')[1]} (${t.legBSide})</td>
        <td>$${t.notionalA.toFixed(2)}</td>
        <td>$${t.notionalB.toFixed(2)}</td>
        <td style="color:var(--accent-red);font-weight:600;">$${t.avgNotional.toFixed(2)}</td>
        <td>${dur}</td>
        <td><button class="btn-sm btn-danger" onclick="dustCloseTrade2(${t.id})">Close</button></td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {}
}

async function dustCloseTrade2(tradeId) {
  if (!confirm('Fermer cette position dust #' + tradeId + ' ?')) return;
  try {
    const res = await fetch('/bot2/dust/close/' + tradeId, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      pollDust2();
      pollBot2();
    } else {
      alert('Erreur: ' + (data.error || 'unknown'));
    }
  } catch (e) { alert('Erreur: ' + e.message); }
}

async function dustCloseAll2() {
  if (!confirm('Fermer TOUTES les positions dust Bot+ ?')) return;
  try {
    const res = await fetch('/bot2/dust/close-all', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      pollDust2();
      pollBot2();
    } else {
      alert('Erreur: ' + (data.error || 'unknown'));
    }
  } catch (e) { alert('Erreur: ' + e.message); }
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'dustCleanerToggle2' || e.target.closest('#dustCleanerToggle2')) {
    const panel = document.getElementById('dustCleanerPanel2');
    const arrow = e.target.closest('#dustCleanerToggle2')?.querySelector('.accordion-arrow') || document.getElementById('dustCleanerArrow2');
    _dustPanelOpen2 = panel.style.display === 'none';
    if (panel) panel.style.display = _dustPanelOpen2 ? '' : 'none';
    if (arrow) arrow.innerHTML = _dustPanelOpen2 ? '&#9660;' : '&#9654;';
    if (_dustPanelOpen2) pollDust2();
  }
});

setInterval(pollDust2, 10000);

let _stablePanelOpen2 = false;
async function pollStableBalances2() {
  if (!_stablePanelOpen2) return;
  try {
    const res = await fetch('/bot2/stable-balances');
    const data = await res.json();
    const badge = document.getElementById('stableDriftBadge2');
    if (badge) {
      if (data.criticalDrift) {
        badge.className = 'dn-badge dn-warn';
        badge.innerHTML = '&#x26A0;';
        badge.title = 'Drift critique: ' + (data.maxDrift * 100).toFixed(1) + '%';
      } else {
        badge.className = 'dn-badge dn-ok';
        badge.innerHTML = '&#x2714;';
        badge.title = 'Drift OK: ' + (data.maxDrift * 100).toFixed(1) + '%';
      }
    }
    const usdcIn = document.getElementById('stableTargetUsdc2');
    const usdtIn = document.getElementById('stableTargetUsdt2');
    const usdhIn = document.getElementById('stableTargetUsdh2');
    const driftIn = document.getElementById('stableDriftThreshold2');
    if (usdcIn && !usdcIn.matches(':focus')) usdcIn.value = Math.round((data.targets.usdc || 0) * 100);
    if (usdtIn && !usdtIn.matches(':focus')) usdtIn.value = Math.round((data.targets.usdt || 0) * 100);
    if (usdhIn && !usdhIn.matches(':focus')) usdhIn.value = Math.round((data.targets.usdh || 0) * 100);
    if (driftIn && !driftIn.matches(':focus')) driftIn.value = Math.round((data.driftThreshold || 0.1) * 100);

    const intraTimerEl2 = document.getElementById('intraTimerSlider2');
    const intraCooldownEl2 = document.getElementById('intraCooldownSlider2');
    if (data.intraRebalanceIntervalSec !== undefined) {
      if (intraTimerEl2 && !intraTimerEl2.matches(':active')) {
        intraTimerEl2.value = data.intraRebalanceIntervalSec;
        document.getElementById('intraTimerVal2').textContent = data.intraRebalanceIntervalSec + 's';
      }
    }
    if (data.intraRebalanceCooldownSec !== undefined) {
      if (intraCooldownEl2 && !intraCooldownEl2.matches(':active')) {
        intraCooldownEl2.value = data.intraRebalanceCooldownSec;
        document.getElementById('intraCooldownVal2').textContent = data.intraRebalanceCooldownSec + 's';
      }
    }

    const container = document.getElementById('stableBalancesContainer2');
    if (!container) return;
    const b = data.balances;
    const tokens = ['usdc', 'usdt', 'usdh'];
    let html = '<div class="table-scroll"><table class="signals-table compact"><thead><tr><th>Token</th><th>Balance</th><th>Actuel %</th><th>Cible %</th><th>Drift</th><th>Barre</th></tr></thead><tbody>';
    for (const tk of tokens) {
      const bal = b[tk] || 0;
      const actualPct = (data.actual[tk] * 100).toFixed(1);
      const targetPct = ((data.targets[tk] || 0) * 100).toFixed(0);
      const driftPct = (data.drift[tk] * 100).toFixed(1);
      const driftAbs = Math.abs(data.drift[tk]);
      const driftColor = driftAbs > data.driftThreshold ? 'var(--accent-red)' : driftAbs > data.driftThreshold * 0.5 ? 'var(--accent-amber)' : 'var(--accent-green)';
      const barW = Math.min(100, Math.max(0, data.actual[tk] * 100));
      const targetW = Math.min(100, Math.max(0, (data.targets[tk] || 0) * 100));
      html += '<tr>';
      html += '<td style="font-weight:600;">' + tk.toUpperCase() + '</td>';
      html += '<td>$' + bal.toFixed(2) + '</td>';
      html += '<td>' + actualPct + '%</td>';
      html += '<td>' + targetPct + '%</td>';
      html += '<td style="color:' + driftColor + ';font-weight:600;">' + (parseFloat(driftPct) > 0 ? '+' : '') + driftPct + '%</td>';
      html += '<td style="width:120px;">';
      html += '<div style="position:relative;height:14px;background:rgba(0,0,0,0.06);border-radius:7px;overflow:hidden;">';
      html += '<div style="position:absolute;left:0;top:0;height:100%;width:' + barW + '%;background:' + driftColor + ';border-radius:7px;opacity:0.6;transition:width 0.3s;"></div>';
      html += '<div style="position:absolute;left:' + targetW + '%;top:0;height:100%;width:2px;background:var(--text-primary);opacity:0.5;" title="Cible"></div>';
      html += '</div>';
      html += '</td>';
      html += '</tr>';
    }
    html += '<tr style="font-weight:bold;border-top:2px solid var(--border-primary);"><td>TOTAL</td><td>$' + b.total.toFixed(2) + '</td><td colspan="2"></td><td style="color:' + (data.criticalDrift ? 'var(--accent-red)' : 'var(--accent-green)') + ';">Max: ' + (data.maxDrift * 100).toFixed(1) + '%</td><td></td></tr>';
    html += '</tbody></table></div>';
    if (data.rebalancing) {
      html += '<div style="color:var(--accent-amber);font-size:11px;margin-top:6px;">&#x23F3; Rebalance en cours...</div>';
    }
    container.innerHTML = html;
  } catch (e) {}
}

async function applyStableTargets2() {
  const usdc = parseFloat(document.getElementById('stableTargetUsdc2').value) / 100;
  const usdt = parseFloat(document.getElementById('stableTargetUsdt2').value) / 100;
  const usdh = parseFloat(document.getElementById('stableTargetUsdh2').value) / 100;
  const drift = parseFloat(document.getElementById('stableDriftThreshold2').value) / 100;
  const sum = usdc + usdt + usdh;
  if (sum < 0.95 || sum > 1.05) {
    alert('La somme des cibles doit faire 100% (actuellement ' + (sum * 100).toFixed(0) + '%)');
    return;
  }
  const status = document.getElementById('stableRebalanceStatus2');
  try {
    const res = await fetch('/bot2/stable-rebalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets: { usdc, usdt, usdh }, driftThreshold: drift })
    });
    const data = await res.json();
    if (data.ok) {
      if (status) { status.textContent = '\u2714 Cibles mises \u00E0 jour'; status.style.color = 'var(--accent-green)'; }
      pollStableBalances2();
    } else {
      if (status) { status.textContent = '\u2718 ' + (data.error || 'Erreur'); status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 3000);
}

async function triggerStableRebalance2() {
  if (!confirm('Lancer le rebalance des stablecoins Bot+ maintenant ?')) return;
  const status = document.getElementById('stableRebalanceStatus2');
  if (status) { status.textContent = '\u23F3 Rebalance en cours...'; status.style.color = 'var(--accent-amber)'; }
  try {
    const res = await fetch('/bot2/stable-rebalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rebalance' })
    });
    const data = await res.json();
    if (data.ok) {
      const actCount = (data.actions || []).length;
      const filledCount = (data.actions || []).filter(a => a.status === 'filled').length;
      if (status) { status.textContent = '\u2714 ' + filledCount + '/' + actCount + ' actions remplies'; status.style.color = 'var(--accent-green)'; }
      setTimeout(pollStableBalances2, 3000);
    } else {
      if (status) { status.textContent = '\u2718 ' + (data.error || 'Erreur'); status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 5000);
}

async function applyIntraTimers2() {
  const interval = parseInt(document.getElementById('intraTimerSlider2').value);
  const cooldown = parseInt(document.getElementById('intraCooldownSlider2').value);
  const status = document.getElementById('intraTimerStatus2');
  try {
    const res = await fetch('/bot2/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intraRebalanceIntervalSec: interval, intraRebalanceCooldownSec: cooldown })
    });
    const data = await res.json();
    if (data.ok) {
      if (status) { status.textContent = '\u2714 Timers mis \u00E0 jour'; status.style.color = 'var(--accent-green)'; }
    } else {
      if (status) { status.textContent = '\u2718 Erreur'; status.style.color = 'var(--accent-red)'; }
    }
  } catch (e) {
    if (status) { status.textContent = '\u2718 ' + e.message; status.style.color = 'var(--accent-red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 3000);
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'stableRebalanceToggle2' || e.target.closest('#stableRebalanceToggle2')) {
    const panel = document.getElementById('stableRebalancePanel2');
    const arrow = e.target.closest('#stableRebalanceToggle2')?.querySelector('.accordion-arrow') || document.getElementById('stableRebalanceArrow2');
    _stablePanelOpen2 = panel.style.display === 'none';
    if (panel) panel.style.display = _stablePanelOpen2 ? '' : 'none';
    if (arrow) arrow.innerHTML = _stablePanelOpen2 ? '&#9660;' : '&#9654;';
    if (_stablePanelOpen2) pollStableBalances2();
  }
});

setInterval(pollStableBalances2, 15000);

let _dnBalanceOpen2 = false;
async function pollDnStatus2() {
  if (currentView !== 'bot2') return;
  if (!_dnBalanceOpen2) return;
  try {
    const res = await fetch('/bot2/dn-status');
    const data = await res.json();
    const badge = document.getElementById('dnStatusBadge2');
    const container = document.getElementById('dnStatusContainer2');
    if (!badge || !container) return;

    if (data.status === 'critical') {
      badge.className = 'dn-badge dn-critical';
      badge.innerHTML = '&#x26A0; CRITICAL';
    } else if (data.status === 'warning') {
      badge.className = 'dn-badge dn-warning';
      badge.innerHTML = '&#x26A0; WARNING';
    } else {
      badge.className = 'dn-badge dn-ok';
      badge.innerHTML = '&#x2714; OK';
    }

    const compactEl = document.getElementById('dnCompactSummary2');
    const tradeCount = (data.trades || []).length;
    const imbalanceCount = (data.trades || []).filter(t => t.level !== 'ok').length;
    const corrCount = (data.aggregate && data.aggregate.corrections) ? data.aggregate.corrections.length : 0;
    if (compactEl) {
      compactEl.textContent = `${tradeCount} checked, ${imbalanceCount} imbalance${imbalanceCount !== 1 ? 's' : ''}, ${corrCount} correction${corrCount !== 1 ? 's' : ''}`;
    }

    if (!data.trades || data.trades.length === 0) {
      const lastStr = data.lastCheck ? new Date(data.lastCheck).toLocaleTimeString() : '--';
      container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:8px;">Aucune position ouverte \u00E0 v\u00E9rifier. Dernier check: ${lastStr}</div>`;
    } else {
      const lastStr = data.lastCheck ? new Date(data.lastCheck).toLocaleTimeString() : '--';
      let html = `<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">Dernier check: ${lastStr}</div>`;
      for (const t of data.trades) {
        const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
        const ratioColor = t.level === 'critical' ? '#ef4444' : t.level === 'warning' ? '#f59e0b' : '#10b981';
        const fillWidth = Math.max(0, Math.min(100, t.ratioPct));
        html += `<div class="dn-trade-row">
          <span style="min-width:30px;font-weight:600;">#${t.tradeId}</span>
          <span style="min-width:100px;">${pairLabel}</span>
          <span style="min-width:55px;color:${ratioColor};font-weight:600;">${t.ratioPct}%</span>
          <span class="dn-ratio-bar"><span class="dn-ratio-fill" style="width:${fillWidth}%;background:${ratioColor};"></span></span>
          <span style="color:var(--text-muted);font-size:0.7rem;">A: $${t.notionalA.toFixed(2)} | B: $${t.notionalB.toFixed(2)}</span>
        </div>`;
      }
      container.innerHTML = html;
    }

    const aggBadge = document.getElementById('dnAggBadge2');
    const aggContainer = document.getElementById('dnAggContainer2');
    const aggCorrContainer = document.getElementById('dnAggCorrectionsContainer2');
    const agg = data.aggregate;

    if (aggBadge && agg) {
      if (agg.status === 'critical') {
        aggBadge.className = 'dn-badge dn-critical';
        aggBadge.innerHTML = '&#x26A0; CRITICAL';
      } else if (agg.status === 'warning') {
        aggBadge.className = 'dn-badge dn-warning';
        aggBadge.innerHTML = '&#x26A0; WARNING';
      } else {
        aggBadge.className = 'dn-badge dn-ok';
        aggBadge.innerHTML = '&#x2714; OK';
      }
    }

    if (aggContainer && agg) {
      const coins = agg.coins || [];
      if (coins.length === 0) {
        aggContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:8px;">Aucune exposition agr\u00E9g\u00E9e d\u00E9tect\u00E9e.</div>';
      } else {
        let aggHtml = '<div class="table-scroll"><table class="signals-table compact" style="font-size:0.72rem;"><thead><tr><th>Coin</th><th>Long ($)</th><th>Short ($)</th><th>Net ($)</th><th>Ratio</th><th>Status</th></tr></thead><tbody>';
        for (const c of coins) {
          const statusColor = c.status === 'critical' ? '#ef4444' : c.status === 'warning' ? '#f59e0b' : '#10b981';
          const statusLabel = c.status === 'critical' ? 'CRITICAL' : c.status === 'warning' ? 'WARNING' : 'OK';
          const closingTag = c.isClosing ? ' <span style="font-size:9px;color:#f59e0b;">(closing)</span>' : '';
          aggHtml += `<tr>
            <td style="font-weight:600;">${c.symbol}${closingTag}</td>
            <td>$${c.totalLong.toFixed(2)}</td>
            <td>$${c.totalShort.toFixed(2)}</td>
            <td style="color:${c.net > 1 ? '#f59e0b' : 'var(--text-secondary)'};">$${c.net.toFixed(2)}</td>
            <td style="color:${statusColor};font-weight:600;">${c.ratio.toFixed(1)}%</td>
            <td><span style="color:${statusColor};font-weight:600;font-size:0.68rem;">${statusLabel}</span></td>
          </tr>`;
        }
        aggHtml += '</tbody></table></div>';
        aggContainer.innerHTML = aggHtml;
      }
    }

    if (aggCorrContainer && agg) {
      const corrections = agg.corrections || [];
      if (corrections.length === 0) {
        aggCorrContainer.innerHTML = '';
      } else {
        let corrHtml = '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">Corrections r\u00E9centes</div>';
        corrHtml += '<div class="table-scroll"><table class="signals-table compact" style="font-size:0.68rem;"><thead><tr><th>Heure</th><th>Coin</th><th>Action</th><th>Size</th><th>Co\u00FBt ($)</th><th>Status</th></tr></thead><tbody>';
        for (const cr of corrections) {
          const timeStr = new Date(cr.ts).toLocaleTimeString();
          const costStr = cr.costUsd !== undefined ? '$' + cr.costUsd.toFixed(4) : '-';
          const statusColor = cr.status === 'filled' ? '#10b981' : '#ef4444';
          corrHtml += `<tr>
            <td>${timeStr}</td>
            <td>${cr.symbol} <span style="color:var(--text-muted);font-size:9px;">(${cr.deployer})</span></td>
            <td style="font-weight:600;">${cr.action.toUpperCase()}</td>
            <td>${cr.size}</td>
            <td>${costStr}</td>
            <td style="color:${statusColor};font-weight:600;">${cr.status}</td>
          </tr>`;
        }
        corrHtml += '</tbody></table></div>';
        aggCorrContainer.innerHTML = corrHtml;
      }
    }
  } catch (e) {}
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'dnBalanceToggle2' || e.target.closest('#dnBalanceToggle2')) {
    _dnBalanceOpen2 = !_dnBalanceOpen2;
    const panel = document.getElementById('dnBalancePanel2');
    const arrow = document.getElementById('dnBalanceArrow2');
    if (panel) panel.style.display = _dnBalanceOpen2 ? '' : 'none';
    if (arrow) arrow.innerHTML = _dnBalanceOpen2 ? '&#9660;' : '&#9654;';
    if (_dnBalanceOpen2) pollDnStatus2();
  }
});

setInterval(pollDnStatus2, 10000);

async function fetchFeeDrift2() {
  try {
    const res = await fetch('/bot2/fee-drift');
    const data = await res.json();
    const summary = data.summary;

    const alertBanner = document.getElementById('feeDriftAlertBanner2');
    if (alertBanner) {
      if (summary.alert) {
        alertBanner.style.display = 'block';
        alertBanner.innerHTML = `\u26A0\uFE0F Fee drift alert: avg drift = <strong>${summary.avgDriftBps} bps</strong> (threshold: 0.5 bps)`;
        alertBanner.className = 'fee-drift-alert ' + (summary.avgDriftBps > 0 ? 'drift-over' : 'drift-under');
      } else {
        alertBanner.style.display = 'none';
      }
    }

    const summaryEl = document.getElementById('feeDriftSummary2');
    if (summaryEl) {
      const driftCls = Math.abs(summary.avgDriftBps) > 0.5 ? (summary.avgDriftBps > 0 ? 'negative' : 'positive') : '';
      summaryEl.innerHTML = `
        <div class="bot-summary-card">
          <div class="bot-card-label">Fees Attendus</div>
          <div class="bot-card-value">$${summary.totalExpected}</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Fees R\u00E9alis\u00E9s</div>
          <div class="bot-card-value">$${summary.totalRealized}</div>
        </div>
        <div class="bot-summary-card ${driftCls ? 'lose' : ''}">
          <div class="bot-card-label">Drift Moyen</div>
          <div class="bot-card-value ${driftCls}">${summary.avgDriftBps} bps</div>
        </div>
      `;
    }

    const dailyBody = document.getElementById('feeDriftDailyBody2');
    if (dailyBody) {
      if (data.daily.length === 0) {
        dailyBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      } else {
        dailyBody.innerHTML = data.daily.map(d => {
          const drift = parseFloat(d.driftUsd);
          const driftClass = Math.abs(drift) < 0.001 ? '' : (drift > 0 ? 'negative' : 'positive');
          return `<tr>
            <td>${d.day}</td>
            <td>${d.trades}</td>
            <td>$${d.totalExpected.toFixed(4)}</td>
            <td>$${d.totalRealized.toFixed(4)}</td>
            <td class="${driftClass}">${drift >= 0 ? '+' : ''}$${drift.toFixed(4)}</td>
          </tr>`;
        }).join('');
      }
    }

    const tradesBody = document.getElementById('feeDriftTradesBody2');
    if (tradesBody) {
      if (data.trades.length === 0) {
        tradesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      } else {
        tradesBody.innerHTML = data.trades.map(t => {
          const drift = parseFloat(t.driftUsd);
          const driftClass = Math.abs(drift) < 0.0001 ? '' : (drift > 0 ? 'negative' : 'positive');
          const bpsDriftClass = Math.abs(t.driftBps) > 0.5 ? (t.driftBps > 0 ? 'negative' : 'positive') : '';
          const pairLabel = (pairsList.find(p => p.id === t.pair) || {}).label || t.pair;
          return `<tr>
            <td>${t.id}</td>
            <td class="pair-cell">${pairLabel}</td>
            <td><span class="tag ${t.dir == 1 ? 'dir1' : 'dir2'}">D${t.dir}</span></td>
            <td>$${t.expected}</td>
            <td>$${t.realized}</td>
            <td class="${driftClass}">${drift >= 0 ? '+' : ''}$${drift.toFixed(4)}</td>
            <td class="${bpsDriftClass}">${t.driftBps >= 0 ? '+' : ''}${t.driftBps} bps</td>
          </tr>`;
        }).join('');
      }
    }
  } catch (e) {
    console.error('[FeeDrift2] Error:', e);
  }
}

async function fetchPoolRanking2() {
  try {
    const res = await fetch('/bot2/pool-ranking');
    const data = await res.json();
    const body = document.getElementById('poolRankingBody2');
    if (!body) return;

    if (!data.pools || data.pools.length === 0) {
      body.innerHTML = '<tr><td colspan="14" style="text-align:center;color:var(--text-muted);">Aucune donn\u00E9e</td></tr>';
      return;
    }

    body.innerHTML = data.pools.map((p, i) => {
      const pairLabel = (pairsList.find(pr => pr.id === p.pairId) || {}).label || p.pairId;
      const netCls = p.pnlNet >= 0 ? 'positive' : 'negative';
      const pvCls = p.pnlPerVolBps >= 0 ? 'positive' : 'negative';
      const scoreCls = p.score > 0 ? 'positive' : p.score < 0 ? 'negative' : '';
      const medal = i === 0 ? '\uD83E\uDD47 ' : i === 1 ? '\uD83E\uDD48 ' : i === 2 ? '\uD83E\uDD49 ' : '';
      return `<tr>
        <td>${medal}${i + 1}</td>
        <td class="pair-cell">${pairLabel}</td>
        <td class="${scoreCls}" style="font-weight:700;">${p.score.toFixed(3)}</td>
        <td>${p.closedTrades}/${p.totalTrades}</td>
        <td>${p.winRate}%</td>
        <td class="${netCls}">${p.pnlNet >= 0 ? '+' : ''}$${p.pnlNet.toFixed(4)}</td>
        <td class="${pvCls}">${p.pnlPerVolBps.toFixed(2)}</td>
        <td>${p.fillRate}%</td>
        <td>${fmtDuration(p.avgHoldMs)}</td>
        <td>${fmtDuration(p.medianHoldMs)}</td>
        <td>${fmtDuration(p.p90HoldMs)}</td>
        <td>$${p.volume.toFixed(0)}</td>
        <td>$${p.fees.toFixed(4)}</td>
        <td>${p.errors}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('[PoolRanking2] Error:', e);
  }
}

async function fetchErrorsTable2() {
  try {
    const errorType = document.getElementById('errorsTypeFilter2')?.value || '';
    const timeRange = parseInt(document.getElementById('errorsTimeRange2')?.value || '0');
    const fromTs = timeRange > 0 ? Date.now() - timeRange : 0;
    const url = `/bot2/errors-table?from=${fromTs}&to=${Date.now()}&limit=100${errorType ? '&errorType=' + errorType : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    renderErrorsTable2(data);
  } catch (e) {}
}

function renderErrorsTable2(data) {
  const groupCards = document.getElementById('errorsGroupCards2');
  const body = document.getElementById('errorsTableBody2');
  if (!body) return;

  const rootCauseLabels = {
    orphan: 'Orphan', orphan_closed: 'Orphan', closed_orphan: 'Orphan',
    slippage_guard: 'Slippage', both_failed: 'Both Failed',
    error: 'Erreur', timeout: 'Timeout', margin: 'Margin',
  };
  const rootCauseColors = {
    orphan: '#f59e0b', slippage_guard: '#ef4444', both_failed: '#dc2626',
    error: '#ef4444', timeout: '#8b5cf6', margin: '#ec4899',
  };

  if (groupCards && data.groups) {
    if (data.groups.length === 0) {
      groupCards.innerHTML = '';
    } else {
      groupCards.innerHTML = `
        <div class="bot-summary-card">
          <div class="bot-card-label">Total Erreurs</div>
          <div class="bot-card-value negative">${data.totalErrors}</div>
        </div>
        <div class="bot-summary-card">
          <div class="bot-card-label">Co\u00FBt Total</div>
          <div class="bot-card-value negative">$${data.totalCost.toFixed(4)}</div>
        </div>
      ` + data.groups.map(g => {
        const label = rootCauseLabels[g.errorType] || g.errorType;
        return `<div class="bot-summary-card">
          <div class="bot-card-label">${label}</div>
          <div class="bot-card-value">${g.count} <span style="font-size:0.65rem;color:var(--text-muted);">(-$${g.totalCost.toFixed(2)})</span></div>
        </div>`;
      }).join('');
    }
  }

  if (!data.trades || data.trades.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Aucune erreur</td></tr>';
    return;
  }

  body.innerHTML = data.trades.map(t => {
    const pairLabel = (pairsList.find(p => p.id === t.pairId) || {}).label || t.pairId;
    const dirTag = t.direction === 1
      ? '<span class="dir-badge dir-d1">\u2212</span>'
      : '<span class="dir-badge dir-d2">+</span>';
    const causeLabel = rootCauseLabels[t.rootCause] || t.rootCause;
    const causeColor = rootCauseColors[t.rootCause] || 'var(--text-muted)';
    const reason = t.errorMsg ? (t.errorMsg.length > 60 ? t.errorMsg.slice(0, 60) + '...' : t.errorMsg) : '-';
    const costCls = t.errorCost > 0 ? 'negative' : '';
    return `<tr>
      <td>${t.id}</td>
      <td>${new Date(t.entryTs).toLocaleString()}</td>
      <td class="pair-cell">${pairLabel}</td>
      <td>${dirTag}</td>
      <td><span class="trade-status status-error">${t.status}</span></td>
      <td style="color:${causeColor};font-weight:600;">${causeLabel}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(t.errorMsg || '').replace(/"/g, '&quot;')}">${reason}</td>
      <td>${t.slippage ? t.slippage.toFixed(2) + ' bps' : '-'}</td>
      <td class="${costCls}">${t.errorCost > 0 ? '-$' + t.errorCost.toFixed(4) : '$0'}</td>
    </tr>`;
  }).join('');
}

async function fetchAllocationAdvisor2() {
  try {
    const capital = document.getElementById('allocCapital2')?.value || 1000;
    const leverage = document.getElementById('allocLeverage2')?.value || 5;
    const risk = document.getElementById('allocRisk2')?.value || 'normal';
    const res = await fetch(`/bot2/capital-allocation?capital=${capital}&leverage=${leverage}&risk=${risk}`);
    const data = await res.json();
    const summary = document.getElementById('allocAdvisorSummary2');
    const body = document.getElementById('allocAdvisorBody2');
    if (!body) return;

    if (data.message || !data.allocations || data.allocations.length === 0) {
      if (summary) summary.innerHTML = '';
      body.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">${data.message || 'Aucune donn\u00E9e'}</td></tr>`;
      return;
    }

    const riskLabels = { aggressive: 'Agressif', normal: 'Normal', conservative: 'Conservateur' };
    if (summary) {
      summary.innerHTML = `
        <div class="bot-summary-card"><div class="bot-card-label">Capital</div><div class="bot-card-value">$${parseFloat(data.totalCapital).toLocaleString()}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Max Levier</div><div class="bot-card-value">${data.maxLeverage}x</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Notionnel Max</div><div class="bot-card-value highlight">$${parseFloat(data.maxNotional).toLocaleString()}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Risque</div><div class="bot-card-value">${riskLabels[data.riskPref] || data.riskPref}</div></div>
        <div class="bot-summary-card"><div class="bot-card-label">Paires</div><div class="bot-card-value">${data.allocations.length}</div></div>`;
    }

    body.innerHTML = data.allocations.map((a, i) => {
      const pairLabel = (pairsList.find(pr => pr.id === a.pairId) || {}).label || a.pairId;
      const netCls = a.pnlNet >= 0 ? 'positive' : 'negative';
      const pvCls = a.pnlPerVolBps >= 0 ? 'positive' : 'negative';
      const scoreCls = a.score > 0 ? 'positive' : a.score < 0 ? 'negative' : '';
      const errCls = a.errorRate > 15 ? 'negative' : a.errorRate > 5 ? '' : 'positive';
      const pctBar = `<div style="display:flex;align-items:center;gap:6px;"><span>${a.allocationPct.toFixed(1)}%</span><div style="width:60px;height:6px;background:var(--border-primary);border-radius:3px;overflow:hidden;"><div style="width:${Math.min(a.allocationPct, 100)}%;height:100%;background:linear-gradient(90deg,var(--accent-gold),var(--accent-amber));border-radius:3px;"></div></div></div>`;
      return `<tr>
        <td>${i + 1}</td>
        <td class="pair-cell">${pairLabel}</td>
        <td>${pctBar}</td>
        <td style="font-weight:700;">$${a.allocationUsd.toFixed(0)}</td>
        <td class="${scoreCls}">${a.score.toFixed(3)}</td>
        <td>${a.winRate.toFixed(1)}%</td>
        <td class="${errCls}">${a.errorRate.toFixed(1)}%</td>
        <td class="${netCls}">${a.pnlNet >= 0 ? '+' : ''}$${a.pnlNet.toFixed(4)}</td>
        <td class="${pvCls}">${a.pnlPerVolBps.toFixed(2)}</td>
        <td>${a.closedTrades}</td>
        <td style="font-size:0.65rem;font-family:'Inter',sans-serif;white-space:normal;max-width:180px;">${a.reasons.join(', ')}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('[AllocationAdvisor2] Error:', e);
  }
}

let _sseSource2 = null;
let _sseReconnectTimer2 = null;

function _connectSSE2() {
  if (!bot2Available) return;
  if (_sseSource2) {
    try { _sseSource2.close(); } catch (e) {}
  }
  try {
    _sseSource2 = new EventSource('/bot2/events');

    _sseSource2.onopen = function() {
      if (_sseReconnectTimer2) { clearTimeout(_sseReconnectTimer2); _sseReconnectTimer2 = null; }
    };

    _sseSource2.onmessage = function(ev) {
      try {
        const event = JSON.parse(ev.data);
        _handleSSEEvent2(event);
      } catch (e) {}
    };

    _sseSource2.onerror = function() {
      try { _sseSource2.close(); } catch (e) {}
      _sseSource2 = null;
      if (!_sseReconnectTimer2) {
        _sseReconnectTimer2 = setTimeout(_connectSSE2, 5000);
      }
    };
  } catch (e) {
    if (!_sseReconnectTimer2) {
      _sseReconnectTimer2 = setTimeout(_connectSSE2, 5000);
    }
  }
}

function _handleSSEEvent2(event) {
  if (!event || !event.type) return;
  if (event.type === 'ENTRY_FILLED') {
    const s2 = getSoundSettings2();
    if (s2.master && s2.types.fill !== false) playAlertSound('fill');
    pollBot2Activity();
    pollBot2Trades();
    pollBot2();
  }
  if (event.type === 'ENTRY_FAILED') {
    pollBot2Activity();
    pollBot2();
  }
  if (event.type === 'CLOSE_FILLED') {
    pollBot2Activity();
    pollBot2Trades();
    pollBot2();
    pollBot2PairStats();
  }
  if (event.type === 'CLOSE_FAILED') {
    pollBot2Activity();
    pollBot2Trades();
    pollBot2();
  }
}

setTimeout(_connectSSE2, 2000);

let _lastTierData = {};
function _renderPairTiersTable(tiers, config, bodyId, idSuffix, totalBalance) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const sfx = idSuffix || '';
  if (!tiers || tiers.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);font-size:11px;padding:10px;">En attente de donn\u00E9es...</td></tr>';
    return;
  }
  if (config) {
    const ids = [
      ['tierThreshAllIn' + sfx, config.thresholds.allIn],
      ['tierThreshNormal' + sfx, config.thresholds.normal],
      ['tierMarginNormal' + sfx, config.marginPct.normal],
      ['tierMarginPrudent' + sfx, config.marginPct.prudent],
    ];
    for (const [id, val] of ids) {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = val;
    }
  }
  const balInfoId = bodyId === 'pairTiersBody' ? 'tierBalanceInfo' : 'tierBalanceInfo2';
  const balEl = document.getElementById(balInfoId);
  if (balEl && totalBalance != null) {
    balEl.textContent = 'Balance: $' + totalBalance.toFixed(2);
  }
  let html = '';
  for (const t of tiers) {
    const tierColor = t.tier === 'all-in' ? '#22c55e' : t.tier === 'normal' ? '#c6940a' : t.tier === 'prudent' ? '#ef4444' : 'var(--text-muted)';
    const tierLabel = t.tier === 'all-in' ? 'ALL-IN' : t.tier === 'normal' ? 'NORMAL' : t.tier === 'prudent' ? 'PRUDENT' : '?';
    const corrDisplay = t.correlation !== null ? (t.correlation * 100).toFixed(2) + '%' : '--';
    const isAllIn = t.tier === 'all-in';
    const limitDisplay = isAllIn ? '\u221E' : (t.marginPct != null ? t.marginPct + '%' : '--');
    const usedDisplay = (t.currentMarginPct != null ? t.currentMarginPct.toFixed(1) + '%' : '0%');
    const fillPct = isAllIn ? (t.currentOpen > 0 ? 100 : 0) : (t.marginPct > 0 ? Math.min(100, (t.currentMarginPct / t.marginPct) * 100) : 0);
    const fillColor = isAllIn ? '#22c55e' : (fillPct >= 90 ? '#ef4444' : fillPct >= 60 ? '#c6940a' : '#22c55e');
    const prevTier = _lastTierData[t.pairId];
    const changed = prevTier && prevTier !== t.tier;
    const flashClass = changed ? ' style="animation:tierFlash 1s ease-out;"' : '';
    const fillLabel = isAllIn ? '\u221E' : (t.currentMarginPct != null ? t.currentMarginPct.toFixed(1) : '0') + '/' + (t.marginPct || '?') + '%';
    html += `<tr${flashClass}>
      <td style="font-size:11px;font-weight:600;">${t.label || t.pairId}</td>
      <td style="font-size:11px;color:${tierColor};font-weight:600;">${corrDisplay}</td>
      <td><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;background:${tierColor};">${tierLabel}</span></td>
      <td style="font-size:11px;text-align:center;color:${isAllIn ? '#22c55e' : 'var(--text-primary)'};">${limitDisplay}</td>
      <td style="font-size:11px;text-align:center;">${usedDisplay}</td>
      <td style="min-width:60px;">
        <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:12px;overflow:hidden;position:relative;">
          <div style="width:${fillPct}%;height:100%;background:${fillColor};border-radius:4px;transition:width 0.5s;"></div>
          <span style="position:absolute;top:0;left:50%;transform:translateX(-50%);font-size:9px;color:var(--text-primary);line-height:12px;">${fillLabel}</span>
        </div>
      </td>
    </tr>`;
    _lastTierData[t.pairId] = t.tier;
  }
  body.innerHTML = html;
}

async function pollPairTiers(botPrefix, bodyId, idSuffix) {
  try {
    const res = await fetch('/' + botPrefix + '/pair-tiers');
    if (!res.ok) return;
    const data = await res.json();
    const tiers = data.tiers || [];
    const returnedPairIds = new Set(tiers.map(t => t.pairId));
    const allBadges = document.querySelectorAll(`[id^="${idSuffix}Tier_"]`);
    for (const badge of allBadges) {
      const pid = badge.id.replace(idSuffix + 'Tier_', '');
      if (!returnedPairIds.has(pid)) {
        badge.style.background = 'var(--text-muted)';
        badge.textContent = '';
        badge.title = '';
      }
    }
    for (const t of tiers) {
      const badge = document.getElementById(idSuffix + 'Tier_' + t.pairId);
      if (badge) {
        const tierColor = t.tier === 'all-in' ? '#22c55e' : t.tier === 'normal' ? '#c6940a' : t.tier === 'prudent' ? '#ef4444' : 'var(--text-muted)';
        const tierLabel = t.tier === 'all-in' ? 'A' : t.tier === 'normal' ? 'N' : t.tier === 'prudent' ? 'P' : '?';
        badge.style.background = tierColor;
        badge.textContent = tierLabel;
        badge.title = `${t.tier} | rho=${t.correlation !== null ? (t.correlation * 100).toFixed(1) + '%' : '?'} | ${t.currentMarginPct != null ? t.currentMarginPct.toFixed(1) : '0'}/${t.marginPct || '?'}%`;
      }
      _lastTierData[t.pairId] = t.tier;
    }
  } catch (e) {}
}

function _applyTierConfig(botPrefix, idSuffix, bodyId) {
  const s = idSuffix;
  const thresholds = {
    allIn: parseFloat(document.getElementById('tierThreshAllIn' + s).value),
    normal: parseFloat(document.getElementById('tierThreshNormal' + s).value),
  };
  const marginPct = {
    normal: parseFloat(document.getElementById('tierMarginNormal' + s).value),
    prudent: parseFloat(document.getElementById('tierMarginPrudent' + s).value),
  };
  fetch('/' + botPrefix + '/pair-tiers/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thresholds, marginPct }),
  }).then(r => r.json()).then(d => {
    if (d.ok) _renderPairTiersTable(d.tiers, d.config, bodyId, s, d.totalBalance);
  }).catch(e => console.error('applyTierConfig error:', e));
}

function _resetTierConfig(botPrefix, bodyId, idSuffix) {
  fetch('/' + botPrefix + '/pair-tiers/reset', { method: 'POST' })
    .then(r => r.json()).then(d => {
      if (d.ok) _renderPairTiersTable(d.tiers, d.config, bodyId, idSuffix, d.totalBalance);
    }).catch(e => console.error('resetTierConfig error:', e));
}

document.addEventListener('DOMContentLoaded', () => {
  const btn1 = document.getElementById('tierApplyBtn');
  if (btn1) btn1.addEventListener('click', () => _applyTierConfig('bot', '', 'pairTiersBody'));
  const btn2 = document.getElementById('tierApplyBtn2');
  if (btn2) btn2.addEventListener('click', () => _applyTierConfig('bot2', '2', 'pairTiersBody2'));
  const rst1 = document.getElementById('tierResetBtn');
  if (rst1) rst1.addEventListener('click', () => _resetTierConfig('bot', 'pairTiersBody', ''));
  const rst2 = document.getElementById('tierResetBtn2');
  if (rst2) rst2.addEventListener('click', () => _resetTierConfig('bot2', 'pairTiersBody2', '2'));
});




async function pollSbStats(num) {
  if (currentView !== 'sbstats1') return;
  pollPairAnalytics();
}

async function pollPairAnalytics() {
  if (currentView !== 'sbstats1') return;
  try {
    const data = await fetch('/supervisor/pair-analytics').then(r => r.json());
    const dirLabel = d => d === 1 ? 'D1' : 'D2';
    const fmtPnl = v => {
      const cls = v >= 0 ? 'positive' : 'negative';
      return `<span class="${cls}">$${v.toFixed(2)}</span>`;
    };

    const pnlBody = document.getElementById('pairTopPnlBody');
    if (pnlBody && data.topPnlPairs) {
      if (data.topPnlPairs.length === 0) {
        pnlBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
      } else {
        pnlBody.innerHTML = data.topPnlPairs.map(p =>
          `<tr><td class="pair-cell">${p.pairId}</td><td>${dirLabel(p.direction)}</td><td>${fmtPnl(p.totalPnl)}</td><td>${p.tradeCount}</td><td>${p.winRate}%</td></tr>`
        ).join('');
      }
    }

    const volBody = document.getElementById('pairTopVolumeBody');
    if (volBody && data.topVolumePairs) {
      if (data.topVolumePairs.length === 0) {
        volBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
      } else {
        volBody.innerHTML = data.topVolumePairs.map(p =>
          `<tr><td class="pair-cell">${p.pairId}</td><td>${dirLabel(p.direction)}</td><td>$${p.totalVolume.toFixed(2)}</td><td>${p.tradeCount}</td></tr>`
        ).join('');
      }
    }

    const failBody = document.getElementById('pairMostFailedBody');
    if (failBody && data.mostFailedPairs) {
      if (data.mostFailedPairs.length === 0) {
        failBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
      } else {
        failBody.innerHTML = data.mostFailedPairs.map(p =>
          `<tr><td class="pair-cell">${p.pairId}</td><td>${dirLabel(p.direction)}</td><td class="negative">${p.errorCount}</td><td>${p.errorRate}%</td><td>${p.tradeCount}</td></tr>`
        ).join('');
      }
    }

    const slipBody = document.getElementById('pairWorstSlippageBody');
    if (slipBody && data.worstSlippagePairs) {
      if (data.worstSlippagePairs.length === 0) {
        slipBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No data</td></tr>';
      } else {
        slipBody.innerHTML = data.worstSlippagePairs.map(p =>
          `<tr><td class="pair-cell">${p.pairId}</td><td>${dirLabel(p.direction)}</td><td>${p.avgSlippageBps.toFixed(2)}</td><td>${p.maxSlippageBps.toFixed(2)}</td><td>${p.tradeCount}</td></tr>`
        ).join('');
      }
    }
  } catch (e) { console.error('pollPairAnalytics error:', e); }
}

setInterval(pollPairAnalytics, 15000);

async function fetchSbAllocation(num, profile) {
  const prefix = 'sbs' + num;
  try {
    const [a1, a2] = await Promise.all([
      fetch('/bot/capital-allocation?profile=' + profile).then(r => r.json()).catch(() => null),
      bot2Available ? fetch('/bot2/capital-allocation?profile=' + profile).then(r => r.json()).catch(() => null) : null,
    ]);
    const allocMap = {};
    const addAlloc = (src) => {
      if (!src?.allocations) return;
      for (const a of src.allocations) {
        if (!allocMap[a.pair]) allocMap[a.pair] = { pct: 0, size: 0, reason: a.reason || '' };
        allocMap[a.pair].pct += a.pct || 0;
        allocMap[a.pair].size += a.sizeUsd || 0;
      }
    };
    addAlloc(a1); addAlloc(a2);
    const body = document.getElementById(prefix + 'AllocBody');
    if (body) {
      body.innerHTML = Object.entries(allocMap).sort((a, b) => b[1].pct - a[1].pct).map(([pair, d]) =>
        `<tr><td>${pair}</td><td>${d.pct.toFixed(1)}%</td><td>$${d.size.toFixed(0)}</td><td style="font-size:10px;">${d.reason}</td></tr>`
      ).join('');
    }
  } catch (e) { console.error(e); }
}

async function showPairFeesModal(botPrefix) {
  try {
    const r = await fetch('/' + botPrefix + '/pair-fees-detail');
    const data = await r.json();
    if (!data.pairs) return;
    const rows = data.pairs.map(p => {
      const gA = p.growthA ? '<span style="color:#4ecb71;">&#x2713;</span>' : '<span style="color:#e74c3c;">&#x2717;</span>';
      const gB = p.growthB ? '<span style="color:#4ecb71;">&#x2713;</span>' : '<span style="color:#e74c3c;">&#x2717;</span>';
      return `<tr><td>${p.pairId}</td><td>${p.deployerA} ${gA}</td><td>${p.deployerB} ${gB}</td><td>${p.feeA.toFixed(2)}</td><td>${p.feeB.toFixed(2)}</td><td style="font-weight:700;">${p.feeRT.toFixed(2)}</td></tr>`;
    }).join('');
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="glass-card" style="max-width:700px;max-height:80vh;overflow-y:auto;margin:auto;padding:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;">Frais Taker par Paire (${botPrefix})</h3>
        <button class="btn btn-stop btn-sm" onclick="this.closest('.modal-overlay').remove()">&#x2715;</button>
      </div>
      <p style="color:var(--text-muted);font-size:11px;margin-bottom:10px;">&#x2713; = Growth Mode actif (frais réduits) | &#x2717; = Pas de Growth Mode</p>
      <table class="signals-table compact"><thead><tr><th>Pair</th><th>Deployer A</th><th>Deployer B</th><th>Fee A (bps)</th><th>Fee B (bps)</th><th>RT (bps)</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
    document.body.appendChild(modal);
  } catch (e) { console.error(e); }
}

async function refreshPairsList() {
  try {
    const res = await fetch('/pairs');
    if (res.ok) pairsList = await res.json();
  } catch (e) {}
}

(function initTooltips() {
  const tooltipMap = {
    'p50-mode-btn': {
      'zscore': 'Z-Score statique: (spread - moyenne) / écart-type sur fenêtre glissante',
      'ou': 'Ornstein-Uhlenbeck: modèle stochastique de retour à la moyenne',
      'kalman': 'Filtre de Kalman: estimation bayésienne adaptative du spread',
      'ewma': 'EWMA: croisement moyenne rapide(12) / lente(26) du spread',
    },
    'close-strat-btn': {
      'volume': 'TP = frais RT aller-retour (growth-aware)',
      'be': 'TP = frais RT + slippage réel d\'entrée',
      'beplus': 'TP = frais RT + slippage custom (configurable)',
    },
    'close-mode-btn': {
      'passive': 'Attend que le spread revienne naturellement au TP',
      'aggressive': 'Force la fermeture dès que le TP est atteint',
    },
  };
  function applyTooltips() {
    for (const [cls, modes] of Object.entries(tooltipMap)) {
      document.querySelectorAll('.' + cls).forEach(btn => {
        const mode = btn.dataset.mode || btn.dataset.strategy;
        if (mode && modes[mode] && !btn.classList.contains('has-tooltip')) {
          btn.classList.add('has-tooltip');
          btn.setAttribute('data-tooltip', modes[mode]);
        }
      });
    }
    document.querySelectorAll('[id$="ZMeanRevert"]').forEach(el => {
      const label = el.closest('label');
      if (label && !label.classList.contains('has-tooltip')) {
        label.classList.add('has-tooltip');
        label.setAttribute('data-tooltip', 'Attend que le Z-Score revienne à 0 avant de fermer');
      }
    });
    document.querySelectorAll('[id*="dirSplitToggle"]').forEach(el => {
      const label = el.closest('label');
      if (label && !label.classList.contains('has-tooltip')) {
        label.classList.add('has-tooltip');
        label.setAttribute('data-tooltip', 'Route D1→Bot1, D2→Bot2 pour isoler les directions');
      }
    });
  }
  setTimeout(applyTooltips, 1000);
  setTimeout(applyTooltips, 5000);
})();

let _farmingPollTimer = null;
async function pollFarmingData() {
  if (currentView !== 'farming') return;
  try {
    const [metricsRes, optimizerRes] = await Promise.all([
      fetch('/bot/farming-metrics'),
      fetch('/bot/farming-optimizer')
    ]);
    const metricsData = await metricsRes.json();
    const optimizerData = await optimizerRes.json();
    _renderFarmingMetrics(metricsData);
    _renderFarmingOptimizer(optimizerData);
    _renderFarmingRegimes(optimizerData.regimeSummary || {});
    const lastCal = document.getElementById('farmLastCalibrated');
    if (lastCal && optimizerData.lastCalibrated) {
      lastCal.textContent = 'Last calibrated: ' + new Date(optimizerData.lastCalibrated).toLocaleTimeString();
    }
  } catch (e) {
    console.error('pollFarmingData error:', e);
  }
  clearTimeout(_farmingPollTimer);
  _farmingPollTimer = setTimeout(pollFarmingData, 30000);
}

function _renderFarmingRegimes(summary) {
  const el = document.getElementById('farmRegimePills');
  if (!el) return;
  const calm = summary.calm || 0;
  const active = summary.active || 0;
  const explosive = summary.explosive || 0;
  el.innerHTML = `
    <span style="background:#22c55e22;color:#22c55e;padding:2px 8px;border-radius:8px;font-size:0.65rem;font-weight:600;">Calm: ${calm}</span>
    <span style="background:#f59e0b22;color:#f59e0b;padding:2px 8px;border-radius:8px;font-size:0.65rem;font-weight:600;">Active: ${active}</span>
    <span style="background:#ef444422;color:#ef4444;padding:2px 8px;border-radius:8px;font-size:0.65rem;font-weight:600;">Explosive: ${explosive}</span>
  `;
}

function _renderFarmingMetrics(data) {
  const body = document.getElementById('farmMetricsBody');
  if (!body) return;
  const pairs = data.pairs || {};
  const pairIds = Object.keys(pairs).sort();
  if (pairIds.length === 0) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">No farming data yet</td></tr>';
    return;
  }
  body.innerHTML = pairIds.map(pid => {
    const m = pairs[pid] || {};
    const regime = m.regime || {};
    const regimeLabel = regime.regime || '?';
    const regimeColor = regimeLabel === 'calm' ? '#22c55e' : regimeLabel === 'active' ? '#f59e0b' : regimeLabel === 'explosive' ? '#ef4444' : 'var(--text-muted)';
    const d1 = m.d1 || {};
    const d2 = m.d2 || {};
    const tefVal = (d1.tef || 0) + (d2.tef || 0);
    const tef = tefVal > 0 ? tefVal.toFixed(1) : ((d1.crossingsPerHour || 0) + (d2.crossingsPerHour || 0)).toFixed(1);
    const vwedVal = (d1.vwed || 0) + (d2.vwed || 0);
    const vwed = vwedVal !== 0 ? vwedVal.toFixed(2) : '--';
    const netCap = m.netCaptureBps != null ? m.netCaptureBps.toFixed(2) : '--';
    const netCapColor = parseFloat(netCap) >= 0 ? '#10b981' : '#ef4444';
    const slip = m.slippage ? m.slippage.avgBps.toFixed(1) : '--';
    const ass = m.adverseSelection ? m.adverseSelection.score.toFixed(3) : '--';
    const assColor = parseFloat(ass) < 0 ? '#ef4444' : '#10b981';
    const survD1 = d1.survivalRate != null ? d1.survivalRate : null;
    const survD2 = d2.survivalRate != null ? d2.survivalRate : null;
    const survAvg = survD1 != null && survD2 != null ? (survD1 + survD2) / 2 : (survD1 || survD2);
    const survival = survAvg != null ? (survAvg * 100).toFixed(0) + '%' : '--';
    const ctr = m.capitalTurnover != null ? m.capitalTurnover.toFixed(3) : '--';
    const atoRec = m.atoRecommendation ? m.atoRecommendation.threshold.toFixed(1) : '--';
    const pairLabel = (pairsList.find(p => p.id === pid) || {}).label || pid;
    return `<tr>
      <td class="pair-cell">${pairLabel}</td>
      <td><span style="color:${regimeColor};font-weight:600;font-size:0.7rem;">${regimeLabel}</span></td>
      <td>${tef}</td>
      <td>${vwed}</td>
      <td style="color:${netCapColor}">${netCap}</td>
      <td>${slip}</td>
      <td style="color:${assColor}">${ass}</td>
      <td>${survival}</td>
      <td>${ctr}</td>
      <td style="font-weight:600;">${atoRec}</td>
    </tr>`;
  }).join('');
}

function _renderFarmingOptimizer(data) {
  const body = document.getElementById('farmAtoBody');
  if (!body) return;
  const optimizer = data.optimizer || {};
  const pairIds = Object.keys(optimizer).sort();
  if (pairIds.length === 0) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No ATO data — waiting for calibration</td></tr>';
    return;
  }
  body.innerHTML = pairIds.map(pid => {
    const ato = optimizer[pid] || {};
    const opt = ato.optimal || {};
    const gr = ato.guardRails || {};
    const pairLabel = (pairsList.find(p => p.id === pid) || {}).label || pid;
    const current = ato.current != null ? ato.current.toFixed(1) : '--';
    const optimal = opt.threshold != null ? opt.threshold.toFixed(1) : '--';
    const expectedNet = opt.expectedNet != null ? opt.expectedNet.toFixed(3) : '--';
    const guardMin = gr.min != null ? gr.min.toFixed(1) : '--';
    const guardMax = gr.max != null ? gr.max.toFixed(1) : '--';
    const confidence = ato.confidence || '--';
    const confColor = confidence === 'high' ? '#22c55e' : confidence === 'medium' ? '#f59e0b' : confidence === 'low' ? '#ef4444' : 'inherit';
    const isBetter = opt.threshold != null && ato.current != null && opt.threshold !== ato.current;
    return `<tr>
      <td class="pair-cell">${pairLabel}</td>
      <td>${current}</td>
      <td style="${isBetter ? 'font-weight:700;color:#f59e0b;' : ''}">${optimal}</td>
      <td>${expectedNet}</td>
      <td>${guardMin}</td>
      <td>${guardMax}</td>
      <td style="color:${confColor};font-weight:600;">${confidence}</td>
    </tr>`;
  }).join('');
}

async function toggleFarmingATO(enabled) {
  try {
    await fetch('/bot/farming-optimizer/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
  } catch (e) {
    console.error('toggleFarmingATO error:', e);
  }
}

async function applyFarmingATO() {
  try {
    const res = await fetch('/bot/farming-optimizer/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applyAll: true })
    });
    const data = await res.json();
    if (data.ok) {
      alert('Applied ATO thresholds to ' + data.count + ' pairs');
      pollFarmingData();
    }
  } catch (e) {
    console.error('applyFarmingATO error:', e);
  }
}


