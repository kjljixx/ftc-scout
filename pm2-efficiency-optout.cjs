const { spawn } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'pm2-efficiency-optout.ps1');
console.log(`Spawning ${script} with windowsHide: true...`);

const child = spawn(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...process.argv.slice(2)],
  { windowsHide: true, stdio: 'inherit' }
);

child.on('close', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
