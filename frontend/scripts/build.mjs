import { spawnSync } from 'node:child_process';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '--noEmit']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build']);
