import { parseArgs } from "../utils/args.js";
import { progressSteps, writeProgressNote } from "../utils/progress.js";
import { defaultWorker } from "../core/host.js";

export async function updateProgress(argv) {
  const args = parseArgs(argv);
  const agent = args.agent || args.worker || defaultWorker();
  const step = args.step || "working";
  if (!progressSteps.includes(step)) throw new Error(`--step must be one of: ${progressSteps.join(", ")}`);

  const progress = writeProgressNote(agent, step, args.message || "", args.task || "");

  console.log(JSON.stringify({ ok: true, file: `memory/${agent}_progress.json`, progress }, null, 2));
}
