import { readJson, exists } from "../utils/fs.js";

export function loadPolicy(file = "runtime_default_policy") {
  if (!file || ["runtime_default_policy", "default"].includes(file)) {
    return defaultPolicy();
  }
  if (file && !["runtime_default_policy", "default"].includes(file) && exists(file)) {
    return readJson(file);
  }
  if (!exists(file) && exists("policies/chay_policy.json")) {
    return readJson("policies/chay_policy.json");
  }
  if (!exists(file)) {
    return defaultPolicy();
  }
  return readJson(file);
}

function defaultPolicy() {
  return {
      maxNoteTokens: 1200,
      maxResultTokens: 900,
      maxChangedFiles: 6,
      maxAddedLines: 300,
      maxDeletedLines: 200,
      maxTotalDiffLines: 500,
      maxCommandsPerTask: 8,
      maxDispatchRetries: 3,
      maxTokenCompactionPasses: 2,
      maxSubagents: 2,
      maxSubagentDepth: 1,
      architectureRules: [
        "Follow local patterns.",
        "Apply SOLID where useful.",
        "Split by responsibility, not line count.",
        "Separate validation, policy checks, persistence, and presentation.",
        "Use explicit dependencies; avoid hidden global state."
      ],
      minimalPatchRules: [
        "Before writing code, ask whether the change needs to exist; skip unnecessary work.",
        "Reuse existing local helpers, components, functions, and patterns before creating new ones.",
        "Prefer standard library and native platform features before adding dependencies.",
        "Use an installed dependency only when it already exists and clearly reduces complexity.",
        "Write the smallest correct patch that satisfies the task and output contract.",
        "Do not remove validation, error handling, security checks, accessibility, or tests to make code smaller.",
        "Do not introduce abstractions, wrappers, files, or configuration unless they remove real complexity.",
        "If the best solution is one line or a native element, use it."
      ],
      agentSkills: [
        "repo_search",
        "context_reading",
        "solid_refactor",
        "test_runner",
        "patch_guard",
        "minimal_patch"
      ],
      allowedDomains: ["feature_context_runtime", "backend_architecture", "coding_agent_runtime", "repo_intelligence"],
      forbiddenNotePaths: [".chay/audit/", "audit/"],
      humanOwnedPaths: ["README.md", "CHANGELOG.md", "docs/", "product/", "requirements/", "specs/"],
      sensitivePaths: [".env", ".env.", "secrets/", "credentials/", "private/", ".aws/", ".ssh/"],
      forbiddenPatterns: [
        "sk-",
        "BEGIN PRIVATE KEY",
        "AWS_SECRET_ACCESS_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "DATABASE_URL=",
        "PASSWORD=",
        "SECRET_KEY=",
        "access_token",
        "refresh_token",
        "console.log(req.headers.authorization)",
        "console.log(request.headers.authorization)",
        "hardcoded_test_value",
        "bypass_validation",
        "catch_exception_and_ignore",
        "return_null_on_error",
        "disable_test",
        "comment_out_logic",
        "fake_success_response"
      ]
    };
}
