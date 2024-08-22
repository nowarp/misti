import { report, runMistiCommand } from "./cli";

async function main() {
  const args = process.argv.slice(2);
  const result = await runMistiCommand(args);
  report(result);
}

main();
