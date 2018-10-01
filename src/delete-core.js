const path = require("path");
const fetch = require("node-fetch");
const fs = require("fs-extra");

const {solr_endpoint, solr_core} = require("../config");

const deleteCore = async (coreName) => {
  console.log(`Unloading existing core ${coreName}`);
  await fetch(`${solr_endpoint}admin/cores?action=UNLOAD&core=${coreName}&wt=json`);


  const instanceDir = path.join("/var/solr/data", coreName);
  if (fs.existsSync(instanceDir)) {
    console.log("Deleting core files");
    fs.removeSync(instanceDir);
  }
  console.log("Completed");
};

(async () => {
  const result = await fetch(`${solr_endpoint}admin/cores?wt=json`).then((res) => res.json());

  Object.keys(result.status) // get the names of all loaded cores
    .filter((coreName) => coreName.indexOf(`${solr_core}_`) === 0) // select all cores of the name
    .reduce((chain, coreName) => chain.then(() => deleteCore(coreName)), Promise.resolve([]));
})();
