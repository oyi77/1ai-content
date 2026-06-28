module.exports = {
  apps: [{
    name: "vilonacontentbot",
    script: "node_modules/.bin/tsx",
    args: "src/index.ts",
    cwd: "/home/openclaw/projects/1ai-content",
    interpreter: "none",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '10000',
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000,
    error_file: "/home/openclaw/.pm2/logs/vilonacontentbot-error.log",
    out_file: "/home/openclaw/.pm2/logs/vilonacontentbot-out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    env: {
      NODE_ENV: "production",
      PORT: "3002",
      WEBHOOK_URL: "https://content.aitradepulse.com",
      PUBLIC_URL: "https://content.aitradepulse.com",
    }
  }]
};
