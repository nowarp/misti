import {exec} from 'child_process';

function compileMisti() {
  return new Promise((resolve, reject) => {
    exec('tsc', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error during TypeScript compilation: ${stderr}`);
        return reject(error);
      }
      console.log(`TypeScript compilation output: ${stdout}`);
      resolve();
    });
  });
}

// Ensure TypeScript is compiled before running tests
beforeAll(async () => { await compileMisti(); });
