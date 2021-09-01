require("dotenv").config();
const amqp = require("amqplib");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { URLSearchParams } = require("url");
const { load } = require("./lib/load");
const {
  SOLA_MQ_URL,
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
  await channel.assertQueue(SOLA_MQ_LOAD, { durable: false });
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${SOLA_MQ_LOAD}. To exit press CTRL+C`);
  channel.consume(
    SOLA_MQ_LOAD,
    async (msg) => {
      const { SOLA_HASH_PATH, file, SOLA_SOLR_URL, SOLA_SOLR_CORE } = JSON.parse(
        msg.content.toString()
      );
      console.log(`Received ${SOLA_MQ_LOAD} job for ${file}`);
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
      if (result[0].status === "HASHED") {
        await knex("files").where("path", file).update({ status: "LOADING" });
        try {
          await load(SOLA_HASH_PATH, file, SOLA_SOLR_URL, SOLA_SOLR_CORE);
          console.log(`Completing ${SOLA_MQ_LOAD} job for ${file}`);
        } catch (e) {
          await knex("files").where("path", file).update({ status: "HASHED" });
          await knex.destroy();
          return;
        }
        await knex("files").where("path", file).update({ status: "LOADED" });
        await knex.destroy();
      } else {
        console.log(`File status is [${result[0].status}] , skip`);
      }
      await channel.ack(msg);
      await new Promise((resolve) => {
        setTimeout(resolve, 200); // let the bullets fly awhile
      });
      console.log("Completed");
    },
    { noAck: false }
  );
})();
