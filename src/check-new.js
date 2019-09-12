require("dotenv").config();
const child_process = require("child_process");
const amqp = require("amqplib");

const {
  SOLA_FILE_PATH,
  SOLA_HASH_PATH,
  SOLA_SOLR_URL,
  SOLA_SOLR_CORE,
  SOLA_MQ_URL,
  SOLA_MQ_HASH,
  SOLA_MQ_LOAD,
  SOLA_DB_HOST,
  SOLA_DB_PORT,
  SOLA_DB_USER,
  SOLA_DB_PWD,
  SOLA_DB_NAME
} = process.env;

(async () => {
  console.log("Connecting to mariadb");
  const knex = require("knex")({
    client: "mysql",
    connection: {
      host: SOLA_DB_HOST,
      port: SOLA_DB_PORT,
      user: SOLA_DB_USER,
      password: SOLA_DB_PWD,
      database: SOLA_DB_NAME
    }
  });

  // console.log("Creating file table if not exist");
  await knex.raw(`CREATE TABLE IF NOT EXISTS files (
            path varchar(768) COLLATE utf8mb4_unicode_ci NOT NULL,
            status enum('NEW','HASHING','HASHED','LOADING','LOADED') COLLATE utf8mb4_unicode_ci NOT NULL,
            created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (path),
            KEY status (status),
            KEY created (created),
            KEY updated (updated)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  console.log(`Scanning ${SOLA_FILE_PATH}`);
  const concurrency = 50;
  const args = process.argv[2] ? `-mmin -${process.argv[2]}` : "";
  const fileList = child_process
    .execSync(`find -L ${SOLA_FILE_PATH} -type f -name "*.mp4" ${args}`)
    .toString()
    .split("\n")
    .filter(each => each);

  console.log(`Found ${fileList.length} files, updating database...`);
  await fileList
    .map(filePath => filePath.replace(SOLA_FILE_PATH, ""))
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
      (chain, group) =>
        chain.then(() =>
          Promise.all(
            group.map(filePath =>
              knex.raw(
                knex("files")
                  .insert({
                    path: filePath,
                    status: "NEW"
                  })
                  .toString()
                  .replace(/^insert/i, "insert ignore")
              )
            )
          )
        ),
      Promise.resolve()
    );

  console.log("Looking for new files from database");
  const newFiles = await knex("files")
    .select("path")
    .where("status", "NEW");
  console.log("Sending out hash jobs for new files");
  await newFiles
    .map(each => each.path)
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
      (chain, group) =>
        chain.then(() =>
          Promise.all(
            group.map(
              filePath =>
                new Promise(async resolve => {
                  const connection = await amqp.connect(SOLA_MQ_URL);
                  const channel = await connection.createChannel();
                  await channel.assertQueue(SOLA_MQ_HASH, { durable: false });
                  // console.log(`Submitting ${SOLA_MQ_HASH} job for ${filePath}`);
                  await channel.sendToQueue(
                    SOLA_MQ_HASH,
                    Buffer.from(
                      JSON.stringify({
                        SOLA_FILE_PATH,
                        SOLA_HASH_PATH,
                        file: filePath
                      })
                    ),
                    { persistent: false }
                  );
                  await new Promise(res => {
                    setTimeout(res, 50);
                  });
                  await connection.close();
                  resolve();
                })
            )
          )
        ),
      Promise.resolve()
    );

  console.log("Looking for new hashed files from database");
  const newHash = await knex("files")
    .select("path")
    .where("status", "HASHED");
  console.log("Sending out load jobs for new hashes");
  await newHash
    .map(each => each.path)
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
      (chain, group) =>
        chain.then(() =>
          Promise.all(
            group.map(
              filePath =>
                new Promise(async resolve => {
                  const connection = await amqp.connect(SOLA_MQ_URL);
                  const channel = await connection.createChannel();
                  await channel.assertQueue(SOLA_MQ_LOAD, { durable: false });
                  // console.log(`Submitting ${SOLA_MQ_LOAD} job for ${filePath}`);
                  await channel.sendToQueue(
                    SOLA_MQ_LOAD,
                    Buffer.from(
                      JSON.stringify({
                        SOLA_FILE_PATH,
                        SOLA_HASH_PATH,
                        file: filePath,
                        SOLA_SOLR_URL,
                        SOLA_SOLR_CORE
                      })
                    ),
                    { persistent: false }
                  );
                  await new Promise(res => {
                    setTimeout(res, 50);
                  });
                  await connection.close();
                  resolve();
                })
            )
          )
        ),
      Promise.resolve()
    );

  await knex.destroy();

  console.log("Completed");
})();
