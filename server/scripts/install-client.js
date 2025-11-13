import { existsSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..', 'client');
const clientModulesDir = path.join(clientDir, 'node_modules');

const ensureModulePath = (moduleName) => {
  if (moduleName.startsWith('@')) {
    const [scope, name] = moduleName.split('/');
    return path.join(clientModulesDir, scope, name);
  }
  return path.join(clientModulesDir, moduleName);
};

const expectedModules = ['react', '@vitejs/plugin-react'];
const needsInstall = !existsSync(clientModulesDir) || expectedModules.some((moduleName) => !existsSync(ensureModulePath(moduleName)));

if (process.env.ORIGAMI_CLIENT_INSTALLING === '1') {
  console.log('[postinstall] Detected nested client install, skipping to avoid recursion.');
  process.exit(0);
}

if (!needsInstall) {
  console.log('[postinstall] Client dependencies already installed, skipping.');
  process.exit(0);
}

console.log('[postinstall] Installing client dependencies...');

const npmCli = process.env.npm_execpath;
const spawnCommand = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const spawnArgs = npmCli ? [npmCli, 'install'] : ['install'];

const result = spawnSync(spawnCommand, spawnArgs, {
  cwd: clientDir,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    ORIGAMI_CLIENT_INSTALLING: '1',
  },
});

if (result.error) {
  console.error('[postinstall] Failed to install client dependencies:', result.error.message);
  process.exit(result.status ?? 1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('[postinstall] Client dependencies installed successfully.');
