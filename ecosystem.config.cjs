module.exports = {
  apps: [
    {
      name: "common-watch",
      script: "pm2-run.cjs",
      args: "common:watch",
      autorestart: true,
      env: {
        NODE_ENV: "development"
      }
    },
    {
      name: "server-watch",
      script: "pm2-run.cjs",
      args: "server:watch",
      autorestart: true,
      env: {
        NODE_ENV: "development"
      }
    },
    {
      name: "server-dev",
      script: "pm2-run.cjs",
      args: "server:dev",
      autorestart: true,
      env: {
        NODE_ENV: "development"
      }
    },
    {
      name: "web-dev",
      script: "pm2-run.cjs",
      args: ["web:start"],
      autorestart: true,
      env: {
        NODE_ENV: "development"
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
