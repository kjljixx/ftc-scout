module.exports = {
  apps: [
    {
      name: "server-prod",
      script: "pm2-run.cjs",
      args: "server:start",
      autorestart: true,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "web-prod",
      script: "pm2-run.cjs",
      args: ["web:start"],
      autorestart: true,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "timestamper",
      script: "worker.py",
      cwd: "packages/timestamper",
      interpreter: "python",
      autorestart: true,
      env: {
        PYTHONUNBUFFERED: "1"
      }
    }
  ]
};
