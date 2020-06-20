require("dotenv").config();
const amqp = require("amqplib");
const { hash } = require("./lib/hash");

const {
  SOLA_SOLR_URL,
  SOLA_SOLR_CORE,
  SOLA_MQ_URL,
  SOLA_MQ_HASH,
  SOLA_MQ_LOAD,
  SOLA_DB_HOST,
  SOLA_DB_PORT,
  SOLA_DB_USER,
  SOLA_DB_PWD,
  SOLA_DB_NAME,
} = process.env;

(async () => {
  console.log("Connecting to amqp server");
  const connection = await amqp.connect(SOLA_MQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(SOLA_MQ_HASH, { durable: false });
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${SOLA_MQ_HASH}. To exit press CTRL+C`);
  channel.consume(
    SOLA_MQ_HASH,
    async (msg) => {
      const { SOLA_FILE_PATH, SOLA_HASH_PATH, file } = JSON.parse(msg.content.toString());
      console.log(`Received ${SOLA_MQ_HASH} job for ${file}`);
      console.log("Connecting to mariadb");
      const knex = require("knex")({
        client: "mysql",
        connection: {
          host: SOLA_DB_HOST,
          port: SOLA_DB_PORT,
          user: SOLA_DB_USER,
          password: SOLA_DB_PWD,
          database: SOLA_DB_NAME,
        },
      });

      const result = await knex("files").select("status").where("path", file);
      if (result[0].status === "NEW") {
        await knex("files").where("path", file).update({ status: "HASHING" });
        await hash(SOLA_FILE_PATH, SOLA_HASH_PATH, file);
        await knex("files").where("path", file).update({ status: "HASHED" });
      } else {
        console.log(`File status is [${result[0].status}] , skip`);
      }
      await knex.destroy();
      await channel.ack(msg);
      console.log(`Completed ${SOLA_MQ_HASH} job for ${file}`);
      await channel.assertQueue(SOLA_MQ_LOAD, { durable: false });
      console.log(`Submitting ${SOLA_MQ_LOAD} job for ${file}`);
      await channel.sendToQueue(
        SOLA_MQ_LOAD,
        Buffer.from(
          JSON.stringify({
            SOLA_FILE_PATH,
            SOLA_HASH_PATH,
            file,
            SOLA_SOLR_URL,
            SOLA_SOLR_CORE,
          })
        ),
        { persistent: false }
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 200); // let the bullets fly awhile
      });
      console.log("Completed");
    },
    { noAck: false }
  );
})();
