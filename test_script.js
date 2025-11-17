const { spawn } = require('child_process');

// Create a child process to run the main script
const child = spawn('node', ['src/index.js'], {
  cwd: '/run/media/kanz/248CF2218CF1ED64/Work/roll_updateVisionX',
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send responses to the prompts
let responsesSent = 0;

child.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);

  // Look for the prompts and respond accordingly
  if (output.includes('Jalankan proses Update Image? (y/n)')) {
    child.stdin.write('y\n');
    responsesSent++;
  } else if (output.includes('Jalankan proses Database? (y/n)')) {
    child.stdin.write('n\n');
    responsesSent++;
  } else if (output.includes('Jalankan proses Mirth? (y/n)')) {
    child.stdin.write('n\n');
    responsesSent++;
  } else if (output.includes('Jalankan proses Cleaner (Recount Instances)? (y/n)')) {
    child.stdin.write('n\n');
    responsesSent++;
  } else if (output.includes('Jalankan proses Cleaner (Patient Merge LENGKAP - PACS & DB)? (y/n)')) {
    child.stdin.write('n\n');
    responsesSent++;
    // After all responses, we can exit after a timeout
    setTimeout(() => {
      child.kill();
    }, 2000);
  }
});

child.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

child.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});