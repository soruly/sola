require("dotenv").config();
const path = require("path");
const fs = require("fs-extra");
const fetch = require("node-fetch");

const { SOLA_SOLR_URL, SOLA_SOLR_CORE } = process.env;

const createCore = async (coreName) => {
  console.log(`Check if solr core ${coreName} already loaded`);
  const result = await fetch(`${SOLA_SOLR_URL}admin/cores?wt=json`).then((res) => res.json());

  if (Object.keys(result.status).includes(coreName)) {
    console.log(`Unloading existing core ${coreName}`);
    await fetch(`${SOLA_SOLR_URL}admin/cores?action=UNLOAD&core=${coreName}&wt=json`);
  }

  const instanceDir = path.join("/opt/mysolrhome", coreName);
  if (fs.existsSync(instanceDir)) {
    console.log("Removing previous core");
    fs.removeSync(instanceDir);
  }
  console.log(`Creating solr core ${coreName}`);
  fetch(
    `${SOLA_SOLR_URL}admin/cores?action=CREATE&name=${coreName}&instanceDir=${instanceDir}&configSet=/opt/mysolrhome`
  )
    .then((response) => {
      console.log(response);
    })
    .catch((error) => {
      console.log(error);
    });
};

((num = 4) => {
  Array.from(new Array(parseInt(num, 10)), (_, index) => index).reduce(
    (chain, i) => chain.then(() => createCore(`${SOLA_SOLR_CORE}_${i}`)),
    Promise.resolve([])
  );
})(process.argv[2]);
