import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, writeJson } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { estimateTokens } from "../utils/tokens.js";

export async function snapshotExperience(argv) {
  const args = parseArgs(argv);
  const out = args.out || "memory/experience_spectrum.json";
  const snapshot = buildExperienceSnapshot(args);
  writeJson(out, snapshot);
  console.log(JSON.stringify({ ok: true, out, spectrum: snapshot.spectrum, usage: snapshot.usage }, null, 2));
}

function buildExperienceSnapshot(args) {
  const policyFile = args.policy || "policies/chay_policy.json";
  const policy = loadPolicy(policyFile);
  const host = optionalJson("memory/host_config.json") || {};
  const context = optionalJson("memory/context_package.json") || {};
  const ledger = optionalJson("memory/plan_ledger.json") || null;
  const resultNotes = readMemoryNotes("result");
  const workNotes = readMemoryNotes("work");
  const skills = collectSkills(host, workNotes, policy);

  return {
    generated_at: new Date().toISOString(),
    framework: "experience_compression_spectrum_v1",
    source: {
      paper: "Experience Compression Spectrum: Unifying Memory, Skills, and Rules in LLM Agents",
      url: "https://arxiv.org/abs/2604.15877"
    },
    spectrum: {
      memory: {
        purpose: "episodic task state and outcomes",
        compression_target: "5-20x",
        refs: [
          "memory/task_note.json",
          "memory/context_package.json",
          ...(ledger ? ["memory/plan_ledger.json"] : []),
          ...resultNotes.map((note) => `memory/${note.file}`)
        ],
        selected_files: (context.selected_files || []).map((file) => ({
          path: file.path,
          role: file.role,
          score: file.score
        })),
        steps_done: ledger?.steps_done || []
      },
      skills: {
        purpose: "procedural hints for how workers should act",
        compression_target: "50-500x",
        items: skills
      },
      rules: {
        purpose: "highly compressed declarative constraints",
        compression_target: "1000x+",
        policy_ref: policyFile,
        architecture_rule_count: (policy.architectureRules || []).length,
        minimal_patch_rule_count: (policy.minimalPatchRules || []).length,
        forbidden_pattern_count: (policy.forbiddenPatterns || []).length,
        budgets: {
          maxNoteTokens: policy.maxNoteTokens,
          maxResultTokens: policy.maxResultTokens,
          maxChangedFiles: policy.maxChangedFiles,
          maxTotalDiffLines: policy.maxTotalDiffLines
        }
      }
    },
    usage: [
      "Run context plan with a small --max-notes value.",
      "Create compact work notes with cr workpack make --compact.",
      "Workers read memory refs and allowed_files; they do not read audit markdown, raw logs, or full history.",
      "Runtime dispatch writes plan_ledger only after result validation and patch check pass.",
      "Use policy_ref for rules instead of copying long policy text into every work note."
    ],
    estimates: estimateSnapshotTokens({ context, ledger, resultNotes, skills, policy })
  };
}

function readMemoryNotes(kind) {
  if (!fs.existsSync("memory")) return [];
  return fs.readdirSync("memory")
    .filter((file) => file.endsWith(".json") && file.includes(kind))
    .map((file) => ({ file, data: optionalJson(path.join("memory", file)) }))
    .filter((note) => note.data);
}

function collectSkills(host, workNotes, policy) {
  const fromHost = [
    ...(host.skills || []),
    ...((host.workers || []).flatMap((worker) => worker.skills || []))
  ];
  const fromWork = workNotes.flatMap((note) => note.data.skills || []);
  return [...new Set([...fromHost, ...fromWork, ...(policy.agentSkills || [])])];
}

function estimateSnapshotTokens({ context, ledger, resultNotes, skills, policy }) {
  const memoryTokens = estimateTokens(JSON.stringify({
    task: context.task,
    selected_files: context.selected_files || [],
    steps_done: ledger?.steps_done || [],
    results: resultNotes.map((note) => ({
      worker: note.data.worker,
      status: note.data.status,
      summary: note.data.summary,
      findings: note.data.findings
    }))
  }));
  const skillTokens = estimateTokens(JSON.stringify(skills));
  const ruleTokens = estimateTokens(JSON.stringify({
    budgets: {
      maxNoteTokens: policy.maxNoteTokens,
      maxResultTokens: policy.maxResultTokens,
      maxChangedFiles: policy.maxChangedFiles
    },
    refs: ["policy_ref"]
  }));
  return {
    memory_tokens: memoryTokens,
    skill_tokens: skillTokens,
    rule_tokens: ruleTokens,
    total_tokens: memoryTokens + skillTokens + ruleTokens
  };
}

function optionalJson(file) {
  try {
    return exists(file) ? readJson(file) : null;
  } catch {
    return null;
  }
}
