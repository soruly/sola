const child_process = require("child_process");
const mysql = require("promise-mysql");
const amqp = require("amqplib");

const {
  anime_path, hash_path,
  solr_endpoint, solr_core,
  amqp_server, amqp_hash_queue, amqp_load_queue,
  mariadb_host, mariadb_user, mariadb_pass, mariadb_db
} = require("../config");

(async () => {
  console.log("Connecting to mariadb");
  const pool = await mysql.createPool({
    host: mariadb_host,
    user: mariadb_user,
    password: mariadb_pass,
    database: mariadb_db,
    connectionLimit: 10
  });

  // console.log("Creating file table if not exist");
  await pool.query(`CREATE TABLE IF NOT EXISTS files (
            path varchar(768) COLLATE utf8mb4_unicode_ci NOT NULL,
            status enum('NEW','HASHING','HASHED','LOADING','LOADED') COLLATE utf8mb4_unicode_ci NOT NULL,
            PRIMARY KEY (path)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  console.log(`Scanning ${anime_path}`);
  const concurrency = 50;
  const args = process.argv[2] ? `-mmin -${process.argv[2]}` : "";
  await child_process.execSync(`find -L ${anime_path} -type f -name "*.mp4" ${args}`).toString()
    .split("\n")
    .filter((each) => each)
    .map((filePath) => filePath.replace(anime_path, ""))
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
      const connection = await amqp.connect(amqp_server);
      const channel = await connection.createChannel();
      await channel.assertQueue(amqp_hash_queue, {durable: false});
      console.log(`Submiting ${amqp_hash_queue} job for ${filePath}`);
      await channel.sendToQueue(amqp_hash_queue, Buffer.from(JSON.stringify({
        anime_path,
        hash_path,
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
      const connection = await amqp.connect(amqp_server);
      const channel = await connection.createChannel();
      await channel.assertQueue(amqp_load_queue, {durable: false});
      console.log(`Submiting ${amqp_load_queue} job for ${filePath}`);
      await channel.sendToQueue(amqp_load_queue, Buffer.from(JSON.stringify({
        anime_path,
        hash_path,
        file: filePath,
        solr_endpoint,
        solr_core
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
