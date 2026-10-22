// The game's version numbers ("1.60.1.70374"): which is newer, and which go
// together (a major version: Forever's beta, 1.x, shared wago.tools'
// product with Mists of Pandaria's, 5.x, until Forever's own, wowf, which
// holds only 1.60; a family: 1.60, the same game).
export function newer(a: string, b: string): boolean {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}
export const major = (v: string) => v.split(".")[0];
export const family = (v: string) => v.split(".").slice(0, 2).join(".");
// the newest of versions sharing pin's major version, else pin itself
export function newest(versions: string[], pin: string): string {
  return versions.filter((v) => major(v) === major(pin)).reduce((best, v) => (newer(v, best) ? v : best), pin);
}
