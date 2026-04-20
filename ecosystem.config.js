module.exports = {
  apps: [
    {
      name: "Main backend",
      script: "index.js",
      instances: "2",
      exec_mode: "cluster",
    },
  ],
};
