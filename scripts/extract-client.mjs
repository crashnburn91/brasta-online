import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vendor = path.join(root, 'vendor');
const chunkFiles = [1, 2, 3, 4].map((n) => path.join(vendor, `brasta-client-source.zip.b64.${n}`));

for (const file of chunkFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing canonical client archive chunk: ${path.basename(file)}`);
}

const base64 = chunkFiles.map((file) => fs.readFileSync(file, 'utf8').trim()).join('');
const archiveBuffer = Buffer.from(base64, 'base64');
const EXPECTED_SIZE = 22992;
if (archiveBuffer.length !== EXPECTED_SIZE) {
  throw new Error(`Reconstructed client archive has unexpected size ${archiveBuffer.length}; expected ${EXPECTED_SIZE}`);
}

console.log(`Reconstructed canonical browser archive (${archiveBuffer.length} bytes)`);
const zip = new AdmZip(archiveBuffer);
zip.extractAllTo(root, true);
console.log('Extracted canonical browser sources');
