import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vendor = path.join(root, 'vendor');
const chunks = ['1a', '1b', '2', '3'].map((part) =>
  path.join(vendor, `brasta-client-source.zip.b64.${part}`)
);

let archiveBuffer;
if (chunks.every((file) => fs.existsSync(file))) {
  const base64 = chunks.map((file) => fs.readFileSync(file, 'utf8').trim()).join('');
  archiveBuffer = Buffer.from(base64, 'base64');
  if (archiveBuffer.length !== 16435) {
    throw new Error(`Reconstructed client archive has unexpected size ${archiveBuffer.length}; expected 16435`);
  }
  console.log(`Reconstructed canonical browser archive (${archiveBuffer.length} bytes)`);
} else {
  const archive = path.join(vendor, 'brasta-client-source.zip');
  if (!fs.existsSync(archive)) throw new Error('Missing Brasta client source archive');
  archiveBuffer = fs.readFileSync(archive);
}

const zip = new AdmZip(archiveBuffer);
zip.extractAllTo(root, true);
console.log('Extracted canonical browser sources');
