require("dotenv").config();
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { SOLA_SOLR_URL, SOLA_SOLR_CORE } = process.env;

(async () => {
  const file = path.resolve(process.argv[2]);
  console.log(`Searching ${SOLA_SOLR_URL}${SOLA_SOLR_CORE}_* for ${file}`);

  const solr = await fetch(`${SOLA_SOLR_URL}admin/cores?wt=json`).then((res) => res.json());

  const result = await Promise.all(
    Object.keys(solr.status) // get the names of all loaded cores
      .filter((
        coreName // select all cores of the prefix
      ) => coreName.match(new RegExp(`${SOLA_SOLR_CORE}_\\d+`)))
      .map(
        (coreName) =>
          `${SOLA_SOLR_URL}${coreName}/lireq?&field=jc_ha&ms=false&accuracy=0&candidates=1000000&rows=10`
      )
      .map((uri) =>
        fetch(uri, {
          method: "POST",
          body: fs.readFileSync(file),
        }).then((res) => res.json())
      )
  );
  if (result.some((res) => res.Error)) {
    console.log(result);
  } else {
    const combinedResult = result
      .map((res) => res.response.docs)
      .reduce((all, each) => all.concat(each), [])
      .sort((a, b) => b.d - a.d)
      .slice(-5);

    console.log(JSON.stringify(combinedResult, null, 2));
  }
})();
