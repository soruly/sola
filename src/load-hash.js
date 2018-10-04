require("dotenv").config();
const mysql = require("promise-mysql");
const amqp = require("amqplib");
const fetch = require("node-fetch");
const {URLSearchParams} = require("url");
const {load} = require("./lib/load");
const {
  SOLA_MQ_URL, SOLA_MQ_LOAD,
  SOLA_DB_HOST, SOLA_DB_USER, SOLA_DB_PWD, SOLA_DB_NAME,
  SOLA_DISCORD_URL, SOLA_TELEGRAM_ID, SOLA_TELEGRAM_URL
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
  await channel.assertQueue(SOLA_MQ_LOAD, {durable: false});
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${SOLA_MQ_LOAD}. To exit press CTRL+C`);
  channel.consume(SOLA_MQ_LOAD, async (msg) => {
    const {SOLA_HASH_PATH, file, solr_endpoint, solr_core} = JSON.parse(msg.content.toString());
    console.log(`Received ${SOLA_MQ_LOAD} job for ${file}`);
    await conn.beginTransaction();
    const result = await conn.query(mysql.format("SELECT status FROM files WHERE path=?", [file]));
    if (result[0].status === "HASHED") {
      await conn.query(mysql.format("UPDATE files SET status='LOADING' WHERE path=?", [file]));
      conn.commit();
      try {
        await load(SOLA_HASH_PATH, file, solr_endpoint, solr_core);
      } catch (e) {
        await conn.query(mysql.format("UPDATE files SET status='HASHED' WHERE path=?", [file]));
        return;
      }
      await conn.query(mysql.format("UPDATE files SET status='LOADED' WHERE path=?", [file]));
      if (SOLA_TELEGRAM_ID && SOLA_TELEGRAM_URL) {
        console.log("Posting notification to telegram");
        await fetch(
          SOLA_TELEGRAM_URL,
          {
            method: "POST",
            body: new URLSearchParams([
              [
                "chat_id",
                SOLA_TELEGRAM_ID
              ],
              [
                "text",
                file.split("/")[1]
              ]
            ])
          });
      }
      if (SOLA_DISCORD_URL) {
        console.log("Posting notification to discord");
        await fetch(
          SOLA_DISCORD_URL,
          {
            method: "POST",
            body: new URLSearchParams([
              [
                "content",
                file.split("/")[1]
              ]
            ])
          });
      }
    } else {
      console.log(`File status is [${result[0].status}] , skip`);
    }
    await channel.ack(msg);
    console.log(`Completed ${SOLA_MQ_LOAD} job for ${file}`);
    await new Promise((resolve) => {
      setTimeout(resolve, 200); // let the bullets fly awhile
    });
    console.log("Completed");
  }, {noAck: false});
})();
