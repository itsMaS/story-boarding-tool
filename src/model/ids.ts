/** Short, URL-safe random ids. Collisions inside one project are practically impossible. */
export function newId(prefix = ''): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return prefix ? `${prefix}_${s}` : s;
}
