import Benchmark from "benchmark";
import { executeMisti } from "../src/cli";
import { getAllDetectors } from "../src/detectors/detector";

const ALL_DETECTORS_NAME = "All Detectors";

const args = process.argv.slice(2);
const filePath = args[0];
const showProgress = args.includes("--progress");

if (!filePath || filePath === "--progress") {
  console.error("Error: No contract provided.");
  console.error("Usage: ts-node benchmark/detectors.ts <contract.tact>");
  process.exit(1);
}

const suite = new Benchmark.Suite();
const results: { name: string; result: string }[] = [];

// Add the benchmark for --all-detectors
suite.add(ALL_DETECTORS_NAME, {
  defer: true,
  async: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: async function (deferred: any) {
    await executeMisti(["--all-detectors", filePath]);
    deferred.resolve();
  },
});

// Add benchmarks for each individual detector
getAllDetectors().forEach((detectorName) => {
  suite.add(`${detectorName}`, {
    defer: true,
    async: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: async function (deferred: any) {
      await executeMisti([`-de`, detectorName, filePath]);
      deferred.resolve();
    },
  });
});

suite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .on("cycle", function (event: any) {
    if (showProgress) {
      console.log(String(event.target));
    }
    const name =
      event.target.name === ALL_DETECTORS_NAME
        ? `**${event.target.name}**`
        : `\`${event.target.name}\``;
    const result = [
      `${event.target.hz.toFixed(2)} ops/sec`,
      `(~${(event.target.stats.mean * 1000).toFixed(2)} ms/run)`,
      `±${event.target.stats.rme.toFixed(2)}%`,
    ].join(" ");
    results.push({ name, result });
  })
  .on("complete", () => {
    console.log("| Detector Name | Result |");
    console.log("|---------------|--------|");
    results.forEach(({ name, result }) => {
      console.log(`| ${name} | ${result} |`);
    });
  })
  .run({ async: true });
