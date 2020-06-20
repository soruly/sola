const path = require("path");
const fs = require("fs-extra");
const fetch = require("node-fetch");
const xmldoc = require("xmldoc");
const lzma = require("lzma-native");

const load = (SOLA_HASH_PATH, relativePath, SOLA_SOLR_URL, SOLA_SOLR_CORE) =>
  new Promise(async (resolve, reject) => {
    const zipFilePath = `${path.join(SOLA_HASH_PATH, relativePath)}.xml.xz`;
    console.log(`Loading ${zipFilePath} into solr`);

    console.log("Unzipping files");
    const zipFile = fs.readFileSync(zipFilePath);
    const data = await lzma.decompress(zipFile);

    console.log("Parsing xml");
    const hashList = new xmldoc.XmlDocument(data).children
      .filter((child) => child.name === "doc")
      .map((doc) => {
        const fields = doc.children.filter((child) => child.name === "field");
        return {
          time: parseFloat(fields.filter((field) => field.attr.name === "id")[0].val),
          jc_hi: fields.filter((field) => field.attr.name === "jc_hi")[0].val,
          jc_ha: fields.filter((field) => field.attr.name === "jc_ha")[0].val,
        };
      })
      .sort((a, b) => a.time - b.time);

    const dedupedHashList = [];
    hashList.forEach((currentFrame) => {
      if (
        !dedupedHashList
          .slice(-24) // get last 24 frames
          .filter((frame) => currentFrame.time - frame.time < 2) // select only frames within 2 sec
          .some((frame) => frame.jc_hi === currentFrame.jc_hi) // check for exact match frames
      ) {
        dedupedHashList.push(currentFrame);
      }
    });

    const xml = [
      "<add>",
      dedupedHashList
        .map((doc) =>
          [
            "<doc>",
            '<field name="id">',
            `<![CDATA[${relativePath}/${doc.time.toFixed(2)}]]>`,
            "</field>",
            '<field name="jc_hi">',
            doc.jc_hi,
            "</field>",
            '<field name="jc_ha">',
            doc.jc_ha,
            "</field>",
            "</doc>",
          ].join("")
        )
        .join("\n"),
      "</add>",
    ].join("\n");

    // fs.writeFileSync("debug.xml", xml);

    try {
      console.log("Deciding which solr core to upload");
      const coreInfo = await fetch(`${SOLA_SOLR_URL}admin/cores?wt=json`).then((res) => res.json());

      const selectedCoreName = Object.values(coreInfo.status)
        .filter((e) => e.name.match(new RegExp(`${SOLA_SOLR_CORE}_\\d+`)))
        .sort((a, b) => a.index.numDocs - b.index.numDocs)[0].name; // choose least populated core

      console.log(`Uploading xml to solr core ${selectedCoreName}`);
      await fetch(`${SOLA_SOLR_URL}${selectedCoreName}/update?wt=json&commit=true`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xml,
      });

      resolve();
    } catch (e) {
      reject(new Error(e));
    }
  });

module.exports = { load };
