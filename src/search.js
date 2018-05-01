const path = require("path");
const request = require("request-promise");
const {solr_endpoint, solr_core} = require("../config");

(async () => {
  const file = path.resolve(process.argv[2]);
  console.log(`Searching ${solr_endpoint + solr_core}_* for ${file}`);

  const solr = await request({
    method: "GET",
    uri: `${solr_endpoint}admin/cores?wt=json`,
    json: true
  });

  const result = await Promise.all(Object.keys(solr.status) // get the names of all loaded cores
    .filter((coreName) => coreName.indexOf(`${solr_core}_`) === 0) // select all cores of the name
    .map((coreName) => `${solr_endpoint + coreName}/lireq?&field=cl_ha&ms=false&file=${file}&accuracy=0&candidates=1000000&rows=10`)
    .map((uri) => request({
      uri,
      json: true
    })));
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
