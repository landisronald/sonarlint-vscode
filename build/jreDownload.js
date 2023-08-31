const cleanJreDir = require('./fsUtils.js').cleanJreDir;
const deleteFile = require('./fsUtils.js').deleteFile;
const fse = require('fs-extra');
const url = require('url');
const path = require('path');
const log = require('fancy-log');
const fetch = require('node-fetch');
const fs = require('fs');
const tar = require('tar');
const zlib = require('node:zlib');

async function downloadJre(targetPlatform, javaVersion) {
  cleanJreDir();
  fse.ensureDir('./jre', err => {
    log.error(err);
  });

  const platformMapping = {
    'linux-arm64': 'linux-aarch64',
    'linux-x64': 'linux-x86_64',
    'darwin-arm64': 'macosx-aarch64',
    'darwin-x64': 'macosx-x86_64',
    'win32-x64': 'win32-x86_64'
  };

  if (!targetPlatform || !Object.keys(platformMapping).includes(targetPlatform)) {
    log.error(
      '[Error] download_jre failed, please specify a valid target platform via --target argument. ' +
        'Here are the supported platform list:'
    );
    for (const platform of Object.keys(platformMapping)) {
      log.info(platform);
    }
    return;
  }

  log.info(`Downloading justj JRE ${javaVersion} for the platform ${targetPlatform} ...`);

  const manifestUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/justj.manifest`;
  // Download justj.manifest file
  const manifest = await new Promise(function (resolve, reject) {
    fetch(manifestUrl).then(response => {
      if (!response.ok || response.status >= 400) {
        reject(response.error || `${response.status} returned from ${manifestUrl}`);
      } else {
        resolve(response.text());
      }
    });
  });

  if (!manifest) {
    log.error(`Failed to download justj.manifest, please check if the link ${manifestUrl} is valid.`);
    return;
  }

  /**
   * Here are the contents for a sample justj.manifest file:
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-linux-aarch64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-linux-x86_64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-macosx-aarch64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-macosx-x86_64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-win32-x86_64.tar.gz
   */
  const javaPlatform = platformMapping[targetPlatform];
  const list = manifest.split(/\r?\n/);
  const jreIdentifier = list.find(value => {
    return (
      value.indexOf('org.eclipse.justj.openjdk.hotspot.jre.full.stripped') >= 0 && value.indexOf(javaPlatform) >= 0
    );
  });

  if (!jreIdentifier) {
    log.error(
      `justj doesn't support the jre ${javaVersion} for the platform ${javaPlatform}
       (${targetPlatform}), please refer to the link ${manifestUrl} for the supported platforms.`
    );
    return;
  }

  const jreDownloadUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/${jreIdentifier}`;
  const parsedDownloadUrl = url.parse(jreDownloadUrl);
  const jreFileName = path.basename(parsedDownloadUrl.pathname).replace(/\.(?:7z|bz2|gz|rar|tar|zip|xz)*$/, '');
  const idx = jreFileName.indexOf('-');
  const jreVersionLabel = idx >= 0 ? jreFileName.substring(idx + 1) : jreFileName;
  // Download justj JRE.

  await downloadFile(jreDownloadUrl, `./jre/${jreFileName}`);

  const inputFilePath = `./jre/${jreFileName}`;
  const outputFolderPath = './jre/' + jreVersionLabel;
  if (!fs.existsSync(outputFolderPath)) {
    fs.mkdirSync(outputFolderPath);
  }

  const compressedReadStream = fs.createReadStream(inputFilePath);
  const decompressionStream = zlib.createGunzip();
  const extractionStream = tar.extract({
    cwd: outputFolderPath // Set the current working directory for extraction
  });
  compressedReadStream.pipe(decompressionStream).pipe(extractionStream);
  extractionStream.on('finish', () => {
    log.info('Extraction complete.');
    deleteFile(inputFilePath);
  });
  compressedReadStream.on('error', err => log.error('Error reading compressed file:', err));
  decompressionStream.on('error', err => log.error('Error decompressing:', err));
  extractionStream.on('error', err => log.error('Error extracting:', err));
}

async function downloadFile(fileUrl, destPath) {
  return new Promise(function (resolve, reject) {
    fetch(fileUrl).then(function (res) {
      const fileStream = fs.createWriteStream(destPath);
      res.body.on('error', reject);
      fileStream.on('finish', resolve);
      res.body.pipe(fileStream);
    });
  });
}

downloadJre('win32-x64', 17)

module.exports = downloadJre
