const { spawn } = require('child_process');

const scriptName = process.argv[2];

if (!scriptName) {
  console.error("Please specify an npm script to run (e.g. node pm2-run.cjs common:watch)");
  process.exit(1);
}

console.log(`Spawning npm run ${scriptName} with windowsHide: true...`);

const child = spawn('npm', ['run', scriptName], {
  shell: true,
  windowsHide: true,
  stdio: 'inherit'
});

child.on('close', (code) => {
  process.exit(code || 0);
});
