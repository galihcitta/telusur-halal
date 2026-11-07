function sourceLabel(source, evidenceType) {
  const confirmation = /^seller-confirmed:r(\d+)$/.exec(source);
  if (confirmation) return 'Dikonfirmasi penjual · Revisi ' + confirmation[1];
  if (source.startsWith('seller-answer:')) return 'Jawaban penjual';
  if (source.startsWith('sha256:')) return evidenceType === 'photo' ? 'Foto kemasan' : 'Berkas unggahan';
  if (source.startsWith('image-set:')) return 'Kumpulan foto kemasan';
  if (source.endsWith('#KMA_1360_2021/a1_tumbuhan')) {
    return 'Dasar pengecualian · Bahan tumbuhan segar tanpa tambahan (KMA 1360/2021)';
  }
  if (source.endsWith('#KMA_1360_2021/a3_fermentasi_mikroba')) {
    return 'Dasar pengecualian · Fermentasi mikroba (KMA 1360/2021)';
  }
  if (source.startsWith('https://bpjph.halal.go.id/')) return 'Hasil pencarian BPJPH tersimpan';
  if (source.includes('/seed/registry.yaml#')) return 'Catatan registri simulasi';
  return 'Rujukan bukti';
}

export function renderSourceReferences(sources, escape, evidenceType) {
  if (!sources.length) return '';
  const labels = [...new Set(sources.map(source => sourceLabel(String(source), evidenceType)))];
  const list = entries => '<ul>' + entries.map(entry => '<li>' + escape(entry) + '</li>').join('') + '</ul>';
  return '<details><summary>Sumber rujukan</summary>' + list(labels) +
    '<details><summary>Detail teknis</summary>' + list(sources) + '</details></details>';
}
