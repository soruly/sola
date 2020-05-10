module.exports = {
  apps: [
    {
      name: "sola-watch",
      script: "src/watch.js",
      instances: 1,
      autorestart: true,
      watch: false,
      exec_mode: "fork",
    },
    {
      name: "sola-load",
      script: "src/load-hash.js",
      instances: 1,
      autorestart: true,
      watch: false,
      exec_mode: "fork",
    },
    {
      name: "sola-hash",
      script: "src/hash-video.js",
      instances: 1,
      autorestart: true,
      watch: false,
      exec_mode: "fork",
    },
  ],
};
