module.exports = {
  apps: [
    {
      name: "Main backend",
      script: "web/index.js",
      instances: "1",
      exec_mode: "fork",
    },
  ],
};
