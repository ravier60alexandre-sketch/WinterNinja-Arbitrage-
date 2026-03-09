// PM2 Ecosystem Configuration
// Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'hip3-monitor',
      script: 'start.js',
      cwd: __dirname,
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
