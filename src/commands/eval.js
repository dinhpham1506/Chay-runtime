import { buildEvalReport } from "../core/evalReport.js";
import { loadPolicy } from "../core/policy.js";
import { parseArgs } from "../utils/args.js";

export async function evalReport(argv = []) {
  const args = parseArgs(argv);
  console.log(JSON.stringify(buildEvalReport(loadPolicy(args.policy), {
    worker: args.worker,
    workFile: args.work,
    resultFile: args.result
  }), null, 2));
}
