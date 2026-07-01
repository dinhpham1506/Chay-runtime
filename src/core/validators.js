import { estimateTokens } from "../utils/tokens.js";

export function requireFields(obj, fields) {
  const missing = fields.filter((field) => obj[field] === undefined || obj[field] === null || obj[field] === "");
  return {
    ok: missing.length === 0,
    missing
  };
}

export function validateTaskNote(note, policy) {
  const required = requireFields(note, ["task_id", "goal", "requirements", "constraints"]);
  const tokens = estimateTokens(JSON.stringify(note));

  const violations = [];
  if (!required.ok) violations.push({ type: "missing_fields", fields: required.missing });
  if (!Array.isArray(note.requirements)) violations.push({ type: "requirements_must_be_array" });
  if (!Array.isArray(note.constraints)) violations.push({ type: "constraints_must_be_array" });
  if (tokens > policy.maxNoteTokens) violations.push({ type: "note_too_long", tokens, max: policy.maxNoteTokens });
  violations.push(...findForbiddenPathViolations(note, policy));

  return {
    ok: violations.length === 0,
    tokens,
    violations
  };
}

export function validateResultNote(note, policy) {
  const required = requireFields(note, ["work_id", "worker", "status", "summary", "findings"]);
  const tokens = estimateTokens(JSON.stringify(note));

  const violations = [];
  if (!required.ok) violations.push({ type: "missing_fields", fields: required.missing });
  if (note.work_id !== undefined && typeof note.work_id !== "string") violations.push({ type: "work_id_must_be_string" });
  if (note.worker !== undefined && typeof note.worker !== "string") violations.push({ type: "worker_must_be_string" });
  if (note.summary !== undefined && typeof note.summary !== "string") violations.push({ type: "summary_must_be_string" });
  if (!["completed", "failed", "blocked", "partial"].includes(note.status)) {
    violations.push({ type: "invalid_status", allowed: ["completed", "failed", "blocked", "partial"] });
  }
  if (!Array.isArray(note.findings)) violations.push({ type: "findings_must_be_array" });
  if (note.changed_files !== undefined && !Array.isArray(note.changed_files)) violations.push({ type: "changed_files_must_be_array" });
  if (note.risks !== undefined && !Array.isArray(note.risks)) violations.push({ type: "risks_must_be_array" });
  if (note.next_recommendation !== undefined && typeof note.next_recommendation !== "string") {
    violations.push({ type: "next_recommendation_must_be_string" });
  }
  if (tokens > policy.maxResultTokens) violations.push({ type: "result_too_long", tokens, max: policy.maxResultTokens });
  violations.push(...findForbiddenPathViolations(note, policy));

  return {
    ok: violations.length === 0,
    tokens,
    violations
  };
}

export function validateWorkNote(note, policy) {
  const required = requireFields(note, ["work_id", "controller", "assigned_to", "worker", "goal", "inputs", "architecture_rules", "skills", "output_contract", "allowed_tools", "forbidden", "output_schema"]);
  const tokens = estimateTokens(JSON.stringify(note));

  const violations = [];
  if (!required.ok) violations.push({ type: "missing_fields", fields: required.missing });
  if (!Array.isArray(note.inputs)) violations.push({ type: "inputs_must_be_array" });
  if (!Array.isArray(note.architecture_rules)) violations.push({ type: "architecture_rules_must_be_array" });
  if (!Array.isArray(note.skills)) violations.push({ type: "skills_must_be_array" });
  if (!note.output_contract || typeof note.output_contract !== "object" || Array.isArray(note.output_contract)) {
    violations.push({ type: "output_contract_must_be_object" });
  }
  if (!Array.isArray(note.allowed_tools)) violations.push({ type: "allowed_tools_must_be_array" });
  if (!Array.isArray(note.forbidden)) violations.push({ type: "forbidden_must_be_array" });
  if (Array.isArray(note.inputs)) violations.push(...validateAgentInputs(note.inputs));
  if (tokens > policy.maxNoteTokens) violations.push({ type: "note_too_long", tokens, max: policy.maxNoteTokens });
  violations.push(...findForbiddenPathViolations(note, policy));

  return {
    ok: violations.length === 0,
    tokens,
    violations
  };
}

function validateAgentInputs(inputs) {
  return inputs
    .filter((input) => typeof input !== "string" || !input.startsWith("memory/") || !input.endsWith(".json"))
    .map((input) => ({ type: "invalid_agent_input", input, expected: "memory/*.json" }));
}

function findForbiddenPathViolations(value, policy) {
  const forbidden = policy.forbiddenNotePaths || [];
  const violations = [];

  for (const text of collectStrings(value)) {
    for (const pattern of forbidden) {
      if (text.includes(pattern)) {
        violations.push({ type: "forbidden_note_path", path: text, pattern });
      }
    }
  }

  return violations;
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}
