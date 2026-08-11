import fs from "node:fs";
import path from "node:path";
import { estimateTokens } from "../utils/tokens.js";

const nodeTypes = new Set(["start", "screen", "action", "decision", "backend_action", "success", "handled_error", "failure", "blocked"]);
const terminalTypes = new Set(["success", "handled_error", "failure", "blocked"]);

export function validateFeatureGraph(graph, policy = {}, options = {}) {
  const tokens = estimateTokens(JSON.stringify(compactFeatureGraphForBudget(graph)));
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

function compactFeatureGraphForBudget(graph) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return graph;
  return {
    feature_id: graph.feature_id,
    goal: graph.goal,
    nodes: graph.nodes,
    edges: graph.edges,
    error_nodes: graph.error_nodes,
    code_targets: graph.code_targets,
    target_rationale: graph.target_rationale,
    acceptance_checks: graph.acceptance_checks
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

export function createFeatureGraph({ goal, files = [], out = "chay-memory/feature_graph.json", featureId = "", fileMetadata = [], projectIndex = null }) {
  const id = featureIdFromGoal(featureId || goal || "feature");
  const codeTargets = [...new Set(files.map((file) => String(file || "").trim()).filter(Boolean))];
  const targetRationale = targetRationaleFromMetadata(codeTargets, fileMetadata);
  const folderStructure = folderStructureFromTargetsWithRationale(codeTargets, targetRationale);
  const projectStructure = projectStructureFromIndex(projectIndex, codeTargets);
  const apiGraph = apiGraphFromIndex(projectIndex, codeTargets, goal);
  const flow = featureFlowSpec(goal, codeTargets);
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
      "3. Read api_graph to understand API routes, handlers, and linked code.",
      "4. Read sequence_diagram / PlantUML before coding interactions.",
      "5. Edit only code_targets and preserve existing design patterns for maintainability and scale."
    ],
    folder_structure: folderStructure,
    project_structure: projectStructure,
    api_graph: apiGraph.mermaid,
    api_links: apiGraph.links,
    plantuml_api_graph: apiGraph.plantuml,
    target_rationale: targetRationale,
    nodes: flow.nodes,
    edges: flow.edges,
    error_nodes: flow.errorNodes,
    code_targets: codeTargets,
    user_flow: mermaidFlow(flow),
    sequence_diagram: mermaidSequence(goal, flow.kind),
    plantuml_flow: plantumlFlow(flow),
    plantuml_sequence: plantumlSequence(goal, flow.kind),
    acceptance_checks: flow.acceptanceChecks,
    mermaid: mermaidFlow(flow)
  };
}

export function featureIdFromGoal(value) {
  return slug(value || "feature");
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
    "",
    "## Selected Code Targets",
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

  const projectGroups = Array.isArray(graph?.project_structure) ? graph.project_structure : [];
  if (projectGroups.length > 0) {
    lines.push("## Project Folders", "");
    for (const group of projectGroups) {
      lines.push(`- ${group.folder}: ${group.file_count} files; roles: ${group.roles.join(", ") || "source"}`);
      if (group.examples?.length) lines.push(`  - Examples: ${group.examples.join(", ")}`);
    }
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
    `2. ${artifacts.featureFlow || "chay-structure/features/feature.md"}`,
    `3. ${artifacts.folderStructure || "chay-structure/folder_structure.md"}`,
    `4. ${artifacts.apiGraph || "chay-structure/api_graph.md"}`,
    `5. ${artifacts.graph || "chay-memory/feature_graph.json"}`,
    `6. ${artifacts.context || "chay-memory/context_package.json"}`,
    "7. Selected source files only",
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
    "## API Graph",
    "",
    "```mermaid",
    graph?.api_graph || "",
    "```",
    "",
    "## API Links",
    ""
  );

  for (const link of graph?.api_links || []) {
    lines.push(`- ${link.route || link.api}: ${link.api}`);
    if (link.related_code?.length) lines.push(`  - Related code: ${link.related_code.join(", ")}`);
    if (link.reason) lines.push(`  - Why: ${link.reason}`);
  }

  lines.push(
    "",
    "## PlantUML",
    "",
    `- ${artifacts.plantumlFlow || "chay-structure/diagrams/feature-user-flow.puml"}`,
    `- ${artifacts.plantumlSequence || "chay-structure/diagrams/feature-sequence.puml"}`,
    `- ${artifacts.plantumlApiGraph || "chay-structure/diagrams/feature-api-graph.puml"}`,
    "",
    "## Acceptance Checks",
    ""
  );

  for (const check of graph?.acceptance_checks || []) lines.push(`- ${check}`);
  lines.push("", "Rule: if selected files do not match the business goal, stop and ask for explicit `--files` instead of editing unrelated code.");
  return `${lines.join("\n")}\n`;
}

export function apiGraphMarkdown(graph, artifacts = {}) {
  const lines = [
    "# API Graph",
    "",
    `Feature: ${graph?.feature_id || ""}`,
    `Goal: ${graph?.goal || ""}`,
    "",
    "This document is generated from the whole project scan. It lists API entry points and code linked by imports or selected feature targets.",
    "",
    "## API Links",
    ""
  ];

  const links = Array.isArray(graph?.api_links) ? graph.api_links : [];
  if (links.length === 0) {
    lines.push("No API routes were detected from the project scan.");
  } else {
    for (const link of links) {
      lines.push(`- ${link.route || link.api}`);
      lines.push(`  - API file: ${link.api}`);
      if (link.related_code?.length) lines.push(`  - Related code: ${link.related_code.join(", ")}`);
      if (link.imports?.length) lines.push(`  - Imports: ${link.imports.join(", ")}`);
      if (link.reason) lines.push(`  - Why: ${link.reason}`);
    }
  }

  lines.push(
    "",
    "## Mermaid",
    "",
    "```mermaid",
    graph?.api_graph || "",
    "```",
    "",
    "## PlantUML",
    "",
    `- ${artifacts.plantumlApiGraph || "chay-structure/diagrams/feature-api-graph.puml"}`,
    ""
  );

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

function projectStructureFromIndex(projectIndex, codeTargets = []) {
  const files = Array.isArray(projectIndex?.files) ? projectIndex.files : [];
  const selected = new Set(codeTargets);
  const groups = new Map();
  for (const file of files) {
    const normalized = String(file.path || "").replace(/\\/g, "/");
    if (!normalized) continue;
    const folder = normalized.includes("/") ? normalized.split("/").slice(0, -1).join("/") : ".";
    if (!groups.has(folder)) {
      groups.set(folder, { folder, file_count: 0, roles: new Set(), examples: [], selected_files: [] });
    }
    const group = groups.get(folder);
    group.file_count += 1;
    if (file.role) group.roles.add(file.role);
    if (group.examples.length < 5) group.examples.push(normalized);
    if (selected.has(normalized)) group.selected_files.push(normalized);
  }
  return [...groups.values()]
    .sort((a, b) => a.folder.localeCompare(b.folder))
    .map((group) => ({
      folder: group.folder,
      file_count: group.file_count,
      roles: [...group.roles].sort(),
      examples: group.examples,
      selected_files: group.selected_files
    }));
}

function apiGraphFromIndex(projectIndex, codeTargets = [], goal = "") {
  const files = Array.isArray(projectIndex?.files) ? projectIndex.files : [];
  const byPath = new Map(files.map((file) => [String(file.path || "").replace(/\\/g, "/"), file]));
  const selected = new Set(codeTargets.map((file) => String(file).replace(/\\/g, "/")));
  const goalTerms = new Set(String(goal || "").toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word.length >= 3 && !["user", "the", "and", "for", "fix", "add", "new"].includes(word)));
  const apiFiles = files
    .filter((file) => file.role === "api_controller" || (Array.isArray(file.api_routes) && file.api_routes.length > 0))
    .map((file) => ({ ...file, path: String(file.path || "").replace(/\\/g, "/") }));

  const links = apiFiles.map((apiFile) => {
    const imports = Array.isArray(apiFile.imports) ? apiFile.imports : [];
    const resolvedImports = imports.map((item) => resolveImport(apiFile.path, item, byPath)).filter(Boolean);
    const matchedSelected = [...selected].filter((target) =>
      target === apiFile.path ||
      resolvedImports.includes(target) ||
      pathTermMatch(target, apiFile.path, goalTerms)
    );
    const route = Array.isArray(apiFile.api_routes) && apiFile.api_routes.length > 0 ? apiFile.api_routes[0] : apiFile.path;
    return {
      api: apiFile.path,
      route,
      related_code: [...new Set(matchedSelected)],
      imports: resolvedImports,
      reason: matchedSelected.length > 0 ? "Linked by selected feature targets, imports, or goal terms." : "API entry point detected from project scan."
    };
  });

  for (const target of selected) {
    if (byPath.has(target) || links.some((link) => link.api === target) || !isLikelyApiTarget(target)) continue;
    links.push({
      api: target,
      route: routeFromApiTarget(target),
      related_code: [target],
      imports: [],
      reason: "Selected or proposed API entry point from the feature contract."
    });
  }

  const visibleLinks = links.filter((link) => link.related_code.length > 0 || matchesGoal(link.api, goalTerms)).slice(0, 20);
  const finalLinks = visibleLinks.length > 0 ? visibleLinks : links.slice(0, 20);

  return {
    links: finalLinks,
    mermaid: mermaidApiGraph(finalLinks, codeTargets),
    plantuml: plantumlApiGraph(finalLinks, codeTargets)
  };
}

function mermaidApiGraph(links, codeTargets) {
  const lines = ["flowchart LR", "  user[User / Client]"];
  const seenCode = new Set();
  links.forEach((link, index) => {
    const apiId = `api_${index}`;
    lines.push(`  ${apiId}[${escapeMermaid(link.route || link.api)}]`);
    lines.push(`  user --> ${apiId}`);
    for (const code of link.related_code || []) {
      const codeId = `code_${slug(code)}`;
      if (!seenCode.has(codeId)) {
        lines.push(`  ${codeId}[${escapeMermaid(code)}]`);
        seenCode.add(codeId);
      }
      lines.push(`  ${apiId} --> ${codeId}`);
    }
  });
  if (links.length === 0) {
    for (const code of codeTargets || []) {
      const codeId = `code_${slug(code)}`;
      lines.push(`  user --> ${codeId}[${escapeMermaid(code)}]`);
    }
  }
  return lines.join("\n");
}

function plantumlApiGraph(links, codeTargets) {
  const lines = ["@startuml", "title API graph", "left to right direction", "actor User"];
  links.forEach((link, index) => {
    const apiId = `API_${index}`;
    lines.push(`rectangle "${plantText(link.route || link.api)}" as ${apiId}`);
    lines.push(`User --> ${apiId}`);
    for (const code of link.related_code || []) {
      const codeId = `CODE_${slug(code)}`;
      lines.push(`rectangle "${plantText(code)}" as ${codeId}`);
      lines.push(`${apiId} --> ${codeId}`);
    }
  });
  if (links.length === 0) {
    for (const code of codeTargets || []) {
      const codeId = `CODE_${slug(code)}`;
      lines.push(`rectangle "${plantText(code)}" as ${codeId}`);
      lines.push(`User --> ${codeId}`);
    }
  }
  lines.push("@enduml");
  return lines.join("\n");
}

function resolveImport(fromFile, importPath, byPath) {
  if (!importPath.startsWith(".")) return "";
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), importPath));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`
  ];
  return candidates.find((candidate) => byPath.has(candidate)) || "";
}

function pathTermMatch(target, apiPath, goalTerms) {
  if (goalTerms.size === 0) return false;
  const targetText = String(target || "").toLowerCase();
  const apiText = String(apiPath || "").toLowerCase();
  return [...goalTerms].some((term) => targetText.includes(term) && apiText.includes(term));
}

function matchesGoal(file, goalTerms) {
  if (goalTerms.size === 0) return false;
  const normalized = String(file || "").toLowerCase();
  return [...goalTerms].some((term) => normalized.includes(term));
}

function isLikelyApiTarget(file) {
  const normalized = String(file || "").replace(/\\/g, "/");
  return normalized.includes("netlify/functions/") ||
    normalized.includes("/api/") ||
    normalized.startsWith("api/") ||
    normalized.includes("/routes/") ||
    /(?:^|\/)route\.[cm]?[jt]sx?$/.test(normalized);
}

function routeFromApiTarget(file) {
  const normalized = String(file || "").replace(/\\/g, "/");
  if (normalized.startsWith("netlify/functions/")) {
    return `/.netlify/functions/${path.posix.basename(normalized).replace(/\.[^.]+$/, "")}`;
  }
  const apiIndex = normalized.indexOf("/api/");
  if (apiIndex >= 0) return `/api/${normalized.slice(apiIndex + 5).replace(/\.[^.]+$/, "")}`;
  if (normalized.startsWith("api/")) return `/api/${normalized.slice(4).replace(/\.[^.]+$/, "")}`;
  return normalized;
}

function featureFlowSpec(goal, codeTargets) {
  if (isApplyJobGoal(goal)) {
    return {
      kind: "apply_job",
      nodes: [
        { id: "start", label: "User opens job detail or jobs list", type: "start" },
        { id: "submit_application", label: "User clicks Apply to job", type: "action", code_targets: codeTargets },
        { id: "validate_auth", label: "Validate authenticated user", type: "decision" },
        { id: "validate_job", label: "Validate jobId and active job", type: "decision" },
        { id: "check_duplicate", label: "Check existing application", type: "decision" },
        { id: "create_application", label: "Create application with pending status", type: "backend_action", code_targets: codeTargets },
        { id: "success", label: "Application submitted with pending status", type: "success" },
        { id: "handled_error", label: "Show auth, validation, duplicate, or server error", type: "handled_error" }
      ],
      edges: [
        { from: "start", to: "submit_application" },
        { from: "submit_application", to: "validate_auth" },
        { from: "validate_auth", to: "handled_error", condition: "missing auth user" },
        { from: "validate_auth", to: "validate_job", condition: "authenticated" },
        { from: "validate_job", to: "handled_error", condition: "missing/invalid jobId or inactive job" },
        { from: "validate_job", to: "check_duplicate", condition: "job exists" },
        { from: "check_duplicate", to: "handled_error", condition: "application already exists" },
        { from: "check_duplicate", to: "create_application", condition: "not applied yet" },
        { from: "create_application", to: "success", condition: "insert succeeds" },
        { from: "create_application", to: "handled_error", condition: "database/API failure" }
      ],
      errorNodes: ["handled_error"],
      acceptanceChecks: [
        "Submitting requires an authenticated user.",
        "Submitting requires a valid jobId for an active job.",
        "Duplicate applications for the same user/job are blocked.",
        "Successful insert creates an application with status pending.",
        "Client receives a clear success response and handled error responses.",
        "Patch changes only graph code_targets unless the human expands scope."
      ]
    };
  }

  return {
    kind: "generic",
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
    errorNodes: ["handled_error"],
    acceptanceChecks: [
      "Success path reaches the success node.",
      "Known failure path reaches a handled_error/failure/blocked node.",
      "Patch changes only graph code_targets."
    ]
  };
}

function isApplyJobGoal(goal) {
  const words = new Set(String(goal || "").toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
  const hasJob = words.has("job") || words.has("jobs");
  const hasApply = words.has("apply") || words.has("applies") || words.has("applied") || words.has("application") || words.has("applications");
  return hasJob && hasApply;
}

export function mermaidSequence(goal, kind = "generic") {
  if (kind === "apply_job") {
    return [
      "sequenceDiagram",
      "  participant User",
      "  participant Client",
      "  participant API",
      "  participant Auth",
      "  participant DB",
      "  User->>Client: Click Apply on job",
      "  Client->>API: POST apply request with jobId",
      "  API->>Auth: Resolve authenticated user",
      "  Auth-->>API: userId or auth error",
      "  API->>DB: Validate active job",
      "  API->>DB: Check duplicate application",
      "  API->>DB: Insert application status=pending",
      "  DB-->>API: application record or error",
      "  API-->>Client: Success or handled error",
      "  Client-->>User: Show submitted/pending state"
    ].join("\n");
  }

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

export function plantumlSequence(goal, kind = "generic") {
  if (kind === "apply_job") {
    return [
      "@startuml",
      "title User applies to job sequence",
      "actor User",
      "participant Client",
      "participant API",
      "participant Auth",
      "database DB",
      "User -> Client: Click Apply on job",
      "Client -> API: POST apply request with jobId",
      "API -> Auth: Resolve authenticated user",
      "Auth --> API: userId or auth error",
      "API -> DB: Validate active job",
      "API -> DB: Check duplicate application",
      "API -> DB: Insert application status=pending",
      "DB --> API: application record or error",
      "API --> Client: Success or handled error",
      "Client --> User: Show submitted/pending state",
      "@enduml"
    ].join("\n");
  }

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
