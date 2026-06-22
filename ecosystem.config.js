module.exports = {
  apps: [{
    name: '1ai-content-bot',
    script: 'npx',
    args: 'tsx src/index.ts',
    cwd: '/home/openclaw/projects/1ai-content',
    env_file: '.env',
    env: {
      NODE_ENV: 'development',
      ADMIN_PASSWORD: 'admin123456',
      JWT_SECRET: 'this-is-a-32-char-jwt-secret-key'
    },
    max_restarts: 3,
    restart_delay: 5000,
    error_file: '/tmp/1ai-content-bot-error.log',
    out_file: '/tmp/1ai-content-bot-out.log'
  }]
};
