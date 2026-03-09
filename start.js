const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Validate config
function loadConfig() {
  const configPath = path.resolve(__dirname, 'config.json');

  if (!fs.existsSync(configPath)) {
    console.error('[ERROR] config.json not found. Please create it from the template.');
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`[ERROR] Invalid config.json: ${err.message}`);
    process.exit(1);
  }

  if (!config.pairs || !Array.isArray(config.pairs) || config.pairs.length === 0) {
    console.error('[ERROR] config.json must contain a non-empty "pairs" array.');
    process.exit(1);
  }

  for (const pair of config.pairs) {
    if (!pair.asset_a || !pair.asset_b || !pair.label) {
      console.error(`[ERROR] Each pair must have asset_a, asset_b, and label. Invalid pair: ${JSON.stringify(pair)}`);
      process.exit(1);
    }
  }

  console.log('[CONFIG] Loaded configuration with', config.pairs.length, 'pairs');
  return config;
}

async function main() {
  const config = loadConfig();

  // Ensure data directory exists
  const dataDir = path.resolve(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ── Start collector (spread WebSocket) ──
  const collector = require('./collector');
  await collector.start(config);

  // ── Start Python bot engine (FastAPI on port 8000) ──
  const backendDir = path.resolve(__dirname, 'backend');
  const envFile = path.resolve(__dirname, '.env');
  let botEngine = null;

  if (fs.existsSync(backendDir) && fs.existsSync(path.resolve(backendDir, 'main.py'))) {
    // Load .env file into environment for the Python process
    const backendEnv = { ...process.env };
    if (fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            backendEnv[key] = val;
          }
        }
      }
    }

    botEngine = spawn('python3', ['-u', 'main.py'], {
      cwd: backendDir,
      stdio: 'pipe',
      env: backendEnv,
    });

    botEngine.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[BOT-ENGINE] ${line}`);
    });

    botEngine.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.error(`[BOT-ENGINE] ${line}`);
    });

    botEngine.on('close', (code) => {
      console.log(`[BOT-ENGINE] Exited with code ${code}`);
    });

    console.log('[INFO] Bot engine (FastAPI) starting on http://localhost:8000');
  } else {
    console.log('[WARN] backend/main.py not found — bot engine disabled');
  }

  // ── Start old Next.js dashboard (Spread Analyzer standalone) ──
  const dashboardDir = path.resolve(__dirname, 'dashboard');
  const port = config.dashboard_port || 3000;

  const nextBin = path.resolve(__dirname, 'node_modules', '.bin', 'next');
  const dashboard = spawn(nextBin, ['dev', '-H', '0.0.0.0', '-p', String(port)], {
    cwd: dashboardDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development'
    }
  });

  dashboard.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[DASHBOARD-OLD] ${line}`);
  });

  dashboard.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line && !line.includes('ExperimentalWarning')) {
      console.error(`[DASHBOARD-OLD] ${line}`);
    }
  });

  dashboard.on('close', (code) => {
    console.log(`[DASHBOARD-OLD] Exited with code ${code}`);
  });

  console.log(`[INFO] Old dashboard available at http://localhost:${port}`);

  // ── Start HyperArbitrage HIP-3 frontend (port 3001) ──
  const hyperFrontendDir = path.resolve(__dirname, 'HyperArbitrage-HIP3-XYZ', 'frontend');
  const hyperPort = config.hyper_dashboard_port || 3001;
  let hyperDashboard = null;

  const hyperNextBin = path.resolve(hyperFrontendDir, 'node_modules', '.bin', 'next');
  if (fs.existsSync(hyperFrontendDir) && fs.existsSync(hyperNextBin)) {
    hyperDashboard = spawn(hyperNextBin, ['dev', '-H', '0.0.0.0', '-p', String(hyperPort)], {
      cwd: hyperFrontendDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: String(hyperPort),
        NODE_ENV: 'development'
      }
    });

    hyperDashboard.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[HYPER-DASHBOARD] ${line}`);
    });

    hyperDashboard.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line && !line.includes('ExperimentalWarning')) {
        console.error(`[HYPER-DASHBOARD] ${line}`);
      }
    });

    hyperDashboard.on('close', (code) => {
      console.log(`[HYPER-DASHBOARD] Exited with code ${code}`);
    });

    console.log(`[INFO] HyperArbitrage dashboard at http://localhost:${hyperPort}`);
  } else {
    console.log('[WARN] HyperArbitrage frontend not found — skipping');
  }

  // ── Graceful shutdown ──
  const shutdown = () => {
    console.log('\n[INFO] Shutting down...');
    collector.stop();
    if (botEngine) botEngine.kill('SIGTERM');
    dashboard.kill('SIGTERM');
    if (hyperDashboard) hyperDashboard.kill('SIGTERM');
    setTimeout(() => process.exit(0), 3000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
