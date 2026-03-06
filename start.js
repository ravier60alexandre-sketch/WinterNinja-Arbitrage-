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

  // Start collector
  const collector = require('./collector');
  await collector.start(config);

  // Start Next.js dashboard
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
    if (line) console.log(`[DASHBOARD] ${line}`);
  });

  dashboard.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line && !line.includes('ExperimentalWarning')) {
      console.error(`[DASHBOARD] ${line}`);
    }
  });

  dashboard.on('close', (code) => {
    console.log(`[DASHBOARD] Exited with code ${code}`);
  });

  console.log(`[INFO] Dashboard available at http://localhost:${port}`);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[INFO] Shutting down...');
    collector.stop();
    dashboard.kill('SIGTERM');
    setTimeout(() => process.exit(0), 2000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
