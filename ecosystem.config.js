/**
 * PM2 ecosystem config — use this when running directly on a VPS (no Docker).
 *
 * Install PM2:    npm install -g pm2
 * Create logs:    sudo mkdir -p /var/log/madarik && sudo chown $USER /var/log/madarik
 * Start:          pm2 start ecosystem.config.js
 * Auto-restart:   pm2 save && pm2 startup
 * Logs:           pm2 logs madarik
 * Monitor:        pm2 monit
 */
module.exports = {
  apps: [
    {
      name:         'madarik',
      script:       'server/index.js',
      cwd:          __dirname,
      instances:    1,           // SQLite doesn't support multiple writers — keep 1
      exec_mode:    'fork',
      watch:        false,       // never watch in production
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV:  'production',
        PORT:      3000,
      },

      // Graceful shutdown
      kill_timeout:    5000,
      wait_ready:      false,
      listen_timeout:  10000,

      // Log files
      out_file:        '/var/log/madarik/out.log',
      error_file:      '/var/log/madarik/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Auto-restart on crash, not on normal exit
      autorestart:     true,
      restart_delay:   3000,
      max_restarts:    10,
    }
  ]
};
