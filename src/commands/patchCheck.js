import { parseArgs } from "../utils/args.js";
import { readJson, readText } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { analyzeDiff, validateDiff } from "../core/diff.js";

export async function checkPatch(argv) {
  const args = parseArgs(argv);
  if (!args.diff) throw new Error("--diff is required");
  if (!args.work) throw new Error("--work is required");

  const policy = loadPolicy(args.policy);
  const work = readJson(args.work);
  const diffText = readText(args.diff);

  const analysis = analyzeDiff(diffText);
  const result = validateDiff(analysis, work, policy, diffText);

  console.log(JSON.stringify({
    ok: result.ok,
    analysis,
    violations: result.violations,
    next_action: result.ok ? "allow_patch_review" : "reject_patch_and_request_smaller_fix"
  }, null, 2));

  if (!result.ok) process.exitCode = 2;
}
