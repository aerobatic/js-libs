const AWS = require("aws-sdk");
const fs = require("fs-extra");
const path = require("path");
const uglify = require("uglify-js");
const glob = require("glob-promise");

const s3 = new AWS.S3({ region: "us-west-2" });

const version = require("../package.json").version;

const main = async () => {
  const distDir = path.join(__dirname, "..", `dist/v${version}`);

  console.log(`Creating dist dir ${distDir}`);
  await fs.ensureDir(distDir);
  await fs.emptyDir(distDir);

  const jsLibs = await glob("libs/*.js");
  for (lib of jsLibs) {
    const fullPath = path.join(__dirname, "..", lib);

    console.log(`Minify lib ${lib}`);
    const result = uglify.minify(
      {
        [path.basename(lib)]: fs.readFileSync(fullPath).toString()
      },
      {
        sourceMap: {
          url: `${path.basename(lib)}.map`
        }
      }
    );

    const minifiedFile = path.join(
      distDir,
      `${path.basename(lib, ".js")}.min.js`
    );

    const sourceMap = path.join(distDir, `${path.basename(lib)}.map`);

    await Promise.all([
      await fs.copyFile(fullPath, path.join(distDir, path.basename(lib))),
      await fs.writeFile(minifiedFile, result.code),
      await fs.writeFile(sourceMap, result.map)
    ]);

    await Promise.all(
      [fullPath, minifiedFile, sourceMap].map(file => {
        const key = `js-libs/v${version}/${path.basename(file)}`;
        console.log(`Uploading ${key}`);
        return s3
          .upload({
            Bucket: "aerobatic-js",
            Key: key,
            Body: fs.createReadStream(file),
            ACL: "public-read",
            ContentType:
              path.extname(file) === ".js"
                ? "application/javascript"
                : "application/json"
          })
          .promise();
      })
    );
  }
};

main()
  .catch(err => {
    console.error(err);
    return process.exit(1);
  })
  .then(() => {
    process.exit();
  });
