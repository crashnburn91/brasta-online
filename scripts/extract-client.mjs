import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const archive = path.join(root, 'vendor', 'brasta-client-source.zip');
if (!fs.existsSync(archive)) throw new Error('Missing Brasta client source archive');
const archiveBuffer = fs.readFileSync(archive);
console.log(`Using canonical browser archive (${archiveBuffer.length} bytes)`);
const zip = new AdmZip(archiveBuffer);
zip.extractAllTo(root, true);
console.log('Extracted canonical browser sources');
