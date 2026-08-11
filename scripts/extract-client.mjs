import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const archive = path.join(root, 'vendor', 'brasta-client-source.zip');
if (!fs.existsSync(archive)) throw new Error('Missing vendor/brasta-client-source.zip');
const zip = new AdmZip(archive);
zip.extractAllTo(root, true);
console.log('Extracted canonical browser sources from vendor/brasta-client-source.zip');
