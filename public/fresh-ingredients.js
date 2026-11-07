// Deliberately bounded aliases for the saved KMA plant reference, not fuzzy matching.
const names = new Set([
  'pisang', 'pisang kepok', 'buah pisang', 'buah pisang kepok',
  'cabai', 'cabai hijau', 'cabai merah', 'cabai rawit', 'cabai rawit merah',
  'cabai rawit hijau', 'cabai keriting', 'cabai merah keriting',
  'bawang merah', 'bawang putih', 'bawang bombay',
]);
export function freshPlantCandidate(ingredient) {
  const name = (ingredient.declared_name || '').normalize('NFC').trim().toLowerCase()
    .replace(/\s+/g, ' ').replace(/^cabe\b/, 'cabai').replace(/ segar$/, '');
  return names.has(name);
}
export function freshPlantAssumption(ingredient) {
  return freshPlantCandidate(ingredient) && ingredient.form !== 'processed' &&
    ingredient.no_additives !== false && ingredient.pack_condition !== 'repacked' &&
    !ingredient.conflict && !ingredient.brand && !ingredient.variant &&
    (ingredient.form !== 'fresh' || ingredient.no_additives !== true);
}
