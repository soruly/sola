require("dotenv").config();
const fetch = require("node-fetch");
const { SOLA_SOLR_URL } = process.env;

(async () => {
  console.log(`Reading core info from ${SOLA_SOLR_URL}`);
  const status = (
    await fetch(`${SOLA_SOLR_URL}admin/cores?indexInfo=true&wt=json`).then((res) => res.json())
  ).status;

  for (const coreName of Object.keys(status)) {
    if (!status[coreName].index.hasDeletions) continue;

    console.log(`Optimizing solr core ${coreName}`);
    await fetch(`${SOLA_SOLR_URL}${coreName}/update?wt=json&optimize=true`);
  }
})();
