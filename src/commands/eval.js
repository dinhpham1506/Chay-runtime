import { buildEvalReport } from "../core/evalReport.js";
import { loadPolicy } from "../core/policy.js";

export async function evalReport() {
  console.log(JSON.stringify(buildEvalReport(loadPolicy()), null, 2));
}
