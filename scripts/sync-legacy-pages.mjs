import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');
const distDir = path.join(workspaceRoot, 'dist');
const generatedFiles = ['index.html', 'manifest.webmanifest', 'icon.svg', 'sw.js'];
const generatedDirectories = ['assets'];

for (const name of generatedFiles) {
  await rm(path.join(workspaceRoot, name), { force: true });
}

for (const name of generatedDirectories) {
  await rm(path.join(workspaceRoot, name), { recursive: true, force: true });
}

await mkdir(workspaceRoot, { recursive: true });

for (const name of generatedFiles) {
  await cp(path.join(distDir, name), path.join(workspaceRoot, name));
}

for (const name of generatedDirectories) {
  await cp(path.join(distDir, name), path.join(workspaceRoot, name), { recursive: true });
}
