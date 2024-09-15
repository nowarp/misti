import { report, runMistiCommand } from "./cli";

async function main() {
  const args = process.argv.slice(2);
  try {
    const result = await runMistiCommand(args);
    report(result);
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
