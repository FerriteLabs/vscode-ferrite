const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');

const bundlePath = resolve(__dirname, '..', 'out', 'extension.js');
const bundle = readFileSync(bundlePath, 'utf8');

if (/require\((['"])ioredis\1\)/.test(bundle)) {
  throw new Error('out/extension.js still requires external ioredis');
}

if (!bundle.includes('ioredis')) {
  throw new Error('out/extension.js does not contain the bundled ioredis runtime');
}

console.log('Verified bundled VS Code runtime dependencies.');
