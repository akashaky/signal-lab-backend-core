module.exports = {
  apps: [
    {
      name: "signal-lab-backend-core",
      script: "web/index.js",
      instances: "1",
      exec_mode: "fork",
    },
  ],
};
