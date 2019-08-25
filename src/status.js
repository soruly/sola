require("dotenv").config();
const fetch = require("node-fetch");
const { SOLA_SOLR_URL, SOLA_SOLR_CORE } = process.env;

(async () => {
  console.log(`Reading core info from ${SOLA_SOLR_URL}`);
  const status = (await fetch(
    `${SOLA_SOLR_URL}admin/cores?indexInfo=true&wt=json`
  ).then(res => res.json())).status;

  const cores = {};
  for (let id in status) {
    const {
      name,
      index: {
        current,
        hasDeletions,
        segmentCount,
        numDocs,
        maxDoc,
        deletedDocs,
        size
      }
    } = status[id];
    cores[name] = {
      current,
      hasDeletions,
      segmentCount,
      numDocs,
      maxDoc,
      deletedDocs,
      size
    };
  }

  console.table(cores);
})();
