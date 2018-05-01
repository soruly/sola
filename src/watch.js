const fs = require("fs-extra");
const mysql = require("promise-mysql");
const amqp = require("amqplib");
const chokidar = require("chokidar");

const {
  anime_path, hash_path,
  amqp_server, amqp_hash_queue,
  mariadb_host, mariadb_user, mariadb_pass, mariadb_db
} = require("../config");

(async () => {
  console.log("Connecting to mariadb");
  const conn = await mysql.createConnection({
    host: mariadb_host,
    user: mariadb_user,
    password: mariadb_pass,
    database: mariadb_db
  });

  console.log("Watching folders for new files");
  chokidar.watch([anime_path], {
    persistent: true,
    ignored: "*.txt",
    ignoreInitial: true,
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 100
    },
    atomic: true // or a custom 'atomicity delay', in milliseconds (default 100)
  }).on("add", async (filePath) => {
    console.log(`New file detected ${filePath}`);
    if (!fs.existsSync(filePath)) {
      return;
    }
    const relativePath = filePath.replace(anime_path, "");
    console.log("Adding new file to database");
    await conn.query(mysql.format("INSERT IGNORE INTO files (path, status) VALUES (?, 'NEW');", [relativePath]));

    console.log("Sending out hash jobs for new file");
    const connection = await amqp.connect(amqp_server);
    const channel = await connection.createChannel();
    await channel.assertQueue(amqp_hash_queue, {durable: false});
    console.log(`Submiting ${amqp_hash_queue} job for ${relativePath}`);
    await channel.sendToQueue(amqp_hash_queue, Buffer.from(JSON.stringify({
      anime_path,
      hash_path,
      file: relativePath
    })), {persistent: false});
    await new Promise((res) => {
      setTimeout(res, 50);
    });
    await connection.close();
  });
})();
