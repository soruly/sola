require("dotenv").config();
const mysql = require("promise-mysql");
const amqp = require("amqplib");
const {hash} = require("./lib/hash");

const {
  SOLA_SOLR_URL, SOLA_SOLR_CORE,
  SOLA_MQ_URL, SOLA_MQ_HASH, SOLA_MQ_LOAD,
  SOLA_DB_HOST, SOLA_DB_USER, SOLA_DB_PWD, SOLA_DB_NAME
} = process.env;

(async () => {
  console.log("Connecting to mariadb");
  const conn = await mysql.createConnection({
    host: SOLA_DB_HOST,
    user: SOLA_DB_USER,
    password: SOLA_DB_PWD,
    database: SOLA_DB_NAME
  });

  console.log("Connecting to amqp server");
  const connection = await amqp.connect(SOLA_MQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(SOLA_MQ_HASH, {durable: false});
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${SOLA_MQ_HASH}. To exit press CTRL+C`);
  channel.consume(SOLA_MQ_HASH, async (msg) => {
    const {anime_path, hash_path, file} = JSON.parse(msg.content.toString());
    console.log(`Received ${SOLA_MQ_HASH} job for ${file}`);
    await conn.beginTransaction();
    const result = await conn.query(mysql.format("SELECT status FROM files WHERE path=?", [file]));
    if (result[0].status === "NEW") {
      await conn.query(mysql.format("UPDATE files SET status='HASHING' WHERE path=?", [file]));
      conn.commit();
      await hash(anime_path, hash_path, file);
      await conn.query(mysql.format("UPDATE files SET status='HASHED' WHERE path=?", [file]));
    } else {
      console.log(`File status is [${result[0].status}] , skip`);
    }
    await channel.ack(msg);
    console.log(`Completed ${SOLA_MQ_HASH} job for ${file}`);
    await channel.assertQueue(SOLA_MQ_LOAD, {durable: false});
    console.log(`Submiting ${SOLA_MQ_LOAD} job for ${file}`);
    await channel.sendToQueue(SOLA_MQ_LOAD, Buffer.from(JSON.stringify({
      anime_path,
      hash_path,
      file,
      SOLA_SOLR_URL,
      SOLA_SOLR_CORE
    })), {persistent: false});
    await new Promise((resolve) => {
      setTimeout(resolve, 200); // let the bullets fly awhile
    });
  }, {noAck: false});
})();
