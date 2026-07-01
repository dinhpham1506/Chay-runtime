export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

export function limitText(text, maxTokens) {
  const maxChars = maxTokens * 4;
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + "\n...[TRUNCATED_BY_CHAY]";
}
