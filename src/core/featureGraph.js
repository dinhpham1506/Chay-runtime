import fs from "node:fs";
import path from "node:path";
import { estimateTokens } from "../utils/tokens.js";

const nodeTypes = new Set(["start", "screen", "action", "decision", "backend_action", "success", "handled_error", "failure", "blocked"]);
const terminalTypes = new Set(["success", "handled_error", "failure", "blocked"]);

export function validateFeatureGraph(graph, policy = {}, options = {}) {
  const tokens = estimateTokens(JSON.stringify(graph));
  const violations = [];

  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { ok: false, tokens, violations: [{ type: "graph_must_be_object" }] };
  }

  if (!stringField(graph.feature_id)) violations.push({ type: "missing_feature_id" });
  if (!stringField(graph.goal)) violations.push({ type: "missing_goal" });
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) violations.push({ type: "nodes_required" });
  if (!Array.isArray(graph.edges) || graph.edges.length === 0) violations.push({ type: "edges_required" });
  if (!Array.isArray(graph.folder_structure)) violations.push({ type: "folder_structure_required" });
  if (!stringField(graph.user_flow)) violations.push({ type: "user_flow_required" });
  if (!stringField(graph.sequence_diagram)) violations.push({ type: "sequence_diagram_required" });
  if (!stringField(graph.plantuml_flow)) violations.push({ type: "plantuml_flow_required" });
  if (!stringField(graph.plantuml_sequence)) violations.push({ type: "plantuml_sequence_required" });
  if (tokens > policy.maxNoteTokens) violations.push({ type: "graph_too_long", tokens, max: policy.maxNoteTokens });

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const ids = new Set();
  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      violations.push({ type: "invalid_node", node });
      continue;
    }
    if (!stringField(node.id)) violations.push({ type: "node_missing_id", node });
    if (!stringField(node.label)) violations.push({ type: "node_missing_label", node: node.id });
    if (!nodeTypes.has(node.type)) violations.push({ type: "invalid_node_type", node: node.id, allowed: [...nodeTypes] });
    if (ids.has(node.id)) violations.push({ type: "duplicate_node_id", node: node.id });
    ids.add(node.id);
  }

  for (const edge of edges) {
    if (!edge || typeof edge !== "object") {
      violations.push({ type: "invalid_edge", edge });
      continue;
    }
    if (!ids.has(edge.from)) violations.push({ type: "edge_from_unknown", edge });
    if (!ids.has(edge.to)) violations.push({ type: "edge_to_unknown", edge });
  }

  const startNodes = nodes.filter((node) => node.type === "start");
  if (startNodes.length !== 1) violations.push({ type: "exactly_one_start_node_required", count: startNodes.length });
  if (!nodes.some((node) => terminalTypes.has(node.type))) violations.push({ type: "terminal_node_required", allowed: [...terminalTypes] });

  for (const node of nodes.filter((item) => item.type === "decision")) {
    const outgoing = edges.filter((edge) => edge.from === node.id);
    if (outgoing.length < 2) violations.push({ type: "decision_needs_two_branches", node: node.id });
    for (const edge of outgoing) {
      if (!stringField(edge.condition)) violations.push({ type: "decision_edge_missing_condition", node: node.id, edge });
    }
  }

  const errorNodes = Array.isArray(graph.error_nodes) ? graph.error_nodes : [];
  for (const nodeId of errorNodes) {
    if (!ids.has(nodeId)) violations.push({ type: "error_node_unknown", node: nodeId });
  }

  const codeTargets = featureGraphCodeTargets(graph);
  if (codeTargets.length === 0) violations.push({ type: "code_targets_required" });
  for (const file of codeTargets) {
    if (path.isAbsolute(file) || file.includes("..")) violations.push({ type: "invalid_code_target_path", file });
    if (options.requireExistingFiles && !fs.existsSync(path.join(options.root || process.cwd(), file))) {
      violations.push({ type: "code_target_missing", file });
    }
  }

  return {
    ok: violations.length === 0,
    tokens,
    violations
  };
}

export function featureGraphCodeTargets(graph) {
  const rootTargets = Array.isArray(graph?.code_targets) ? graph.code_targets : [];
  const nodeTargets = Array.isArray(graph?.nodes) ? graph.nodes.flatMap((node) => Array.isArray(node.code_targets) ? node.code_targets : []) : [];
  return [...new Set([...rootTargets, ...nodeTargets].map((item) => String(item || "").trim()).filter(Boolean))];
}

export function featureGraphInput(file = "chay-memory/feature_graph.json") {
  return fs.existsSync(file) ? file : "";
}

export function createFeatureGraph({ goal, files = [], out = "chay-memory/feature_graph.json", featureId = "", fileMetadata = [] }) {
  const id = slug(featureId || goal || "feature");
  const codeTargets = [...new Set(files.map((file) => String(file || "").trim()).filter(Boolean))];
  const targetRationale = targetRationaleFromMetadata(codeTargets, fileMetadata);
  const folderStructure = folderStructureFromTargetsWithRationale(codeTargets, targetRationale);
  return {
    feature_id: id,
    goal,
    generated_at: new Date().toISOString(),
    contract: {
      source_of_truth: true,
      rule: "Workers must implement the feature graph, not rediscover the feature from source code."
    },
    implementation_order: [
      "1. Read folder_structure and keep the repository's current architecture boundaries.",
      "2. Read user_flow to understand product behavior and error branches.",
      "3. Read sequence_diagram / plantuml_sequence before coding interactions.",
      "4. Edit only code_targets and preserve existing design patterns for maintainability and scale."
    ],
    folder_structure: folderStructure,
    target_rationale: targetRationale,
    nodes: [
      { id: "start", label: "User starts feature flow", type: "start" },
      { id: "primary_action", label: goal || "Primary user action", type: "action", code_targets: codeTargets },
      { id: "success", label: "Expected success state", type: "success" },
      { id: "handled_error", label: "Handled error state", type: "handled_error" }
    ],
    edges: [
      { from: "start", to: "primary_action" },
      { from: "primary_action", to: "success", condition: "valid input and dependencies pass" },
      { from: "primary_action", to: "handled_error", condition: "validation or dependency failure" }
    ],
    error_nodes: ["handled_error"],
    code_targets: codeTargets,
    user_flow: mermaidFlow({
      nodes: [
        { id: "start", label: "User starts feature flow", type: "start" },
        { id: "primary_action", label: goal || "Primary user action", type: "action" },
        { id: "success", label: "Expected success state", type: "success" },
        { id: "handled_error", label: "Handled error state", type: "handled_error" }
      ],
      edges: [
        { from: "start", to: "primary_action" },
        { from: "primary_action", to: "success", condition: "valid" },
        { from: "primary_action", to: "handled_error", condition: "error" }
      ]
    }),
    sequence_diagram: mermaidSequence(goal),
    plantuml_flow: plantumlFlow({
      nodes: [
        { id: "start", label: "User starts feature flow", type: "start" },
        { id: "primary_action", label: goal || "Primary user action", type: "action" },
        { id: "success", label: "Expected success state", type: "success" },
        { id: "handled_error", label: "Handled error state", type: "handled_error" }
      ],
      edges: [
        { from: "start", to: "primary_action" },
        { from: "primary_action", to: "success", condition: "valid" },
        { from: "primary_action", to: "handled_error", condition: "error" }
      ]
    }),
    plantuml_sequence: plantumlSequence(goal),
    acceptance_checks: [
      "Success path reaches the success node.",
      "Known failure path reaches a handled_error/failure/blocked node.",
      "Patch changes only graph code_targets."
    ],
    mermaid: mermaidFlow({
      nodes: [
        { id: "start", label: "User starts feature flow", type: "start" },
        { id: "primary_action", label: goal || "Primary user action", type: "action" },
        { id: "success", label: "Expected success state", type: "success" },
        { id: "handled_error", label: "Handled error state", type: "handled_error" }
      ],
      edges: [
        { from: "start", to: "primary_action" },
        { from: "primary_action", to: "success", condition: "valid" },
        { from: "primary_action", to: "handled_error", condition: "error" }
      ]
    })
  };
}

export function folderStructureFromTargets(files) {
  return folderStructureFromTargetsWithRationale(files, []);
}

function folderStructureFromTargetsWithRationale(files, targetRationale = []) {
  const rationaleByPath = new Map(targetRationale.map((item) => [item.path, item]));
  const groups = new Map();
  for (const file of files) {
    const normalized = String(file || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (!normalized) continue;
    const folder = normalized.includes("/") ? normalized.split("/").slice(0, -1).join("/") : ".";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(normalized);
  }
  return [...groups.entries()].map(([folder, targets]) => ({
    folder,
    code_targets: targets,
    target_rationale: targets.map((target) => rationaleByPath.get(target)).filter(Boolean),
    rule: "Follow existing files in this folder before adding new structure."
  }));
}

export function folderStructureMarkdown(graph) {
  const lines = [
    "# Folder Structure",
    "",
    `Feature: ${graph?.feature_id || ""}`,
    `Goal: ${graph?.goal || ""}`,
    "",
    "Read this before editing. Preserve the existing folders and local design patterns.",
    ""
  ];

  const groups = Array.isArray(graph?.folder_structure) ? graph.folder_structure : [];
  if (groups.length === 0) {
    lines.push("No code targets selected yet. Run `cr go \"Task\" --files path/to/file.js` or edit `chay-memory/feature_graph.json` with explicit `code_targets`.");
    return `${lines.join("\n")}\n`;
  }

  for (const group of groups) {
    lines.push(`## ${group.folder || "."}`, "");
    for (const target of group.code_targets || []) {
      lines.push(`- ${target}`);
      const rationale = findTargetRationale(graph, target);
      if (rationale?.reason) lines.push(`  - Why: ${rationale.reason}`);
    }
    if (group.rule) lines.push("", `Rule: ${group.rule}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function featureFlowMarkdown(graph, artifacts = {}) {
  const lines = [
    "# Feature Flow",
    "",
    `Feature: ${graph?.feature_id || ""}`,
    `Goal: ${graph?.goal || ""}`,
    "",
    "## Read Order",
    "",
    `1. ${artifacts.handoff || "chay-memory/ai_handoff.json"}`,
    `2. ${artifacts.featureFlow || "chay-memory/feature_flow.md"}`,
    `3. ${artifacts.folderStructure || "chay-memory/folder_structure.md"}`,
    `4. ${artifacts.graph || "chay-memory/feature_graph.json"}`,
    `5. ${artifacts.context || "chay-memory/context_package.json"}`,
    "6. Selected source files only",
    "",
    "## Code Targets",
    ""
  ];

  const targets = Array.isArray(graph?.code_targets) ? graph.code_targets : [];
  if (targets.length === 0) {
    lines.push("No code targets selected. Provide explicit files with `cr go \"Task\" --files path/to/file.ts`.");
  } else {
    for (const target of targets) {
      lines.push(`- ${target}`);
      const rationale = findTargetRationale(graph, target);
      if (rationale?.reason) lines.push(`  - Why: ${rationale.reason}`);
    }
  }

  lines.push("", "## Folder Structure", "");
  for (const group of graph?.folder_structure || []) {
    lines.push(`### ${group.folder || "."}`, "");
    lines.push(group.rule || "Follow existing local pattern before editing.");
    lines.push("");
    for (const target of group.code_targets || []) lines.push(`- ${target}`);
    lines.push("");
  }

  lines.push(
    "## User Flow",
    "",
    "```mermaid",
    graph?.user_flow || graph?.mermaid || "",
    "```",
    "",
    "## Sequence",
    "",
    "```mermaid",
    graph?.sequence_diagram || "",
    "```",
    "",
    "## PlantUML",
    "",
    `- ${artifacts.plantumlFlow || "chay-memory/user_flow.puml"}`,
    `- ${artifacts.plantumlSequence || "chay-memory/sequence.puml"}`,
    "",
    "## Acceptance Checks",
    ""
  );

  for (const check of graph?.acceptance_checks || []) lines.push(`- ${check}`);
  lines.push("", "Rule: if selected files do not match the business goal, stop and ask for explicit `--files` instead of editing unrelated code.");
  return `${lines.join("\n")}\n`;
}

function targetRationaleFromMetadata(codeTargets, fileMetadata) {
  const metadataByPath = new Map((fileMetadata || []).map((file) => [file.path, file]));
  return codeTargets.map((target) => {
    const metadata = metadataByPath.get(target) || {};
    return {
      path: target,
      role: metadata.role || "",
      score: Number.isFinite(metadata.score) ? metadata.score : null,
      matched_terms: Array.isArray(metadata.matched_terms) ? metadata.matched_terms : [],
      reason: metadata.reason || "Explicitly provided as a code target."
    };
  });
}

function findTargetRationale(graph, target) {
  const topLevel = Array.isArray(graph?.target_rationale) ? graph.target_rationale : [];
  const found = topLevel.find((item) => item.path === target);
  if (found) return found;
  for (const group of graph?.folder_structure || []) {
    const groupFound = (group.target_rationale || []).find((item) => item.path === target);
    if (groupFound) return groupFound;
  }
  return null;
}

export function mermaidSequence(goal) {
  return [
    "sequenceDiagram",
    "  participant Human",
    "  participant IDE_AI",
    "  participant Runtime",
    "  participant Code",
    `  Human->>IDE_AI: ${escapeMermaid(goal || "Describe feature")}`,
    "  IDE_AI->>Runtime: Read chay-memory/ai_handoff.json",
    "  IDE_AI->>Runtime: Read feature_graph + work_note",
    "  IDE_AI->>Code: Edit only graph code_targets",
    "  IDE_AI->>Runtime: Write result_note JSON",
    "  Runtime-->>Human: Verify patch scope, docs, secrets, OWASP checks"
  ].join("\n");
}

export function plantumlFlow(graph) {
  const nodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const lines = ["@startuml", "title Feature user flow", "start"];
  for (const edge of graph.edges || []) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (from?.type === "start") {
      lines.push(`:${plantText(to?.label || edge.to)};`);
      continue;
    }
    const label = edge.condition ? ` (${plantText(edge.condition)})` : "";
    lines.push(`:${plantText(from?.label || edge.from)};`);
    lines.push(`:${plantText(to?.label || edge.to)}${label};`);
  }
  lines.push("stop", "@enduml");
  return lines.join("\n");
}

export function plantumlSequence(goal) {
  return [
    "@startuml",
    "title Feature coding sequence",
    "actor Human",
    "participant IDE_AI",
    "participant Runtime",
    "participant Code",
    `Human -> IDE_AI: ${plantText(goal || "Describe feature")}`,
    "IDE_AI -> Runtime: Read chay-memory/ai_handoff.json",
    "IDE_AI -> Runtime: Read feature_graph + work_note",
    "IDE_AI -> Code: Edit only graph code_targets",
    "IDE_AI -> Runtime: Write result_note JSON",
    "Runtime --> Human: Verify patch scope, docs, secrets, OWASP checks",
    "@enduml"
  ].join("\n");
}

export function mermaidFlow(graph) {
  const nodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const lines = ["flowchart TD"];
  for (const edge of graph.edges || []) {
    const from = mermaidNode(edge.from, nodes.get(edge.from));
    const to = mermaidNode(edge.to, nodes.get(edge.to));
    const label = edge.condition ? `|${escapeMermaid(edge.condition)}|` : "";
    lines.push(`  ${from} -->${label} ${to}`);
  }
  return lines.join("\n");
}

function mermaidNode(id, node = {}) {
  const label = escapeMermaid(node.label || id);
  if (node.type === "decision") return `${id}{${label}}`;
  if (terminalTypes.has(node.type)) return `${id}([${label}])`;
  return `${id}[${label}]`;
}

function escapeMermaid(value) {
  return String(value || "").replace(/[\[\]{}|]/g, " ").replace(/\s+/g, " ").trim();
}

function plantText(value) {
  return String(value || "").replace(/[;:{}]/g, " ").replace(/\s+/g, " ").trim();
}

function stringField(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function slug(value) {
  return String(value || "feature").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "feature";
}
