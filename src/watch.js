require("dotenv").config();
const fs = require("fs-extra");
const mysql = require("promise-mysql");
const amqp = require("amqplib");
const chokidar = require("chokidar");

const {
  SOLA_FILE_PATH, SOLA_HASH_PATH,
  SOLA_MQ_URL, SOLA_MQ_HASH,
  SOLA_DB_HOST, SOLA_DB_PORT, SOLA_DB_USER, SOLA_DB_PWD, SOLA_DB_NAME
} = process.env;

(async () => {
  console.log("Connecting to mariadb");
  const conn = await mysql.createConnection({
    host: SOLA_DB_HOST,
    port: SOLA_DB_PORT,
    user: SOLA_DB_USER,
    password: SOLA_DB_PWD,
    database: SOLA_DB_NAME
  });

  console.log("Watching folders for new files");
  chokidar.watch([SOLA_FILE_PATH], {
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
    const relativePath = filePath.replace(SOLA_FILE_PATH, "");
    console.log("Adding new file to database");
    await conn.query(mysql.format("INSERT IGNORE INTO files (path, status) VALUES (?, 'NEW');", [relativePath]));

    console.log("Sending out hash jobs for new file");
    const connection = await amqp.connect(SOLA_MQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(SOLA_MQ_HASH, {durable: false});
    console.log(`Submiting ${SOLA_MQ_HASH} job for ${relativePath}`);
    await channel.sendToQueue(SOLA_MQ_HASH, Buffer.from(JSON.stringify({
      SOLA_FILE_PATH,
      SOLA_HASH_PATH,
      file: relativePath
    })), {persistent: false});
    await new Promise((res) => {
      setTimeout(res, 50);
    });
    await connection.close();
  });
})();
