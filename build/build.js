/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import vsce from 'vsce';
import log from 'fancy-log';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { clean, cleanJreDir, getPackageJSON } from './fsUtils.js';
import { updateVersion } from './updateVersion.js';
import { downloadJre } from './jreDownload.js';
import { cycloneDx } from './sbomGeneration.js';

const UNIVERSAL_MODE = '--universal';
const ALL_TARGETS_MODE = '--all';
const LATEST_JRE = 17;
const UNIVERSAL_PLATFORM = 'universal';
// const TARGETED_PLATFORMS = ['win32-x64'];
const TARGETED_PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];
const allPlatforms = {};
[...TARGETED_PLATFORMS, UNIVERSAL_PLATFORM].forEach(platform => {
  allPlatforms[platform] = {
    fileName: '',
    hashes: {
      md5: '',
      sha1: ''
    }
  };
});

build();

// usage examples:
// node build.js --universal
// node build.js --all
async function build() {
  await buildUniversal();
  await buildAll();
}

async function buildUniversal() {
  commonPreTasks();
  await vsce.createVSIX();
  commonPostTasks();
}

async function buildAll() {
  commonPreTasks();
  for (const platform of TARGETED_PLATFORMS) {
    await buildForPlatform(platform);
  }
  cleanJreDir();
  commonPostTasks();
}

async function buildForPlatform(platform) {
  await downloadJre(platform, LATEST_JRE);
  await vsce.createVSIX({ target: platform });
}

function commonPreTasks() {
  clean();
  cycloneDx();
  updateVersion();
}

function commonPostTasks() {
  computeUniversalVsixHashes();
  sign();
  deployBuildInfo();
  deployVsix();
}

function computeUniversalVsixHashes() {
  const version = getPackageJSON().version;
  doForFiles('.vsix', () => hashsum(UNIVERSAL_PLATFORM, version));
}

function sign() {}

function deployBuildInfo() {}

function deployVsix() {}

function hashsum(platform, version) {
  allPlatforms[platform].fileName =
    platform === UNIVERSAL_PLATFORM
      ? `sonarlint-vscode-${version}.vsix`
      : `sonarlint-vscode-${platform}-${version}.vsix`;

  updateHashes(platform, allPlatforms[platform].fileName);
}

function doForFiles(extensions, callback) {
  fs.readdir('./', function (err, files) {
    if (err) {
      console.log('Unable to scan directory: ' + err);
      return;
    }

    files.forEach(function (file) {
      if (fileHasExtension(file, extensions)) {
        callback(file);
      }
    });
  });
}

function fileHasExtension(file, extensions) {
  const fileExtension = path.extname(file);
  if (typeof extensions === 'string') {
    return fileExtension === extensions;
  }
  return extensions.includes(fileExtension);
}

function updateHashes(platform, file) {
  if (!fs.existsSync(file)) {
    return;
  }
  const hashesObject = allPlatforms[platform].hashes;
  const binaryContent = fs.readFileSync(file, 'binary');
  console.log(`Hashes object: ` + JSON.stringify(hashesObject));
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
  //updateBinaryHashes(fs.readFileSync(file, 'binary'), allPlatforms[platform].hashes);
}

function updateBinaryHashes(binaryContent, hashesObject) {
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}
