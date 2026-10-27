import { spawnSync } from 'node:child_process';
const wrapper = process.env.HEADSTROKE_SIMULATOR;
const args = ['http://localhost:5173', ...process.argv.slice(2)];
const result = wrapper
  ? spawnSync(wrapper, args, { stdio: 'inherit' })
  : spawnSync(process.execPath, ['node_modules/@evenrealities/evenhub-simulator/bin/index.js', ...args], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
