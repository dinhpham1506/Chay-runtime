import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandForAgent } from "../src/core/engineAdapters.js";
import { analyzeDiff, validateDiff } from "../src/core/diff.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "cr.js");
const project = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-smoke-"));

assert.deepEqual(commandForAgent("codex", { prompt: "hi", model: "gpt-5" }).args, ["exec", "--model", "gpt-5", "hi"]);
assert.deepEqual(commandForAgent("claude", { prompt: "hi", worker: "codex", model: "sonnet" }).args, ["-p", "hi", "--agent", "chay-codex-worker", "--model", "sonnet"]);
assert.equal(commandForAgent("anti", { promptFile: "prompt.txt", model: "gemini-pro" }), null);

const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
assert.ok(readme.includes("site/assets/chay-logo.svg"));
assert.ok(readme.includes("https://dinhpham1506.github.io/Chay-runtime/"));
assert.ok(readme.includes("## Quickstart"));
assert.ok(readme.includes("## What This Repo Does"));
assert.ok(readme.includes("Admin changes user role"));
assert.ok(readme.includes("chay-structure/features/<feature_id>.md"));
assert.ok(readme.includes("chay-memory/ai_handoff.json"));
assert.ok(readme.includes("Diff boundary check"));
assert.ok(readme.includes("Continue existing feature"));
assert.ok(readme.includes("Add or change feature"));
assert.ok(readme.includes("Verify AI edit"));
assert.ok(readme.includes("feature memory before code, feature boundary after code"));
assert.ok(readme.includes("docs/start.md"));
assert.ok(readme.includes("docs/setup-legacy.md"));
assert.ok(readme.includes("CHANGELOG.md"));
assert.ok(readme.includes("CONTRIBUTING.md"));
const changelog = fs.readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");
assert.ok(changelog.includes("## [Unreleased]"));
assert.ok(changelog.includes("## [0.1.0] - 2026-08-15"));
assert.ok(changelog.includes("Inferred Runtime Sequence"));
assert.ok(changelog.includes("runtime guardrail, not absolute containment"));
const startDocs = fs.readFileSync(path.join(repoRoot, "docs", "start.md"), "utf8");
assert.ok(startDocs.includes("recommended entry point"));
assert.ok(startDocs.includes("cr verify"));
const legacyDocs = fs.readFileSync(path.join(repoRoot, "docs", "setup-legacy.md"), "utf8");
assert.ok(legacyDocs.includes("Use this only"));
assert.ok(legacyDocs.includes("Antigravity automation as best-effort"));
assert.ok(fs.existsSync(path.join(repoRoot, "CONTRIBUTING.md")));
assert.ok(fs.existsSync(path.join(repoRoot, ".github", "ISSUE_TEMPLATE", "bug_report.md")));
assert.ok(fs.existsSync(path.join(repoRoot, ".github", "ISSUE_TEMPLATE", "feature_request.md")));

const deletedSecretDiff = [
  "diff --git a/secrets/.env b/secrets/.env",
  "deleted file mode 100644",
  "--- a/secrets/.env",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-SECRET_KEY=leaked",
  ""
].join("\n");
const deletedSecretAnalysis = analyzeDiff(deletedSecretDiff);
assert.ok(deletedSecretAnalysis.changedFiles.includes("secrets/.env"));
const deletedSecretValidation = validateDiff(deletedSecretAnalysis, { allowed_files: ["src/applyService.js"] }, {
  maxChangedFiles: 6,
  maxAddedLines: 300,
  maxDeletedLines: 200,
  maxTotalDiffLines: 500,
  humanOwnedPaths: [],
  sensitivePaths: ["secrets/"],
  forbiddenPatterns: []
}, deletedSecretDiff);
assert.ok(deletedSecretValidation.violations.some((item) => item.type === "changed_file_outside_scope"));
assert.ok(deletedSecretValidation.violations.some((item) => item.type === "sensitive_path_change_blocked"));

assert.ok(fs.existsSync(path.join(repoRoot, "site", "console.html")));
assert.ok(!fs.readFileSync(path.join(repoRoot, "src", "commands", "ui.js"), "utf8").includes("function html()"));

fs.mkdirSync(path.join(project, "src"), { recursive: true });
fs.writeFileSync(path.join(project, "src", "applyService.js"), [
  "export function canApply(userId, jobId) {",
  "  return Boolean(userId && jobId);",
  "}",
  ""
].join("\n"));

const genericProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-generic-"));
fs.mkdirSync(path.join(genericProject, "src"), { recursive: true });
fs.writeFileSync(path.join(genericProject, "src", "genericService.js"), "export const generic = true;\n");
runIn(genericProject, "setup", "--agents", "claude,antigravity", "--main", "antigravity", "--workers", "claude");
runIn(genericProject, "workpack", "make", "--goal", "Generic worker task", "--allowed-files", "src/genericService.js");
const genericHost = JSON.parse(fs.readFileSync(path.join(genericProject, "chay-memory", "host_config.json"), "utf8"));
const genericWork = JSON.parse(fs.readFileSync(path.join(genericProject, "chay-memory", "claude_work_note.json"), "utf8"));
assert.deepEqual(genericHost.main, { agent: "antigravity", llm: "user-selected" });
assert.equal(genericHost.workers[0].agent, "claude");
assert.equal(genericWork.assigned_to, "claude");
assert.ok(fs.existsSync(path.join(genericProject, ".claude", "agents", "chay-claude-worker.md")));
assert.ok(fs.readFileSync(path.join(genericProject, ".claude", "agents", "chay-main.md"), "utf8").includes("chay-claude-worker"));

const aliasProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-alias-"));
runIn(aliasProject, "setup", "--agents", "codex,anti", "--main", "anti");
const aliasHost = JSON.parse(fs.readFileSync(path.join(aliasProject, "chay-memory", "host_config.json"), "utf8"));
assert.deepEqual(aliasHost.enabled_agents, ["codex", "antigravity"]);
assert.deepEqual(aliasHost.main, { agent: "antigravity", llm: "user-selected" });
assert.equal(aliasHost.workers[0].agent, "codex");
const startProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-start-"));
const started = runIn(startProject, "start", "--agent", "codex,anti", "--main", "codex", "--skip-login");
assert.equal(started.message, "Chạy Runtime started");
assert.equal(started.mode, "external_ide_ai");
assert.deepEqual(started.targets, ["codex", "antigravity"]);
assert.ok(Array.isArray(started.available_cli_agents));
assert.ok(fs.existsSync(path.join(startProject, "chay-memory", "ide_config.json")));
assert.ok(fs.existsSync(path.join(startProject, "chay-memory", "rules", "chay-runtime.md")));
assert.ok(fs.existsSync(path.join(startProject, ".cursor", "rules", "chay-runtime.mdc")));
assert.ok(fs.existsSync(path.join(startProject, ".github", "instructions", "chay-runtime.instructions.md")));
assert.ok(fs.existsSync(path.join(startProject, ".kiro", "steering", "chay-runtime.md")));
assert.ok(fs.existsSync(path.join(startProject, ".windsurf", "rules", "chay-runtime.md")));
assert.ok(fs.existsSync(path.join(startProject, ".codex", "rules", "chay-runtime.md")));
assert.ok(!fs.existsSync(path.join(startProject, "chay-memory", "host_config.json")));
assert.ok(!fs.existsSync(path.join(startProject, ".chay", "policies")));
assert.ok(!fs.existsSync(path.join(startProject, ".chay", "schemas")));
assert.ok(!fs.existsSync(path.join(startProject, "policies")));
assert.ok(!fs.existsSync(path.join(startProject, "schemas")));
assert.ok(!fs.existsSync(path.join(startProject, ".chay-index")));
assert.ok(!fs.existsSync(path.join(startProject, "audit")));
assert.ok(!fs.existsSync(path.join(startProject, ".chay", "audit")));
runIn(startProject, "integration", "install", "--target", "anti");
assert.ok(fs.existsSync(path.join(startProject, "CHAY_ANTIGRAVITY_INSTRUCTIONS.md")));
const graphProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-graph-"));
fs.mkdirSync(path.join(graphProject, "src"), { recursive: true });
fs.writeFileSync(path.join(graphProject, "src", "applyService.js"), "export const apply = true;\n");
runIn(graphProject, "setup", "--agents", "codex,anti", "--main", "codex");
const graphCreated = runIn(graphProject, "graph", "Fix duplicate apply service", "--files", "src/applyService.js", "--require-existing");
assert.equal(graphCreated.ok, true);
runIn(graphProject, "boundary", "check-graph", "--file", "chay-memory/feature_graph.json", "--require-existing");
const featureGraph = JSON.parse(fs.readFileSync(path.join(graphProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.ok(featureGraph.plantuml_flow.includes("@startuml"));
assert.ok(featureGraph.plantuml_sequence.includes("@startuml"));
assert.deepEqual(featureGraph.folder_structure[0].code_targets, ["src/applyService.js"]);
assert.ok(fs.readFileSync(path.join(graphProject, "chay-structure", "folder_structure.md"), "utf8").includes("src/applyService.js"));
assert.ok(fs.readFileSync(path.join(graphProject, "chay-structure", "features", "fix_duplicate_apply_service.md"), "utf8").includes("src/applyService.js"));
assert.ok(fs.readFileSync(path.join(graphProject, "chay-structure", "api_graph.md"), "utf8").includes("src/applyService.js"));
assert.ok(fs.existsSync(path.join(graphProject, "chay-structure", "diagrams", "fix_duplicate_apply_service-user-flow.puml")));
assert.ok(fs.existsSync(path.join(graphProject, "chay-structure", "diagrams", "fix_duplicate_apply_service-sequence.puml")));
assert.ok(fs.existsSync(path.join(graphProject, "chay-structure", "diagrams", "fix_duplicate_apply_service-api-graph.puml")));
runIn(graphProject, "task", "--from-graph", "chay-memory/feature_graph.json", "--compact");
const graphWork = JSON.parse(fs.readFileSync(path.join(graphProject, "chay-memory", "antigravity_work_note.json"), "utf8"));
assert.equal(graphWork.feature_graph.source_of_truth, true);
assert.deepEqual(graphWork.feature_graph.code_targets, ["src/applyService.js"]);
assert.deepEqual(graphWork.allowed_files, ["src/applyService.js"]);
const handoff = runIn(graphProject, "handoff", "--worker", "antigravity");
assert.equal(handoff.ok, true);
assert.ok(handoff.read_order.includes("chay-memory/ai_handoff.json"));
assert.deepEqual(handoff.relevant_files.graph_code_targets, ["src/applyService.js"]);
const handoffFile = JSON.parse(fs.readFileSync(path.join(graphProject, "chay-memory", "ai_handoff.json"), "utf8"));
assert.ok(handoffFile.read_order.includes("chay-structure/features/fix_duplicate_apply_service.md"));
assert.ok(handoffFile.read_order.includes("chay-structure/folder_structure.md"));
assert.ok(handoffFile.read_order.includes("chay-structure/api_graph.md"));
assert.ok(handoffFile.guardrails.some((item) => item.includes("Do not delete existing behavior")));
assert.equal(handoffFile.owasp_api_review.length, 10);
assert.ok(handoffFile.source_of_truth.plantuml_sequence.includes("@startuml"));
assert.ok(handoffFile.source_of_truth.implementation_order[0].includes("folder_structure"));
const goProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-go-"));
fs.mkdirSync(path.join(goProject, "src"), { recursive: true });
fs.writeFileSync(path.join(goProject, "src", "applyService.js"), "export const apply = true;\n");
runIn(goProject, "setup", "--agents", "codex,anti", "--main", "codex");
const ideConfig = runIn(goProject, "config", "codex,claude,anti,github-copilot,cursor,kiro");
assert.equal(ideConfig.mode, "external_ide_ai");
assert.ok(fs.existsSync(path.join(goProject, ".chay", "ide", "CHAY_IDE_INSTRUCTIONS.md")));
assert.ok(ideConfig.rule_pack.includes("chay-memory/rules/chay-runtime.md"));
assert.ok(fs.readFileSync(path.join(goProject, "chay-memory", "rules", "chay-runtime.md"), "utf8").includes("Existing Vs New Feature Rule"));
assert.deepEqual(ideConfig.targets, ["codex", "claude", "antigravity", "github-copilot", "cursor", "kiro"]);
const ideCheck = runIn(goProject, "config", "check");
assert.equal(ideCheck.configured.configured, true);
const ruleInstall = runIn(goProject, "rules", "install");
assert.equal(ruleInstall.ok, true);
assert.ok(ruleInstall.installed.includes(".codex/rules/chay-runtime.md"));
const fakeCodexHome = path.join(goProject, "fake-codex-home");
const codexSkillInstall = runIn(goProject, "rules", "install", "--codex-skill", "--codex-home", fakeCodexHome);
assert.equal(codexSkillInstall.ok, true);
assert.equal(codexSkillInstall.codex_skill.skill, "chay-runtime");
assert.ok(fs.existsSync(path.join(fakeCodexHome, "skills", "chay-runtime", "SKILL.md")));
assert.ok(fs.readFileSync(path.join(fakeCodexHome, "skills", "chay-runtime", "SKILL.md"), "utf8").includes("description: Use when working in a repository that contains Chay Runtime"));
const fakeChatCodexHome = path.join(goProject, "fake-chat-codex-home");
const chatInstall = runIn(goProject, "chat", "install", "--target", "codex", "--codex-home", fakeChatCodexHome);
assert.equal(chatInstall.ok, true);
assert.equal(chatInstall.mode, "direct_chatbot_install");
assert.equal(chatInstall.target, "codex");
assert.equal(chatInstall.codex_skill.skill, "chay-runtime");
assert.ok(chatInstall.usage_options.some((option) => option.name === "Direct chatbot"));
assert.ok(fs.existsSync(path.join(fakeChatCodexHome, "skills", "chay-runtime", "SKILL.md")));
const cursorChatInstall = runIn(goProject, "chatbot", "install", "--target", "cursor");
assert.equal(cursorChatInstall.ok, true);
assert.equal(cursorChatInstall.alias_used, "chatbot");
assert.equal(cursorChatInstall.target, "cursor");
assert.equal(cursorChatInstall.codex_skill, null);
const goResult = runIn(goProject, "go", "Fix duplicate apply service", "--files", "src/applyService.js");
assert.equal(goResult.ok, true);
assert.ok(fs.existsSync(path.join(goProject, "chay-memory", "feature_graph.json")));
assert.ok(fs.existsSync(path.join(goProject, "chay-structure", "features", "fix_duplicate_apply_service.md")));
assert.ok(fs.existsSync(path.join(goProject, "chay-structure", "folder_structure.md")));
assert.ok(fs.existsSync(path.join(goProject, "chay-structure", "api_graph.md")));
assert.ok(fs.existsSync(path.join(goProject, "chay-structure", "diagrams", "fix_duplicate_apply_service-user-flow.puml")));
assert.ok(fs.existsSync(path.join(goProject, "chay-structure", "diagrams", "fix_duplicate_apply_service-sequence.puml")));
assert.ok(fs.existsSync(path.join(goProject, "chay-structure", "diagrams", "fix_duplicate_apply_service-api-graph.puml")));
assert.ok(fs.existsSync(path.join(goProject, "chay-memory", "ai_handoff.json")));
assert.equal(goResult.feature_flow, "chay-structure/features/fix_duplicate_apply_service.md");
assert.equal(goResult.feature_md, "chay-structure/features/fix_duplicate_apply_service.md");
assert.equal(goResult.folder_structure, "chay-structure/folder_structure.md");
assert.equal(goResult.api_graph, "chay-structure/api_graph.md");
assert.equal(JSON.parse(fs.readFileSync(path.join(goProject, "chay-memory", "antigravity_work_note.json"), "utf8")).allowed_files[0], "src/applyService.js");
const applyJobProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-apply-job-"));
fs.mkdirSync(path.join(applyJobProject, "netlify", "functions"), { recursive: true });
fs.mkdirSync(path.join(applyJobProject, "client", "src", "components"), { recursive: true });
fs.mkdirSync(path.join(applyJobProject, "client", "src", "lib"), { recursive: true });
fs.mkdirSync(path.join(applyJobProject, "server", "src", "api"), { recursive: true });
fs.mkdirSync(path.join(applyJobProject, "server", "src", "scripts"), { recursive: true });
fs.mkdirSync(path.join(applyJobProject, "migrations"), { recursive: true });
fs.writeFileSync(path.join(applyJobProject, "client", "src", "components", "AdminDashboard.tsx"), "export function AdminDashboard() { return null; }\n");
fs.writeFileSync(path.join(applyJobProject, "client", "src", "lib", "api.ts"), "export async function api() { return true; }\n");
fs.writeFileSync(path.join(applyJobProject, "server", "src", "api", "admin.ts"), "export function changeUserRole() { return true; }\n");
fs.writeFileSync(path.join(applyJobProject, "server", "src", "scripts", "import-jobfree-pnl.ts"), "export const pnl = true;\n");
fs.writeFileSync(path.join(applyJobProject, "netlify", "functions", "admin-announcements.ts"), "export const announcements = true;\n");
fs.writeFileSync(path.join(applyJobProject, "netlify", "functions", "admin-usage.ts"), "export const usage = true;\n");
fs.writeFileSync(path.join(applyJobProject, "netlify", "functions", "admin-users.ts"), "export const adminUsers = true;\n");
fs.writeFileSync(path.join(applyJobProject, "netlify", "functions", "admin-users-invite.ts"), "export const inviteUser = true;\n");
fs.writeFileSync(path.join(applyJobProject, "netlify", "functions", "admin-users-role.ts"), "export const userRole = true;\n");
fs.writeFileSync(path.join(applyJobProject, "migrations", "12-04-26-1456-update-user-status-and-add-teams.sql"), "-- user/team migration\n");
runIn(applyJobProject, "start", "--agent", "codex");
const applyJob = runIn(applyJobProject, "go", "User applies to job", "client/src/lib/api.ts");
assert.equal(applyJob.task, "User applies to job");
assert.ok(applyJob.selected_files.includes("client/src/lib/api.ts"));
assert.ok(applyJob.selected_files.includes("netlify/functions/job-applications.ts"));
assert.ok(!applyJob.selected_files.some((file) => file.includes("admin-users")));
assert.ok(!applyJob.selected_files.some((file) => file.includes("import-jobfree-pnl")));
assert.ok(fs.existsSync(path.join(applyJobProject, "chay-structure", "features", "user_applies_to_job.md")));
assert.ok(fs.existsSync(path.join(applyJobProject, "chay-structure", "api_graph.md")));
assert.ok(fs.existsSync(path.join(applyJobProject, "chay-structure", "diagrams", "user_applies_to_job-api-graph.puml")));
const applyJobGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.ok(applyJobGraph.nodes.some((node) => node.id === "check_duplicate"));
assert.ok(applyJobGraph.acceptance_checks.some((check) => check.includes("pending")));
assert.ok(applyJobGraph.api_links.some((link) => link.api === "netlify/functions/job-applications.ts" && link.related_code.includes("netlify/functions/job-applications.ts")));
assert.ok(!applyJobGraph.api_links.some((link) => link.api.includes("admin-users") && link.related_code.length > 0));
const applyJobDuplicateBranch = runIn(applyJobProject, "go", "User applies to job blocks duplicate applications");
assert.equal(applyJobDuplicateBranch.mode, "update_feature");
assert.equal(applyJobDuplicateBranch.feature_id, "user_applies_to_job");
assert.equal(applyJobDuplicateBranch.matched_existing_feature, "user_applies_to_job");
assert.equal(applyJobDuplicateBranch.feature_md, "chay-structure/features/user_applies_to_job.md");
assert.ok(!fs.existsSync(path.join(applyJobProject, "chay-structure", "features", "user_applies_to_job_blocks_duplicate_applications.md")));
const explicitFeatureUpdate = runIn(applyJobProject, "go", "blocks duplicate applications", "--feature", "user_applies_to_job");
assert.equal(explicitFeatureUpdate.mode, "update_feature");
assert.equal(explicitFeatureUpdate.feature_id, "user_applies_to_job");
const explicitFeatureGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.ok(explicitFeatureGraph.goal.includes("User applies to job"));
assert.ok(explicitFeatureGraph.goal.includes("blocks duplicate applications"));
assert.ok(explicitFeatureGraph.nodes.some((node) => node.id === "check_duplicate"));
const applyJobBaseAgain = runIn(applyJobProject, "go", "User applies to job");
assert.equal(applyJobBaseAgain.mode, "update_feature");
assert.equal(applyJobBaseAgain.feature_id, "user_applies_to_job");
const applyJobBaseGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
const applyJobBaseContext = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "context_package.json"), "utf8"));
const applyJobBaseFeatureMd = fs.readFileSync(path.join(applyJobProject, "chay-structure", "features", "user_applies_to_job.md"), "utf8");
assert.equal(applyJobBaseGraph.goal, "User applies to job");
assert.equal(applyJobBaseContext.task, "User applies to job");
assert.ok(applyJobBaseFeatureMd.includes("Goal: User applies to job"));
assert.ok(!applyJobBaseFeatureMd.includes("Goal: Block duplicate applications"));
const applyJobDatabase = runIn(applyJobProject, "go", "User applies to job database schema", "--feature", "user_applies_to_job", "--include-database");
assert.equal(applyJobDatabase.mode, "update_feature");
assert.ok(applyJobDatabase.selected_files.includes("migrations/create-job-applications.sql"));
assert.ok(!applyJobDatabase.selected_files.includes("migrations/12-04-26-1456-update-user-status-and-add-teams.sql"));
const applyJobDatabaseGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
const applyJobDatabaseContext = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "context_package.json"), "utf8"));
assert.deepEqual(new Set(applyJobDatabaseContext.selected_files.map((file) => file.path)), new Set(applyJobDatabaseGraph.code_targets));
const applyJobDatabaseWork = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "codex_work_note.json"), "utf8"));
const applyJobDatabaseHandoff = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "ai_handoff.json"), "utf8"));
assert.equal(applyJobDatabaseWork.goal, applyJobDatabaseGraph.goal);
assert.deepEqual(new Set(applyJobDatabaseWork.allowed_files), new Set(applyJobDatabaseGraph.code_targets));
assert.equal(applyJobDatabaseHandoff.source_of_truth.goal, applyJobDatabaseGraph.goal);
assert.deepEqual(new Set(applyJobDatabaseHandoff.relevant_files.graph_code_targets), new Set(applyJobDatabaseGraph.code_targets));
const applyJobNarrow = runIn(applyJobProject, "go", "User applies to job", "--feature", "user_applies_to_job", "--max-files", "2");
assert.equal(applyJobNarrow.mode, "update_feature");
assert.deepEqual(new Set(applyJobNarrow.selected_files), new Set(["client/src/lib/api.ts", "netlify/functions/job-applications.ts"]));
assert.ok(!applyJobNarrow.selected_files.includes("migrations/create-job-applications.sql"));
const applyJobNarrowGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
const applyJobNarrowContext = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "context_package.json"), "utf8"));
const applyJobNarrowWork = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "codex_work_note.json"), "utf8"));
assert.equal(applyJobNarrowGraph.goal, "User applies to job");
assert.ok(!applyJobNarrowGraph.code_targets.includes("migrations/create-job-applications.sql"));
assert.ok(!applyJobNarrowContext.selected_files.map((file) => file.path).includes("migrations/create-job-applications.sql"));
assert.ok(!applyJobNarrowWork.allowed_files.includes("migrations/create-job-applications.sql"));
const applyJobOverride = runIn(applyJobProject, "go", "User applies to job", "--feature", "user_applies_to_job", "--files", "client/src/lib/api.ts");
assert.deepEqual(applyJobOverride.selected_files, ["client/src/lib/api.ts"]);
const applyJobOverrideGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.deepEqual(applyJobOverrideGraph.code_targets, ["client/src/lib/api.ts"]);
const goalFlagUpdate = runIn(applyJobProject, "go", "--goal", "Block duplicate applications");
assert.equal(goalFlagUpdate.mode, "update_feature");
assert.equal(goalFlagUpdate.feature_id, "user_applies_to_job");
assert.ok(goalFlagUpdate.task.includes("Block duplicate applications"));
const goalFlagGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.ok(goalFlagGraph.goal.includes("User applies to job"));
assert.ok(goalFlagGraph.goal.includes("Block duplicate applications"));
goalFlagGraph.goal = "User applies to job";
goalFlagGraph.code_targets = [...goalFlagGraph.code_targets, "migrations/create-job-applications.sql"];
for (const node of goalFlagGraph.nodes || []) {
  if (Array.isArray(node.code_targets)) node.code_targets = goalFlagGraph.code_targets;
}
fs.writeFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), JSON.stringify(goalFlagGraph, null, 2));
const staleGraphCheck = runIn(applyJobProject, "boundary", "check-graph", "--file", "chay-memory/feature_graph.json", { expectCode: 2 });
assert.ok(staleGraphCheck.violations.some((violation) => violation.type === "database_target_without_database_intent"));
runIn(applyJobProject, "go", "User applies to job", "--feature", "user_applies_to_job");
const applyJobResume = runIn(applyJobProject, "go");
assert.equal(applyJobResume.mode, "resume");
assert.equal(applyJobResume.feature_id, "user_applies_to_job");
const applyJobResumeWork = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "codex_work_note.json"), "utf8"));
const applyJobResumeHandoff = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "ai_handoff.json"), "utf8"));
const applyJobResumeGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.equal(applyJobResumeWork.goal, applyJobResumeGraph.goal);
assert.deepEqual(new Set(applyJobResumeWork.allowed_files), new Set(applyJobResumeGraph.code_targets));
assert.equal(applyJobResumeHandoff.source_of_truth.goal, applyJobResumeGraph.goal);
const adminRole = runIn(applyJobProject, "go", "Admin changes user role");
assert.equal(adminRole.mode, "new_feature");
assert.equal(adminRole.feature_id, "admin_changes_user_role");
assert.equal(adminRole.matched_existing_feature, null);
assert.deepEqual(new Set(adminRole.selected_files), new Set([
  "client/src/components/AdminDashboard.tsx",
  "netlify/functions/admin-users-role.ts",
  "server/src/api/admin.ts"
]));
assert.ok(!adminRole.selected_files.includes("netlify/functions/job-applications.ts"));
const adminRoleGraph = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "feature_graph.json"), "utf8"));
assert.ok(!adminRoleGraph.api_links.some((link) => link.api.includes("admin-announcements")));
assert.ok(!adminRoleGraph.api_links.some((link) => link.api.includes("admin-usage")));
assert.equal(adminRoleGraph.runtime_sequence.kind, "inferred_runtime_sequence");
assert.equal(adminRoleGraph.runtime_sequence.human_review_required, true);
assert.ok(["medium", "high"].includes(adminRoleGraph.runtime_sequence.confidence));
assert.ok(adminRoleGraph.runtime_sequence.participants.some((item) => item.file === "client/src/components/AdminDashboard.tsx"));
assert.ok(adminRoleGraph.runtime_sequence.participants.some((item) => item.label === "/.netlify/functions/admin-users-role"));
assert.ok(adminRoleGraph.runtime_sequence.steps.some((item) => item.evidence.some((evidence) => evidence.includes("handler: netlify/functions/admin-users-role.ts"))));
assert.ok(adminRoleGraph.sequence_diagram.includes("Inferred Runtime Sequence"));
assert.ok(adminRoleGraph.sequence_diagram.includes("AdminDashboard.tsx"));
assert.ok(adminRoleGraph.sequence_diagram.includes("/.netlify/functions/admin-users-role"));
assert.ok(!adminRoleGraph.sequence_diagram.includes("IDE_AI"));
const adminRoleFeatureMd = fs.readFileSync(path.join(applyJobProject, "chay-structure", "features", "admin_changes_user_role.md"), "utf8");
assert.ok(adminRoleFeatureMd.includes("## Runtime Sequence Inference"));
assert.ok(adminRoleFeatureMd.includes("Human review required: yes"));
const adminRoleHandoff = JSON.parse(fs.readFileSync(path.join(applyJobProject, "chay-memory", "ai_handoff.json"), "utf8"));
assert.equal(adminRoleHandoff.source_of_truth.runtime_sequence.kind, "inferred_runtime_sequence");
const adminRoleRepeatFiles = runIn(
  applyJobProject,
  "go",
  "Admin changes user role",
  "--feature",
  "admin_changes_user_role",
  "--files",
  "client/src/components/AdminDashboard.tsx",
  "--files",
  "netlify/functions/admin-users-role.ts",
  "--files",
  "server/src/api/admin.ts"
);
assert.deepEqual(new Set(adminRoleRepeatFiles.selected_files), new Set([
  "client/src/components/AdminDashboard.tsx",
  "netlify/functions/admin-users-role.ts",
  "server/src/api/admin.ts"
]));
const adminRoleMaintenance = runIn(applyJobProject, "go", "Only super admin can change user role");
assert.equal(adminRoleMaintenance.mode, "update_feature");
assert.equal(adminRoleMaintenance.feature_id, "admin_changes_user_role");
assert.deepEqual(new Set(adminRoleMaintenance.selected_files), new Set([
  "client/src/components/AdminDashboard.tsx",
  "netlify/functions/admin-users-role.ts",
  "server/src/api/admin.ts"
]));
assert.ok(!adminRoleMaintenance.selected_files.includes("netlify/functions/admin-users-invite.ts"));
assert.ok(!adminRoleMaintenance.selected_files.includes("netlify/functions/admin-users.ts"));
const duplicateAgents = runIn(aliasProject, "setup", "--agents", "codex,codex", "--main", "anti", { expectCode: 1 });
assert.equal(duplicateAgents.ok, false);
assert.ok(duplicateAgents.error.includes("2 distinct agents"));
assert.ok(!duplicateAgents.error.includes("claude,codex"));

run("doctor");
run("check");
run("setup", "--agents", "claude,codex", "--main", "claude", "--main-llm", "sonnet", "--workers", "codex", "--worker-llms", "codex:gpt-5", "--skills", "repo_search,solid_refactor,test_runner,minimal_patch");
run("scan", "--root", ".", "--out", ".chay/alias_project_map.json");
run("plan", "Fix duplicate apply service", "--index", ".chay/alias_project_map.json", "--out", "chay-memory/alias_context_package.json");
run("pack", "Fix duplicate apply service", "--worker", "codex", "--files", "src/applyService.js", "--out", "chay-memory/alias_codex_work_note.json");
run("repo", "scan", "--root", ".", "--out", ".chay/project_map.json");
const projectMap = JSON.parse(fs.readFileSync(path.join(project, ".chay", "project_map.json"), "utf8"));
assert.equal(projectMap.strategy, "mtime_size_incremental_v3_api_imports_skip_generated_lock_backups_large");
assert.ok(projectMap.files.every((file) => typeof file.mtimeMs === "number" && typeof file.size === "number"));
assert.ok(projectMap.files.every((file) => Array.isArray(file.imports) && Array.isArray(file.api_routes)));
run("context", "plan", "--task", "Fix duplicate apply service", "--index", ".chay/project_map.json", "--out", "chay-memory/context_package.json");
run("workpack", "make", "--worker", "codex", "--goal", "Fix duplicate apply service", "--allowed-files", "src/applyService.js", "--out", "chay-memory/codex_work_note.json");
run("workpack", "make", "--worker", "codex", "--goal", "Fix duplicate apply service", "--allowed-files", "src/applyService.js", "--compact", "--out", "chay-memory/codex_compact_work_note.json");
run("boundary", "check-note", "--file", "chay-memory/task_note.json", "--kind", "task");
run("boundary", "check-note", "--file", "chay-memory/codex_work_note.json", "--kind", "work");
run("boundary", "check-note", "--file", "chay-memory/codex_compact_work_note.json", "--kind", "work");
run("note", "compile", "--json", "chay-memory/task_note.json", "--out", "chay-memory/task_note.md");

const work = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_work_note.json"), "utf8"));
const compactWork = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_compact_work_note.json"), "utf8"));
const host = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "host_config.json"), "utf8"));
assert.deepEqual(host.main, { agent: "claude", llm: "sonnet" });
assert.equal(work.assigned_to, "codex");
assert.deepEqual(work.controller, { agent: "claude", llm: "sonnet" });
assert.equal(work.worker.agent, "codex");
assert.equal(work.worker.llm, "gpt-5");
assert.deepEqual(work.skills, ["repo_search", "solid_refactor", "test_runner", "minimal_patch"]);
assert.equal(work.output_contract.format, "json_only");
assert.equal(work.output_contract.retry_until_valid, true);
assert.ok(work.architecture_rules.some((rule) => rule.includes("SOLID")));
assert.ok(work.minimal_patch_rules.some((rule) => rule.includes("minimalPatchRules")));
assert.deepEqual(work.inputs, ["chay-memory/task_note.json", "chay-memory/context_package.json"]);
assert.equal(compactWork.policy_ref, "runtime_default_policy");
assert.equal(compactWork.experience_compression.framework, "experience_compression_spectrum_v1");
assert.ok(compactWork.inputs.includes("chay-memory/plan_ledger.json"));
assert.ok(compactWork.minimal_patch_rules.some((rule) => rule.includes("minimalPatchRules")));

writeDiff("src/applyService.js", "+export const APPLY_POLICY = 'single_responsibility';\n");
run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "chay-memory/codex_work_note.json");
fs.mkdirSync(path.join(project, ".chay", "locks"), { recursive: true });
fs.writeFileSync(path.join(project, ".chay", "locks", "src__applyService.js.json"), JSON.stringify({ worker: "other", file: "src/applyService.js" }, null, 2));
const lockedDispatch = run("dispatch", "codex", "--command", workerCommand(), "--max-retries", "0", { expectCode: 2 });
assert.equal(lockedDispatch.ok, false);
assert.equal(lockedDispatch.lock.error, "file_lock_conflict");
fs.unlinkSync(path.join(project, ".chay", "locks", "src__applyService.js.json"));
const bloatedWork = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_work_note.json"), "utf8"));
bloatedWork.architecture_rules = Array.from({ length: 700 }, (_, index) => `Large architecture rule ${index}: follow local patterns and SOLID boundaries.`);
fs.writeFileSync(path.join(project, "chay-memory", "codex_work_note.json"), JSON.stringify(bloatedWork, null, 2));
const dispatch = run("dispatch", "codex", "--command", workerCommand(), "--test-command", passTestCommand(), "--max-retries", "1");
assert.equal(dispatch.ok, true);
assert.equal(dispatch.worker, "codex");
assert.equal(dispatch.validation.ok, true);
assert.equal(dispatch.test.ok, true);
assert.equal(dispatch.patch.ok, true);
assert.equal(dispatch.token_preflight.compacted, true);
const isolatedRejected = run("dispatch", "codex", "--command", isolatedWorkerCommand({ outside: true }), "--max-retries", "0", "--isolate", { expectCode: 2 });
assert.equal(isolatedRejected.ok, false);
assert.equal(isolatedRejected.isolation.mode, "copy_workspace_v1");
assert.ok(isolatedRejected.patch.violations.some((item) => item.type === "changed_file_outside_scope"));
assert.equal(fs.existsSync(path.join(project, "src", "outside.js")), false);
const untrackedSecretProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-untracked-secret-"));
fs.mkdirSync(path.join(untrackedSecretProject, "chay-memory"), { recursive: true });
fs.writeFileSync(path.join(untrackedSecretProject, "chay-memory", "codex_work_note.json"), JSON.stringify({
  work_id: "untracked_secret_1",
  goal: "Reject unsafe untracked file content",
  allowed_files: ["src/newSecret.js"],
  inputs: [],
  architecture_rules: [],
  skills: [],
  output_contract: {},
  allowed_tools: [],
  forbidden: [],
  output_schema: {}
}, null, 2));
const untrackedSecret = runIn(untrackedSecretProject, "dispatch", "codex", "--command", untrackedSecretWorkerCommand(), "--max-retries", "0", "--isolate", { expectCode: 2 });
assert.equal(untrackedSecret.ok, false);
assert.equal(untrackedSecret.patch.ok, false);
assert.ok(untrackedSecret.patch.violations.some((item) => item.type === "forbidden_pattern" && item.pattern === "AWS_SECRET_ACCESS_KEY"));
assert.ok(untrackedSecret.patch.violations.some((item) => item.type === "max_added_lines_exceeded"));
assert.equal(fs.existsSync(path.join(untrackedSecretProject, "src", "newSecret.js")), false);
const isolatedDispatch = run("dispatch", "codex", "--command", isolatedWorkerCommand(), "--max-retries", "0", "--isolate");
assert.equal(isolatedDispatch.ok, true);
assert.equal(isolatedDispatch.isolation.mode, "copy_workspace_v1");
assert.ok(fs.readFileSync(path.join(project, "src", "applyService.js"), "utf8").includes("ISOLATED_POLICY"));
const dispatchProgress = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_progress.json"), "utf8"));
assert.equal(dispatchProgress.step, "done");
const dispatchHistory = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_progress_history.json"), "utf8"));
for (const step of ["assigned", "reading", "planning", "editing", "validate_result", "testing", "patch_check", "done"]) {
  assert.ok(dispatchHistory.some((item) => item.step === step), `missing progress step ${step}`);
}
assert.deepEqual(fs.readdirSync(path.join(project, ".chay", "locks")).filter((file) => file.endsWith(".json")), []);
const ledger = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "plan_ledger.json"), "utf8"));
assert.equal(ledger.steps_done.length, 2);
assert.equal(ledger.last_agent_used, "codex");
const experience = run("experience", "snapshot", "--out", "chay-memory/experience_spectrum.json");
assert.equal(experience.ok, true);
const spectrum = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "experience_spectrum.json"), "utf8"));
assert.equal(spectrum.framework, "experience_compression_spectrum_v1");
assert.ok(spectrum.spectrum.memory.refs.includes("chay-memory/plan_ledger.json"));
assert.ok(spectrum.spectrum.skills.items.includes("repo_search"));
assert.ok(spectrum.spectrum.skills.items.includes("minimal_patch"));
assert.equal(spectrum.spectrum.rules.policy_ref, "runtime_default_policy");
assert.ok(spectrum.spectrum.rules.minimal_patch_rule_count > 0);

writeDiff("src/other.js", "+const value = 'bypass_validation';\n");
const rejected = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "chay-memory/codex_work_note.json", { expectCode: 2 });
assert.equal(rejected.ok, false);
assert.ok(rejected.violations.some((item) => item.type === "changed_file_outside_scope"));
assert.ok(rejected.violations.some((item) => item.type === "forbidden_pattern"));

const docWork = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_work_note.json"), "utf8"));
docWork.allowed_files = ["docs/product.md"];
fs.mkdirSync(path.join(project, "docs"), { recursive: true });
fs.writeFileSync(path.join(project, "chay-memory", "doc_work_note.json"), JSON.stringify(docWork, null, 2));
writeDiff("docs/product.md", "+Human-owned product behavior changed by AI.\n");
const docRejected = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "chay-memory/doc_work_note.json", { expectCode: 2 });
assert.ok(docRejected.violations.some((item) => item.type === "human_owned_path_requires_approval"));
docWork.human_approved_files = ["docs/product.md"];
fs.writeFileSync(path.join(project, "chay-memory", "doc_work_note.json"), JSON.stringify(docWork, null, 2));
const docApproved = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "chay-memory/doc_work_note.json");
assert.equal(docApproved.ok, true);
docWork.allowed_files = [".env"];
docWork.human_approved_files = [".env"];
fs.writeFileSync(path.join(project, "chay-memory", "doc_work_note.json"), JSON.stringify(docWork, null, 2));
writeDiff(".env", "+SECRET_KEY=leaked\n");
const secretRejected = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "chay-memory/doc_work_note.json", { expectCode: 2 });
assert.ok(secretRejected.violations.some((item) => item.type === "sensitive_path_change_blocked"));

fs.writeFileSync(path.join(project, "chay-memory", "codex_result_note.json"), JSON.stringify({
  work_id: work.work_id,
  worker: "codex",
  status: "completed",
  summary: "Smoke worker completed scoped patch validation.",
  findings: ["Tests passed: node smoke fixture"],
  changed_files: ["src/applyService.js"],
  risks: [],
  next_recommendation: "review_patch"
}, null, 2));
run("boundary", "validate-output", "--file", "chay-memory/codex_result_note.json");
writeDiff("src/applyService.js", "+export const APPLY_POLICY = 'single_responsibility';\n");
const evalReport = run("eval", "report");
assert.equal(evalReport.ok, true);
assert.equal(evalReport.grade, "excellent");
assert.ok(evalReport.cases.filter((item) => item.id !== "token_efficiency_good").every((item) => item.ok));
assert.equal(evalReport.metrics.task_status, "completed");
assert.equal(evalReport.metrics.scope_violations, 0);
assert.equal(evalReport.metrics.retry_count, 0);
const tinyTokenProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-tiny-token-"));
fs.mkdirSync(path.join(tinyTokenProject, "src"), { recursive: true });
fs.mkdirSync(path.join(tinyTokenProject, "chay-memory"), { recursive: true });
fs.mkdirSync(path.join(tinyTokenProject, ".chay", "tmp"), { recursive: true });
fs.writeFileSync(path.join(tinyTokenProject, "src", "tiny.js"), "export const tiny = true;\n");
fs.writeFileSync(path.join(tinyTokenProject, "chay-memory", "context_package.json"), JSON.stringify({
  task: "Tiny token check",
  selected_files: [{ path: "src/tiny.js" }]
}, null, 2));
fs.writeFileSync(path.join(tinyTokenProject, "chay-memory", "codex_work_note.json"), JSON.stringify({
  work_id: "tiny_1",
  allowed_files: ["src/tiny.js"]
}, null, 2));
fs.writeFileSync(path.join(tinyTokenProject, "chay-memory", "codex_result_note.json"), JSON.stringify({
  work_id: "tiny_1",
  worker: "codex",
  status: "completed",
  summary: "Tiny change completed. Tests passed.",
  findings: ["Tests passed: tiny"],
  changed_files: ["src/tiny.js"],
  risks: [],
  next_recommendation: "review_patch"
}, null, 2));
fs.writeFileSync(path.join(tinyTokenProject, ".chay", "tmp", "current.diff"), [
  "diff --git a/src/tiny.js b/src/tiny.js",
  "--- a/src/tiny.js",
  "+++ b/src/tiny.js",
  "@@ -1 +1,2 @@",
  " export const tiny = true;",
  "+export const changed = true;",
  ""
].join("\n"));
const tinyEval = runIn(tinyTokenProject, "eval", "report");
assert.ok(tinyEval.metrics.token_savings_percent < 0);
assert.equal(tinyEval.cases.find((item) => item.id === "token_efficiency_good").ok, false);

fs.writeFileSync(path.join(project, "chay-memory", "bad_result_note.json"), JSON.stringify({
  work_id: work.work_id,
  worker: "codex",
  status: "done",
  summary: 123,
  findings: "not-array"
}, null, 2));
const retry = run("boundary", "validate-output", "--file", "chay-memory/bad_result_note.json", { expectCode: 2 });
assert.equal(retry.next_action, "retry_worker_with_contract");
assert.ok(retry.retry_instruction.includes("Return valid result_note JSON only"));
assert.ok(retry.violations.some((item) => item.type === "invalid_status"));

run("integration", "install", "--target", "claude");
assert.ok(fs.existsSync(path.join(project, ".claude", "agents", "chay-main.md")));
assert.ok(fs.existsSync(path.join(project, ".claude", "agents", "chay-codex-worker.md")));
assert.ok(fs.existsSync(path.join(project, ".claude", "agents", "chay-reviewer.md")));
run("progress", "update", "--agent", "codex", "--step", "editing", "--message", "Editing backend structure");
const progress = JSON.parse(fs.readFileSync(path.join(project, "chay-memory", "codex_progress.json"), "utf8"));
assert.equal(progress.agent, "codex");
assert.equal(progress.step, "editing");
verifyUiTemplate();

console.log(JSON.stringify({ ok: true, project }, null, 2));

function run(...input) {
  return runIn(project, ...input);
}

function runIn(cwd, ...input) {
  const options = typeof input.at(-1) === "object" ? input.pop() : {};
  const result = spawnSync(process.execPath, [cli, ...input], {
    cwd,
    encoding: "utf8"
  });
  const expected = options.expectCode ?? 0;

  if (result.status !== expected) {
    throw new Error([
      `Command failed: cr ${input.join(" ")}`,
      `Expected exit ${expected}, got ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }

  const text = result.stdout.trim() || result.stderr.trim();
  assert.ok(text.startsWith("{"), `Expected JSON output for cr ${input.join(" ")}`);
  return JSON.parse(text);
}

function writeDiff(file, addedLine) {
  fs.mkdirSync(path.join(project, ".chay", "tmp"), { recursive: true });
  fs.writeFileSync(path.join(project, ".chay", "tmp", "current.diff"), [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -0,0 +1 @@",
    addedLine.trimEnd(),
    ""
  ].join("\n"));
}

function workerCommand() {
  const script = [
    "const fs = require('node:fs');",
    "const work = JSON.parse(fs.readFileSync('chay-memory/codex_work_note.json', 'utf8'));",
    "fs.mkdirSync('chay-memory', { recursive: true });",
    "fs.writeFileSync('chay-memory/codex_result_note.json', JSON.stringify({ work_id: work.work_id, worker: 'codex', status: 'completed', summary: 'Dispatch smoke worker completed.', findings: ['dispatch command wrote result note'], changed_files: ['src/applyService.js'], risks: [], next_recommendation: 'review_patch' }, null, 2));",
    "fs.mkdirSync('.chay/tmp', { recursive: true });",
    "fs.writeFileSync('.chay/tmp/current.diff', ['diff --git a/src/applyService.js b/src/applyService.js', '--- a/src/applyService.js', '+++ b/src/applyService.js', '@@ -0,0 +1 @@', '+export const APPLY_POLICY = \\'single_responsibility\\';', ''].join('\\n'));"
  ].join(" ");
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function passTestCommand() {
  const script = "console.log('smoke test command passed');";
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function isolatedWorkerCommand(options = {}) {
  const script = [
    "const fs = require('node:fs');",
    "const work = JSON.parse(fs.readFileSync('chay-memory/codex_work_note.json', 'utf8'));",
    "fs.writeFileSync('src/applyService.js', fs.readFileSync('src/applyService.js', 'utf8') + '\\nexport const ISOLATED_POLICY = true;\\n');",
    options.outside ? "fs.writeFileSync('src/outside.js', 'export const OUTSIDE_SCOPE = true;\\n');" : "",
    "fs.mkdirSync('chay-memory', { recursive: true });",
    "fs.writeFileSync('chay-memory/codex_result_note.json', JSON.stringify({ work_id: work.work_id, worker: 'codex', status: 'completed', summary: 'Isolated worker completed.', findings: ['isolated command wrote result note'], changed_files: ['src/applyService.js'], risks: [], next_recommendation: 'review_patch' }, null, 2));"
  ].filter(Boolean).join(" ");
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function untrackedSecretWorkerCommand() {
  const script = [
    "const fs = require('node:fs');",
    "fs.mkdirSync('src', { recursive: true });",
    "const lines = Array.from({ length: 320 }, (_, index) => 'export const line_' + index + ' = ' + index + ';');",
    "lines.unshift(\"export const leaked = 'AWS_SECRET_ACCESS_KEY';\");",
    "fs.writeFileSync('src/newSecret.js', lines.join('\\n') + '\\n');",
    "fs.mkdirSync('chay-memory', { recursive: true });",
    "fs.writeFileSync('chay-memory/codex_result_note.json', JSON.stringify({ work_id: 'untracked_secret_1', worker: 'codex', status: 'completed', summary: 'Created untracked file.', findings: ['created file'], changed_files: ['src/newSecret.js'], risks: [], next_recommendation: 'review_patch' }, null, 2));"
  ].join(" ");
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function verifyUiTemplate() {
  const html = fs.readFileSync(path.join(repoRoot, "site", "console.html"), "utf8");
  const landing = fs.readFileSync(path.join(repoRoot, "site", "index.html"), "utf8");
  const server = fs.readFileSync(path.join(repoRoot, "src", "commands", "ui.js"), "utf8");
  const progress = fs.readFileSync(path.join(repoRoot, "src", "utils", "progress.js"), "utf8");
  const codexSkill = fs.readFileSync(path.join(repoRoot, "templates", "codex-skill", "chay-runtime", "SKILL.md"), "utf8");
  const projectRules = fs.readFileSync(path.join(repoRoot, "templates", "ide-rules", "chay-memory", "rules", "chay-runtime.md"), "utf8");
  for (const text of ["Chạy Inspector", "targets", "taskText", "filesText", "idePrompt", "Feature Graph", "Folder Structure", "Selected Files", "Token Saving", "plantuml_sequence"]) {
    assert.ok(html.includes(text), `missing inspector control: ${text}`);
  }
  for (const text of ["CASE A", "Continue existing feature", "Add or change feature", "Verify AI edit", "Feature memory before code. Feature boundary after code."]) {
    assert.ok(landing.includes(text), `missing landing case message: ${text}`);
  }
  for (const text of ["what this repo does", "Feature contract", "Inferred runtime sequence", "Fresh session context", "Patch boundary", "cr chat install", "cr ui serve"]) {
    assert.ok(landing.includes(text), `missing landing repo-purpose message: ${text}`);
  }
  for (const text of ["assets/chay-logo.svg", "rel=\"icon\" type=\"image/svg+xml\"", "apple-touch-icon", "og:image", "og:image:type", "twitter:image"]) {
    assert.ok(landing.includes(text), `missing landing logo asset: ${text}`);
  }
  assert.ok(!landing.includes("side-item active"), "motion sidebar should not hard-code the first step active");
  assert.ok(landing.includes("\"IntersectionObserver\" in window"), "reveal animation must have an IntersectionObserver fallback");
  assert.ok(fs.existsSync(path.join(repoRoot, "site", "assets", "chay-logo.svg")), "missing GitHub Pages SVG logo asset");
  for (const text of ["Continue existing feature", "Add or change feature", "Verify AI edit", "feature memory before code, feature boundary after code"]) {
    assert.ok(codexSkill.includes(text), `missing Codex Skill case message: ${text}`);
    assert.ok(projectRules.includes(text), `missing project rule case message: ${text}`);
  }
  assert.ok(progress.includes("validate_result"), "missing progress contract: validate_result");
  assert.ok(fs.readFileSync(path.join(repoRoot, "src", "core", "agents.js"), "utf8").includes("anti: \"antigravity\""));
  for (const text of ["/api/stream", "config_ide", "action === \"go\"", "action === \"handoff\"", "action === \"verify\"", "feature_graph", "handoff", "ide_config"]) {
    assert.ok(server.includes(text), `missing UI server contract: ${text}`);
  }
  assert.ok(server.includes("available_agents"));
  assert.ok(server.includes("result_notes"));
  assert.ok(server.includes("fs.closeSync(out)"), "UI dispatch must close parent log fd after spawn");
  assertNoStaleMemoryPaths(path.join(repoRoot, "templates"));
}

function assertNoStaleMemoryPaths(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      assertNoStaleMemoryPaths(file);
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!/(^|[^A-Za-z0-9_-])memory\//.test(text), `stale memory/ path in ${path.relative(repoRoot, file)}`);
  }
}
