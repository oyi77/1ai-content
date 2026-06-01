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
    env: {
      NODE_ENV: 'production'
    }
  }]
};
