const mysql = require("promise-mysql");
const amqp = require("amqplib");
const request = require("request-promise");
const {load} = require("./lib/load");
const {
  amqp_server, amqp_load_queue,
  mariadb_host, mariadb_user, mariadb_pass, mariadb_db,
  telegram_channel_url
} = require("../config");

(async () => {
  console.log("Connecting to mariadb");
  const conn = await mysql.createConnection({
    host: mariadb_host,
    user: mariadb_user,
    password: mariadb_pass,
    database: mariadb_db
  });

  console.log("Connecting to amqp server");
  const connection = await amqp.connect(amqp_server);
  const channel = await connection.createChannel();
  await channel.assertQueue(amqp_load_queue, {durable: false});
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${amqp_load_queue}. To exit press CTRL+C`);
  channel.consume(amqp_load_queue, async (msg) => {
    const {hash_path, file, solr_endpoint, solr_core} = JSON.parse(msg.content.toString());
    console.log(`Received ${amqp_load_queue} job for ${file}`);
    await conn.beginTransaction();
    const result = await conn.query(mysql.format("SELECT status FROM files WHERE path=?", [file]));
    if (result[0].status === "HASHED") {
      await conn.query(mysql.format("UPDATE files SET status='LOADING' WHERE path=?", [file]));
      conn.commit();
      await load(hash_path, file, solr_endpoint, solr_core);
      await conn.query(mysql.format("UPDATE files SET status='LOADED' WHERE path=?", [file]));
      if (telegram_channel_url) {
        console.log("Posting notification to telegram");
        await request({
          method: "POST",
          uri: telegram_channel_url,
          body: {
            chat_id: "@whatanimeupdates",
            text: file.split("/")[1]
          },
          json: true
        });
      }
    } else {
      console.log(`File status is [${result[0].status}] , skip`);
    }
    await channel.ack(msg);
    console.log(`Completed ${amqp_load_queue} job for ${file}`);
    await new Promise((resolve) => {
      setTimeout(resolve, 200); // let the bullets fly awhile
    });
    console.log("Completed");
  }, {noAck: false});
})();
