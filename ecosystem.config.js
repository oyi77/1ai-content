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
      PORT: 3000
    }
  },
  {
    name: "vidbee",
    script: "python3",
    args: "-m uvicorn services.vidbee.service:app --host 0.0.0.0 --port 8772",
    cwd: "/home/openclaw/projects/1ai-content",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 5000,
    env: {
      PYTHONUNBUFFERED: '1'
    }
  },
  {
    name: "vimax",
    script: "python3",
    args: "-m uvicorn services.vimax.service:app --host 0.0.0.0 --port 8770",
    cwd: "/home/openclaw/projects/1ai-content",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 5000,
    env: {
      PYTHONUNBUFFERED: '1'
    }
  }]
};
