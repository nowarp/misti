import { createGenerator } from "ts-json-schema-generator";
import * as fs from "fs";
import * as path from "path";

if (process.argv.length < 3) {
  console.error("USAGE: ts-node genJsonSchema.ts <output-filename>");
  console.error("Example: ts-node genJsonSchema.ts ./my-schema.json");
  process.exit(1);
}

const outputFile = process.argv[2];
const schema = createGenerator({
  path: path.resolve(__dirname, "../src/cli/result.ts"),
  type: "Result",
  tsconfig: path.resolve(__dirname, "../tsconfig.json"),
  expose: "export",
  topRef: true,
  jsDoc: "extended", // use docstrings
  skipTypeCheck: true,
  additionalProperties: true,
}).createSchema("Result");

const outputPath = path.resolve(outputFile);
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

console.log(`Schema for is generated at ${outputPath}`);
