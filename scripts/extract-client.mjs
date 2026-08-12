import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vendor = path.join(root, 'vendor');
const partFiles = Array.from({ length: 12 }, (_, i) =>
  path.join(vendor, `brasta-client-source.part${String(i + 1).padStart(2, '0')}`)
);

for (const file of partFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing canonical client archive part: ${path.basename(file)}`);
}

const base64 = partFiles
  .map((file) => fs.readFileSync(file, 'utf8').replace(/\s+/g, ''))
  .join('');

const EXPECTED_BASE64_LENGTH = 35696;
if (base64.length !== EXPECTED_BASE64_LENGTH) {
  throw new Error(`Canonical client archive text has unexpected length ${base64.length}; expected ${EXPECTED_BASE64_LENGTH}`);
}

const archiveBuffer = Buffer.from(base64, 'base64');
const EXPECTED_SIZE = 26772;
if (archiveBuffer.length !== EXPECTED_SIZE) {
  throw new Error(`Reconstructed client archive has unexpected size ${archiveBuffer.length}; expected ${EXPECTED_SIZE}`);
}

console.log(`Reconstructed canonical browser archive (${archiveBuffer.length} bytes)`);
new AdmZip(archiveBuffer).extractAllTo(root, true);
console.log('Extracted canonical browser sources');
