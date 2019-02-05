const fetch = require("node-fetch");

const unload = (relativePath, SOLA_SOLR_URL, SOLA_SOLR_CORE) => new Promise(async (resolve, reject) => {
  try {
    const coreInfo = await fetch(`${SOLA_SOLR_URL}admin/cores?wt=json`).then((res) => res.json());
    await Promise.all(
      Object.values(coreInfo.status)
        .filter((e) => e.name.indexOf(`${SOLA_SOLR_CORE}_`) === 0)
        .map((core) => core.name)
        .map((coreName) => fetch(
          `${SOLA_SOLR_URL}${coreName}/update?wt=json&commit=true`,
          {
            method: "POST",
            headers: {"Content-Type": "text/xml"},
            body: `<delete><query>id:${relativePath.replace(/([ +\-!(){}[\]^"~*?:\\/])/g, "\\$1")}\\/*</query></delete>`
          })
        )
    );
    resolve();
  } catch (e) {
    reject(new Error(e));
  }
});

module.exports = {unload};
