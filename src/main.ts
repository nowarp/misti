import { handleMistiResult, runMistiCommand, resultToExitCode } from "./cli";

async function main() {
  const args = process.argv.slice(2);
  try {
    const result = await runMistiCommand(args);
    if (result) {
      const [driver, mistiResult] = result;
      handleMistiResult(driver, mistiResult);
      process.exit(resultToExitCode(mistiResult));
    }
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
