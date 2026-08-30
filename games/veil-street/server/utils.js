export function shuffle(array, rng = Math.random) {
  const a = array.slice();
  const useCrypto = typeof crypto !== 'undefined' && crypto.getRandomValues;
  for (let i = a.length - 1; i > 0; i--) {
    let j;
    if (useCrypto) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      j = buf[0] % (i + 1);
    } else {
      j = Math.floor(rng() * (i + 1));
    }
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function uid(prefix = 'p') {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
export function sample(arr) {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}
