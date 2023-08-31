/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import openpgp from 'openpgp';
import Stream from 'stream';
import fs from 'fs';
import path from 'path';
import * as globby from 'globby';
import log from 'fancy-log';

export async function signVsix(opts = {}) {
  const files = globby.globbySync(path.join('*{.vsix,-cyclonedx.json}'));

  for (const file of files) {
    log.info(`Starting 'sign' for ${file}`);
    const passThroughStream = new Stream.PassThrough();
    const fileReadStream = fs.createReadStream(`./${file}`);
    fileReadStream.pipe(passThroughStream);
    sign(passThroughStream, opts.privateKeyArmored, opts.passphrase).then(async signature => {
      const signatureString = await streamToString(signature);
      fs.writeFileSync(`./${file}mine.asc`, signatureString);
      log.info(`Signature for ${file} generated`);
    });
  }
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function sign(content, privateKeyArmored, passphrase) {
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });
  const message = await openpgp.createMessage({ binary: content });
  return openpgp.sign({
    message,
    signingKeys: privateKey,
    detached: true
  });
}