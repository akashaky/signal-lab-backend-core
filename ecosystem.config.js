module.exports = {
  apps: [
    {
      name: "Main backend",
      script: "web/index.js",
      instances: "2",
      exec_mode: "cluster",
    },
  ],
};
