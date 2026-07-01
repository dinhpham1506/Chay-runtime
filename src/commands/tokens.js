import { loadPolicy } from "../core/policy.js";
import { buildTokenReport } from "../core/tokenReport.js";

export async function tokenReport() {
  console.log(JSON.stringify(buildTokenReport(loadPolicy()), null, 2));
}
