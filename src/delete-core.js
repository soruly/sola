require("dotenv").config();
const path = require("path");
const fetch = require("node-fetch");
const fs = require("fs-extra");

const { SOLA_SOLR_URL, SOLA_SOLR_CORE } = process.env;

const deleteCore = async (coreName) => {
  console.log(`Unloading existing core ${coreName}`);
  await fetch(`${SOLA_SOLR_URL}admin/cores?action=UNLOAD&core=${coreName}&wt=json`);

  const instanceDir = path.join("/opt/mysolrhome", coreName);
  if (fs.existsSync(instanceDir)) {
    console.log("Deleting core files");
    fs.removeSync(instanceDir);
  }
  console.log("Completed");
};

(async () => {
  const result = await fetch(`${SOLA_SOLR_URL}admin/cores?wt=json`).then((res) => res.json());

  Object.keys(result.status) // get the names of all loaded cores
    .filter((coreName) => coreName.match(new RegExp(`${SOLA_SOLR_CORE}_\\d+`))) // select all cores of the name
    .reduce((chain, coreName) => chain.then(() => deleteCore(coreName)), Promise.resolve([]));
})();
