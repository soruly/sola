const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const child_process = require("child_process");
const lzma = require("lzma-native");
const { v4: uuidv4 } = require("uuid");

const hash = async (SOLA_FILE_PATH, SOLA_HASH_PATH, relativePath) => {
  const mp4FilePath = path.join(SOLA_FILE_PATH, relativePath);
  console.log(`Hashing ${mp4FilePath}`);
  if (!fs.existsSync(mp4FilePath)) {
    console.log("Error: file not exist");
    return;
  }
  const xmlZipFilePath = `${path.join(SOLA_HASH_PATH, relativePath)}.xml.xz`;

  const tempPath = path.join(os.tmpdir(), "sola", uuidv4());
  console.log(`Creating temp directory ${tempPath}`);
  fs.ensureDirSync(tempPath);
  fs.emptyDirSync(tempPath);

  console.log("Extracting thumbnails");
  const { stderr: ffmpegLog } = child_process.spawnSync(
    "ffmpeg",
    [
      "-i",
      mp4FilePath,
      "-q:v",
      2,
      "-an",
      "-vf",
      "fps=12,scale=-2:180,showinfo", // 24000/1001
      `${tempPath}/%08d.jpg`,
    ],
    { encoding: "utf-8", maxBuffer: 1024 * 1024 * 100 }
  );
  const myRe = /pts_time:\s*((\d|\.)+?)\s*pos/g;
  let temp = [];
  const timeCodeList = [];
  while ((temp = myRe.exec(ffmpegLog)) !== null) {
    timeCodeList.push(parseFloat(temp[1]).toFixed(4));
  }
  console.log(`Extracted ${timeCodeList.length} timecode`);

  const thumbnailList = fs.readdirSync(tempPath);
  console.log(`Extracted ${thumbnailList.length} thumbnails`);

  console.log("Preparing frame files for analysis");
  const thumbnailListPath = path.join(tempPath, "frames.txt");
  fs.writeFileSync(
    thumbnailListPath,
    thumbnailList.map((each) => path.join(tempPath, each)).join("\n")
  );

  console.log("Analyzing frames");
  const lireSolrXMLPath = path.join(tempPath, "output.xml");
  const { stdout, stderr } = child_process.spawnSync(
    "java",
    [
      "-cp",
      "docker/*",
      "net.semanticmetadata.lire.solr.indexing.ParallelSolrIndexer",
      "-i",
      thumbnailListPath,
      "-o",
      lireSolrXMLPath,
      "-f", // force to overwrite output file
      // "-a", // use both BitSampling and MetricSpaces
      // "-l", // disable bitSampling and use MetricSpaces instead
      "-w", // monitoring interval, default 1000ms
      500,
      "-n", // number of threads
      16,
      "-y", // defines which feature classes are to be extracted, comma seperated
      "jc", // cl,eh,jc,oh,ph,ac,ad,ce,fc,fo,jh,sc
    ],
    { encoding: "utf-8", maxBuffer: 1024 * 1024 * 100 }
  );
  console.log(stdout);
  console.log(stderr);

  console.log("Post-Processing XML");
  // replace frame numbers with timecode
  // and sort by timecode in ascending order
  const parsedXML = [
    "<add>",
    fs
      .readFileSync(lireSolrXMLPath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.indexOf("<doc>") === 0)
      .map((line) =>
        line
          .replace(/<field name="title">(.*?)<\/field>/g, "")
          .replace(
            /<field name="id">.*\/(.*?\.jpg)<\/field>/g,
            (match, p1) => `<field name="id">${timeCodeList[thumbnailList.indexOf(p1)]}</field>`
          )
      )
      .sort(
        (a, b) =>
          parseFloat(a.match(/<field name="id">(.*?)<\/field>/)[1]) -
          parseFloat(b.match(/<field name="id">(.*?)<\/field>/)[1])
      )
      .join("\n"),
    "</add>",
  ].join("\n");
  // fs.writeFileSync("debug.xml", parsedXML);

  console.log("Compressing XML");
  const compressedXML = await lzma.compress(parsedXML, { preset: 6 });
  console.log("Writing output XML");
  fs.ensureFileSync(xmlZipFilePath);
  fs.writeFileSync(xmlZipFilePath, compressedXML, "binary");

  console.log("Removing temp files");
  fs.removeSync(tempPath);
};

module.exports = { hash };
