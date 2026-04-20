module.exports = {
  apps: [
    {
      name: "Main backend",
      script: "web/index.js",
      instances: "max",
      exec_mode: "fork",
    },
  ],
};
