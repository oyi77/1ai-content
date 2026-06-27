module.exports = {
  apps : [{
    name: "berkahkarya-saas-bot",
    script: "npx",
    args: "tsx src/index.ts",
    cwd: "/home/openclaw/projects/1ai-content",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '120s',
    max_restarts: 3,
    restart_delay: 10000,
    kill_timeout: 15000,
    env: {
      NODE_ENV: 'production',
      WEBHOOK_URL: 'https://content.aitradepulse.com',
      PUBLIC_URL: 'https://content.aitradepulse.com',
      PORT: 3002
    }
  }]
};
