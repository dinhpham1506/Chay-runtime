import { loadPolicy } from "../core/policy.js";
import { buildTokenReport } from "../core/tokenReport.js";
import { parseArgs } from "../utils/args.js";

export async function tokenReport(argv = []) {
  const args = parseArgs(argv);
  console.log(JSON.stringify(buildTokenReport(loadPolicy(args.policy), {
    worker: args.worker,
    workFile: args.work,
    resultFile: args.result
  }), null, 2));
}
