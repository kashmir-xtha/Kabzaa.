// Runs every tests/*.test.mjs file as its own process (via tsx) and prints
// a pass/fail summary. Usage: npm test (from server/), or directly:
//   npx tsx tests/run-all.mjs
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(dir, "..");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  try {
    execFileSync("npx", ["tsx", path.join(dir, file)], { stdio: "inherit", cwd: serverRoot });
  } catch {
    failed++;
  }
}

console.log(failed ? `\n${failed} of ${files.length} test file(s) FAILED.` : `\nAll ${files.length} test files passed.`);
process.exit(failed ? 1 : 0);
