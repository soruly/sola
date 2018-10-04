require("dotenv").config();
const child_process = require("child_process");
const mysql = require("promise-mysql");
const amqp = require("amqplib");

const {
  SOLA_FILE_PATH, SOLA_HASH_PATH,
  SOLA_SOLR_URL, SOLA_SOLR_CORE,
  SOLA_MQ_URL, SOLA_MQ_HASH, SOLA_MQ_LOAD,
  SOLA_DB_HOST, SOLA_DB_USER, SOLA_DB_PWD, SOLA_DB_NAME
} = process.env;

(async () => {
  console.log("Connecting to mariadb");
  const pool = await mysql.createPool({
    host: SOLA_DB_HOST,
    user: SOLA_DB_USER,
    password: SOLA_DB_PWD,
    database: SOLA_DB_NAME,
    connectionLimit: 10
  });

  // console.log("Creating file table if not exist");
  await pool.query(`CREATE TABLE IF NOT EXISTS files (
            path varchar(768) COLLATE utf8mb4_unicode_ci NOT NULL,
            status enum('NEW','HASHING','HASHED','LOADING','LOADED') COLLATE utf8mb4_unicode_ci NOT NULL,
            PRIMARY KEY (path)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  console.log(`Scanning ${SOLA_FILE_PATH}`);
  const concurrency = 50;
  const args = process.argv[2] ? `-mmin -${process.argv[2]}` : "";
  await child_process.execSync(`find -L ${SOLA_FILE_PATH} -type f -name "*.mp4" ${args}`).toString()
    .split("\n")
    .filter((each) => each)
    .map((filePath) => filePath.replace(SOLA_FILE_PATH, ""))
    .reduce((list, term, index) => {
      const i = Math.floor(index / concurrency);
      const j = index % concurrency;
      if (!list[i]) {
        list[i] = [];
      }
      list[i][j] = term;
      return list;
    }, [])
    .reduce(
      (chain, group) => chain.then(() =>
        Promise.all(group.map((filePath) => pool.query(mysql.format(
          "INSERT IGNORE INTO files (path, status) VALUES (?, ?);",
          [
            filePath,
            "NEW"
          ]
        ))))), Promise.resolve());

  console.log("Looking for new files from database");
  const newFiles = await pool.query("SELECT path FROM files WHERE status='NEW'");
  console.log("Sending out hash jobs for new files");
  await Promise.all(newFiles.map((each) => each.path)
    .map((filePath) => new Promise(async (resolve) => {
      const connection = await amqp.connect(SOLA_MQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(SOLA_MQ_HASH, {durable: false});
      console.log(`Submiting ${SOLA_MQ_HASH} job for ${filePath}`);
      await channel.sendToQueue(SOLA_MQ_HASH, Buffer.from(JSON.stringify({
        SOLA_FILE_PATH,
        SOLA_HASH_PATH,
        file: filePath
      })), {persistent: false});
      await new Promise((res) => {
        setTimeout(res, 50);
      });
      await connection.close();
      resolve();
    })));


  console.log("Looking for new hashed files from database");
  const newHash = await pool.query("SELECT path FROM files WHERE status='HASHED'");
  console.log("Sending out load jobs for new hashes");
  await Promise.all(newHash.map((each) => each.path)
    .map((filePath) => new Promise(async (resolve) => {
      const connection = await amqp.connect(SOLA_MQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(SOLA_MQ_LOAD, {durable: false});
      console.log(`Submiting ${SOLA_MQ_LOAD} job for ${filePath}`);
      await channel.sendToQueue(SOLA_MQ_LOAD, Buffer.from(JSON.stringify({
        SOLA_FILE_PATH,
        SOLA_HASH_PATH,
        file: filePath,
        SOLA_SOLR_URL,
        SOLA_SOLR_CORE
      })), {persistent: false});
      await new Promise((res) => {
        setTimeout(res, 50);
      });
      await connection.close();
      resolve();
    })));
  pool.end();

  console.log("Completed");
})();
