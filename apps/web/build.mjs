import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(root, '../../dist/web');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(output, 'index.html'));
await cp(path.join(root, 'public/favicon.svg'), path.join(output, 'favicon.svg'));
await cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true });
await cp(path.join(root, 'app'), path.join(output, 'app'), { recursive: true });
console.log(`PayDrip static site built at ${output}`);
