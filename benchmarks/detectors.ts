import Benchmark from "benchmark";
import { executeMisti } from "../src/cli";

const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
  console.error("Error: No file path provided.");
  process.exit(1);
}

const suite = new Benchmark.Suite();

suite
  .add(`executeMisti --all-detectors ${filePath}`, {
    defer: true,
    async: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: async function (deferred: any) {
      await executeMisti(["--all-detectors", filePath]);
      deferred.resolve();
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .on("cycle", function (event: any) {
    console.log(String(event.target));
  })
  .on("complete", () => {})
  .run({ async: true });
