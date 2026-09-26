// Small, deliberately conservative list. Extend only after reviewing false positives.
export const blockedTerms = ["操你妈", "草你妈", "傻逼", "去死"];

export function containsBlockedTerm(value) {
  const normalized = value.toLowerCase().replace(/[\s\u200b-\u200d]/g, "");
  return blockedTerms.some((term) => normalized.includes(term));
}
