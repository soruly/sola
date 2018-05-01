const path = require("path");
const request = require("request-promise");
const fs = require("fs-extra");

const {solr_endpoint, solr_core} = require("../config");

const deleteCore = async (coreName) => {
  console.log(`Unloading existing core ${coreName}`);
  await request({
    method: "GET",
    uri: `${solr_endpoint}admin/cores?action=UNLOAD&core=${coreName}&wt=json`,
    json: true
  });


  const instanceDir = path.join("/var/solr/data", coreName);
  if (fs.existsSync(instanceDir)) {
    console.log("Deleting core files");
    fs.removeSync(instanceDir);
  }
  console.log("Completed");
};

(async () => {
  const result = await request({
    method: "GET",
    uri: `${solr_endpoint}admin/cores?wt=json`,
    json: true
  });

  Object.keys(result.status) // get the names of all loaded cores
    .filter((coreName) => coreName.indexOf(`${solr_core}_`) === 0) // select all cores of the name
    .reduce((chain, coreName) => chain.then(() => deleteCore(coreName)), Promise.resolve([]));
})();
