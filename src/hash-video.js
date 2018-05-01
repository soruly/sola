const mysql = require("promise-mysql");
const amqp = require("amqplib");
const {hash} = require("./lib/hash");

const {
  solr_endpoint, solr_core,
  amqp_server, amqp_hash_queue, amqp_load_queue,
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

  console.log("Connecting to amqp server");
  const connection = await amqp.connect(amqp_server);
  const channel = await connection.createChannel();
  await channel.assertQueue(amqp_hash_queue, {durable: false});
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${amqp_hash_queue}. To exit press CTRL+C`);
  channel.consume(amqp_hash_queue, async (msg) => {
    const {anime_path, hash_path, file} = JSON.parse(msg.content.toString());
    console.log(`Received ${amqp_hash_queue} job for ${file}`);
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
    console.log(`Completed ${amqp_hash_queue} job for ${file}`);
    await channel.assertQueue(amqp_load_queue, {durable: false});
    console.log(`Submiting ${amqp_load_queue} job for ${file}`);
    await channel.sendToQueue(amqp_load_queue, Buffer.from(JSON.stringify({
      anime_path,
      hash_path,
      file,
      solr_endpoint,
      solr_core
    })), {persistent: false});
    await new Promise((resolve) => {
      setTimeout(resolve, 200); // let the bullets fly awhile
    });
  }, {noAck: false});
})();
