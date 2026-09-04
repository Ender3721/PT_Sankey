import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const configHome = resolve('.wrangler-config');
mkdirSync(configHome, { recursive: true });

const wranglerCli = resolve('node_modules', 'wrangler', 'bin', 'wrangler.js');

const child = spawn(
  process.execPath,
  [
    wranglerCli,
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    '3000',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      WRANGLER_SEND_METRICS: 'false',
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
