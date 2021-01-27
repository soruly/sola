require("dotenv").config();
const path = require("path");
const fs = require("fs-extra");
const amqp = require("amqplib");
const chokidar = require("chokidar");

const {
  SOLA_FILE_PATH,
  SOLA_HASH_PATH,
  SOLA_MQ_URL,
  SOLA_MQ_HASH,
  SOLA_DB_HOST,
  SOLA_DB_PORT,
  SOLA_DB_USER,
  SOLA_DB_PWD,
  SOLA_DB_NAME,
} = process.env;

(() => {
  console.log("Watching folders for new files");
  chokidar
    .watch(SOLA_FILE_PATH, {
      persistent: true,
      ignoreInitial: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
      atomic: true, // or a custom 'atomicity delay', in milliseconds (default 100)
    })
    .on("add", async (filePath) => {
      console.log(`[chokidar] add ${filePath}`);
      if (!fs.existsSync(filePath)) {
        console.log(`Gone ${filePath}`);
        return;
      }
      if (filePath.replace(SOLA_FILE_PATH, "").split("/").length < 2) return;
      const anilistID = filePath.replace(SOLA_FILE_PATH, "").split("/")[0];
      const fileName = filePath.replace(SOLA_FILE_PATH, "").split("/").pop();
      if (filePath.replace(SOLA_FILE_PATH, "").split("/").length > 2) {
        if (SOLA_HASH_PATH.includes("anilist_jc")) return;
        console.log(`Moving ${filePath} to ${path.join(SOLA_FILE_PATH, anilistID, fileName)}`);
        fs.moveSync(filePath, path.join(SOLA_FILE_PATH, anilistID, fileName), {
          overwrite: true,
        });
        return;
      }
      if (![".mp4"].includes(path.extname(fileName).toLowerCase())) {
        console.log(`Ignored ${filePath}`);
        return;
      }
      const relativePath = filePath.replace(SOLA_FILE_PATH, "");
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
      console.log("Adding new file to database");
      await knex.raw(
        knex("files")
          .insert({
            path: relativePath,
            status: "NEW",
          })
          .toString()
          .replace(/^insert/i, "insert ignore")
      );

      console.log("Sending out hash jobs for new file");
      const connection = await amqp.connect(SOLA_MQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(SOLA_MQ_HASH, { durable: false });
      console.log(`Submitting ${SOLA_MQ_HASH} job for ${relativePath}`);
      await channel.sendToQueue(
        SOLA_MQ_HASH,
        Buffer.from(
          JSON.stringify({
            SOLA_FILE_PATH,
            SOLA_HASH_PATH,
            file: relativePath,
          })
        ),
        { persistent: false }
      );
      await new Promise((res) => {
        setTimeout(res, 50);
      });
      await connection.close();
      console.log("Completed");
    })
    .on("unlink", (filePath) => {
      if (SOLA_HASH_PATH.includes("anilist_jc")) return;
      console.log(`[chokidar] unlink ${filePath}`);
      if (!fs.existsSync(filePath)) {
        console.log(`Gone ${filePath}`);
        return;
      }
      if (fs.readdirSync(path.dirname(filePath)).length === 0) {
        console.log(`Removing ${path.dirname(filePath)}`);
        fs.removeSync(path.dirname(filePath));
      }
    })
    .on("unlinkDir", (dirPath) => {
      if (SOLA_HASH_PATH.includes("anilist_jc")) return;
      console.log(`[chokidar] unlinkDir ${dirPath}`);
      if (fs.readdirSync(path.dirname(dirPath)).length === 0) {
        console.log(`Removing ${path.dirname(dirPath)}`);
        fs.removeSync(path.dirname(dirPath));
      }
    });
})();
