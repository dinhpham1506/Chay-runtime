export function analyzeDiff(diffText) {
  const lines = String(diffText || "").split(/\r?\n/);
  const files = new Set();
  let added = 0;
  let deleted = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) files.add(line.slice("+++ b/".length));
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) deleted++;
  }

  return {
    changedFiles: Array.from(files),
    changedFileCount: files.size,
    addedLines: added,
    deletedLines: deleted,
    totalDiffLines: added + deleted
  };
}

export function validateDiff(diff, work, policy, diffText = "") {
  const violations = [];
  const allowed = new Set(work.allowed_files || work.allowedFiles || []);

  if (diff.changedFileCount > policy.maxChangedFiles) {
    violations.push({ type: "max_changed_files_exceeded", value: diff.changedFileCount, max: policy.maxChangedFiles });
  }
  if (diff.addedLines > policy.maxAddedLines) {
    violations.push({ type: "max_added_lines_exceeded", value: diff.addedLines, max: policy.maxAddedLines });
  }
  if (diff.deletedLines > policy.maxDeletedLines) {
    violations.push({ type: "max_deleted_lines_exceeded", value: diff.deletedLines, max: policy.maxDeletedLines });
  }
  if (diff.totalDiffLines > policy.maxTotalDiffLines) {
    violations.push({ type: "max_total_diff_lines_exceeded", value: diff.totalDiffLines, max: policy.maxTotalDiffLines });
  }

  if (allowed.size > 0) {
    for (const file of diff.changedFiles) {
      const ok = Array.from(allowed).some((allowedFile) => file.endsWith(allowedFile) || file === allowedFile);
      if (!ok) violations.push({ type: "changed_file_outside_scope", file });
    }
  }

  violations.push(...findForbiddenPatternHits(diffText, policy));

  return {
    ok: violations.length === 0,
    violations
  };
}

function findForbiddenPatternHits(diffText, policy) {
  const patterns = policy.forbiddenPatterns || [];
  const hits = [];

  for (const line of String(diffText || "").split(/\r?\n/)) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const pattern of patterns) {
      if (line.includes(pattern)) hits.push({ type: "forbidden_pattern", pattern });
    }
  }

  return hits;
}
