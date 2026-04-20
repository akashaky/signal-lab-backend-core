module.exports = {
  apps: [
    {
      name: "Main backend",
      instances: "2",
      exec_mode: "cluster",
    },
  ],
};
