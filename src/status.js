require("dotenv").config();
const fetch = require("node-fetch");
const { SOLA_SOLR_URL, SOLA_SOLR_CORE } = process.env;

(async () => {
  console.log(`Reading core info from ${SOLA_SOLR_URL}`);
  const status = (
    await fetch(`${SOLA_SOLR_URL}admin/cores?indexInfo=true&wt=json`).then((res) => res.json())
  ).status;

  const cores = {
    total: {
      current: null,
      hasDeletions: null,
      segmentCount: 0,
      numDocs: 0,
      maxDoc: 0,
      deletedDocs: 0,
      size: "0 GB",
    },
  };
  for (let id in status) {
    const {
      name,
      index: { current, hasDeletions, segmentCount, numDocs, maxDoc, deletedDocs, size },
    } = status[id];
    cores[name] = {
      current,
      hasDeletions,
      segmentCount,
      numDocs,
      maxDoc,
      deletedDocs,
      size,
    };
    cores.total.segmentCount += segmentCount;
    cores.total.numDocs += numDocs;
    cores.total.maxDoc += maxDoc;
    cores.total.deletedDocs += deletedDocs;
    cores.total.size = Number(cores.total.size.split(" ")[0]) + Number(size.split(" ")[0]) + " GB";
  }

  console.table(cores);
})();
