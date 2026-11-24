/** Subsequence match with a bonus for word starts: "mlat" finds "Masala Latte". */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0;
  let total = 0;
  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found === -1) return 0;
    total += found === 0 || t[found - 1] === " " ? 3 : 1;
    ti = found + 1;
  }
  return total;
}
