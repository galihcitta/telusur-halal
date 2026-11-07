const workspace = document.querySelector('#workspace');
const notice = document.querySelector('#notice');
const title = document.querySelector('#page-title');
let view;
let session;
let editing = false;
let busy = false;
let observer = false;
let replay = false;
const observerId = new URLSearchParams(location.search).get('case');

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const statuses = {
  open: 'Menunggu bukti', exempt: 'Pengecualian bersyarat',
  verified: 'Cocok dengan data registri', unresolved: 'Belum terverifikasi',
};
const conditions = { unknown: 'Belum diketahui', sealed: 'Tersegel', repacked: 'Dikemas ulang', loose: 'Curah' };
const forms = { unknown: 'Belum diketahui', fresh: 'Segar', processed: 'Olahan' };
const sourceModes = { actual_media: 'Unggahan audio dan gambar', fixture: 'Fixture uji', replay: 'Putar ulang' };
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function message(text, error = false) {
  notice.hidden = !text;
  notice.textContent = text;
  notice.classList.toggle('error', error);
}

async function request(path, data) {
  const headers = {};
  if (session) headers.Authorization = 'Bearer ' + session;
  if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method: data ? 'POST' : 'GET',
    headers,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && !result.case) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Permintaan gagal. Coba lagi.');
  }
  return result;
}

function path(action) {
  return '/api/cases/' + encodeURIComponent(view.case_id) + '/' + action;
}

async function run(task, pending = 'Sedang memproses…') {
  if (busy) return;
  busy = true;
  message(pending);
  workspace.setAttribute('aria-busy', 'true');
  try {
    const result = await task();
    if (result?.case) {
      view = result.case;
      render();
    }
    message(view?.error || '', Boolean(view?.error));
    return result;
  } catch (error) {
    message(error.message, true);
  } finally {
    workspace.removeAttribute('aria-busy');
    busy = false;
  }
}

function select(name, label, options, selected) {
  return `<label class="field">${label}<select name="${name}">${Object.entries(options).map(([key, text]) =>
    `<option value="${key}" ${key === selected ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}

function input(name, label, value, required = false) {
  return `<label class="field">${label}<input name="${name}" value="${escape(value)}" maxlength="250" ${required ? 'required' : ''}></label>`;
}

function readReplay(saved) {
  const recorded = saved?.case;
  const text = (value) => value == null || typeof value === 'string';
  const fields = (item, keys) => item && keys.every((key) => text(item[key]));
  const texts = (items) => Array.isArray(items) && items.every((value) => typeof value === 'string');
  if (!recorded || !['actual_media', 'fixture'].includes(recorded.source_mode) ||
      typeof recorded.product_name !== 'string' || !Number.isSafeInteger(recorded.revision) ||
      !Array.isArray(recorded.confirmed_ingredient_ids) || !Array.isArray(recorded.ingredients) ||
      !recorded.ingredients.every((row) =>
        fields(row, ['declared_name', 'brand', 'variant', 'purchase_location', 'basis', 'status', 'form', 'pack_condition']) &&
        Object.hasOwn(statuses, row.status) &&
        Array.isArray(row.evidence) && row.evidence.every((item) =>
          fields(item?.observed, ['product', 'manufacturer', 'variant', 'certificate_number']) &&
          Number.isSafeInteger(item.revision) && texts(item.source_refs) && (!item.conflicts || texts(item.conflicts)))) ||
      !Array.isArray(recorded.proposals) || !recorded.proposals.every((offer) =>
        fields(offer, ['status']) &&
        fields(offer.listing, ['listing_id', 'product', 'variant', 'manufacturer', 'shop', 'pack_size', 'source_ref', 'fit']) &&
        Number.isFinite(offer.listing.price_idr) && fields(offer.registry, ['record_id', 'certificate_number'])) ||
      !Array.isArray(recorded.events) || !recorded.events.every((event, index) =>
        event?.data && typeof event.data.summary === 'string' &&
        Number.isSafeInteger(event.revision) && event.seq === index + 1) ||
      !recorded.events.some((event) => event.type === 'packet_exported')) {
    throw new Error('Pilih rekaman jejak dari ekspor Telusur yang sudah selesai.');
  }
  return { ...recorded, draft: undefined, error: undefined, phase: 'review_packet' };
}

function showStart() {
  workspace.replaceChildren(document.querySelector('#start-template').content.cloneNode(true));
  const form = workspace.querySelector('#start-form');
  const record = workspace.querySelector('#record');
  const status = workspace.querySelector('#record-status');
  const panel = form.querySelector('.voice-note');
  const timer = form.querySelector('#record-time');
  const action = form.querySelector('#record-action');
  const preview = form.querySelector('#record-preview');
  const fallback = form.querySelector('#audio-fallback');
  const submit = form.querySelector('[type=submit]');
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  let recorder;
  let recordedFile;
  let previewUrl;
  let ticking;
  let captureBusy = false;

  function resetPreview() {
    preview.pause();
    preview.removeAttribute('src');
    preview.hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    recordedFile = undefined;
  }

  function setState(state, label, detail) {
    panel.dataset.state = state;
    action.textContent = label;
    status.textContent = detail;
  }

  if (!canRecord) {
    record.disabled = true;
    fallback.open = true;
    status.textContent = 'Mikrofon tidak tersedia di sini. Buka di browser atau pilih file audio.';
  }

  record.onclick = async () => {
    if (busy || captureBusy) return;
    if (recorder?.state === 'recording') {
      captureBusy = true;
      recorder.stop();
      return;
    }

    let stream;
    captureBusy = true;
    record.disabled = submit.disabled = true;
    preview.pause();
    status.textContent = 'Meminta izin mikrofon…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      const chunks = [];
      let failed = false;
      const release = () => {
        clearInterval(ticking);
        stream.getTracks().forEach(track => track.stop());
        captureBusy = false;
        record.disabled = submit.disabled = false;
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        release();
        setState('idle', 'Rekam suara', 'Rekaman terputus. Coba rekam lagi.');
      };
      recorder.onstop = () => {
        release();
        if (failed) return;
        const mime = (recorder.mimeType || chunks[0]?.type || '').split(';')[0];
        if (!chunks.length || !mime) {
          setState('idle', 'Rekam suara', 'Rekaman kosong. Coba bicara beberapa detik.');
          return;
        }
        const extension = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
        recordedFile = new File(chunks, 'rekaman.' + extension, { type: mime });
        previewUrl = URL.createObjectURL(recordedFile);
        preview.src = previewUrl;
        preview.hidden = false;
        setState('ready', 'Rekam ulang', 'Dengarkan dulu, lalu tambahkan foto label.');
      };
      recorder.start();
      resetPreview();
      form.elements.audio.value = '';
      fallback.open = false;
      timer.textContent = '00:00';
      const started = performance.now();
      ticking = setInterval(() => {
        const seconds = Math.min(90, Math.floor((performance.now() - started) / 1000));
        timer.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        if (seconds === 90 && recorder.state === 'recording') {
          captureBusy = true;
          recorder.stop();
        }
      }, 250);
      captureBusy = false;
      record.disabled = false;
      setState('recording', 'Hentikan rekaman', 'Sedang merekam. Ketuk tombol untuk berhenti.');
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      captureBusy = false;
      record.disabled = submit.disabled = false;
      status.textContent = 'Izinkan akses mikrofon di browser, lalu coba lagi.';
    }
  };
  form.elements.audio.onchange = () => {
    if (form.elements.audio.files.length) {
      resetPreview();
      timer.textContent = '00:00';
      setState('idle', 'Rekam suara', 'File audio dipilih.');
    }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    if (captureBusy || recorder?.state === 'recording') return;
    const data = new FormData(form);
    if (recordedFile) data.set('audio', recordedFile);
    if (!data.get('audio')?.size) {
      message('Rekam suara atau pilih file audio.', true);
      (canRecord ? record : form.elements.audio).focus();
      return;
    }
    run(async () => {
      const result = await request('/api/cases', data);
      session = result.session;
      resetPreview();
      return result;
    }, 'Membaca rekaman dan label…');
  };
  workspace.querySelector('#replay-form').onsubmit = (event) => {
    event.preventDefault();
    if (captureBusy || recorder?.state === 'recording') {
      message('Hentikan rekaman suara sebelum membuka putar ulang.', true);
      return;
    }
    const file = event.currentTarget.elements.replay.files[0];
    run(async () => {
      if (!file || file.size > 2 * 1024 * 1024) {
        throw new Error('Pilih file rekaman jejak berukuran paling besar 2 MB.');
      }
      let saved;
      try { saved = JSON.parse(await file.text()); }
      catch { throw new Error('File rekaman jejak harus berupa JSON yang valid.'); }
      const recorded = readReplay(saved);
      resetPreview();
      observer = true;
      replay = true;
      return { case: recorded };
    }, 'Membuka rekaman jejak…');
  };
}

function ingredientEditor(ingredient) {
  const variantMode = ingredient.variant === null ? 'none' : ingredient.variant ? 'named' : 'unknown';
  const additives = ingredient.no_additives === true ? 'yes' : ingredient.no_additives === false ? 'no' : 'unknown';
  const summary = [ingredient.brand, ingredient.variant, ingredient.form === 'fresh' ? 'Segar' : '',
    ingredient.pack_condition === 'loose' ? 'Curah' : ''].filter(Boolean).map(escape).join(' · ');
  return `<details class="editor" data-id="${escape(ingredient.ingredient_id)}" ${ingredient.declared_name ? '' : 'open'}>
    <summary><span><span class="ingredient-name">${escape(ingredient.declared_name || 'Bahan baru')}</span>
    <small class="ingredient-meta" ${summary ? '' : 'hidden'}>${summary}</small></span><span class="edit-hint">Ubah</span></summary>
    <div class="grid">
      ${input('declared_name', 'Nama bahan', ingredient.declared_name, true)}
      ${input('brand', 'Merek', ingredient.brand)}
      ${select('variant_mode', 'Status varian', { unknown: 'Belum diketahui', named: 'Varian tertentu', none: 'Tanpa varian' }, variantMode)}
      ${input('variant', 'Nama varian', ingredient.variant)}
      ${select('form', 'Bentuk bahan', forms, ingredient.form)}
      ${select('pack_condition', 'Kondisi kemasan', conditions, ingredient.pack_condition)}
      ${input('purchase_location', 'Tempat pembelian', ingredient.purchase_location)}
      ${select('no_additives', 'Tanpa bahan tambahan', { unknown: 'Belum dipastikan', yes: 'Ya, tanpa tambahan', no: 'Ada tambahan' }, additives)}
    </div>
    <div class="actions"><button class="quiet remove" type="button">Hapus bahan</button></div>
  </details>`;
}

function wireEditorRow(row) {
  const variant = row.querySelector('[name=variant]');
  const mode = row.querySelector('[name=variant_mode]');
  const syncVariant = () => {
    variant.disabled = mode.value !== 'named';
    variant.required = mode.value === 'named';
  };
  row.addEventListener('invalid', () => { row.open = true; }, true);
  row.addEventListener('input', () => {
    const value = (name) => row.querySelector(`[name=${name}]`).value.trim();
    row.querySelector('.ingredient-name').textContent = value('declared_name') || 'Bahan baru';
    const meta = row.querySelector('.ingredient-meta');
    meta.textContent = [value('brand'), mode.value === 'named' ? value('variant') : '',
      value('form') === 'fresh' ? 'Segar' : '', value('pack_condition') === 'loose' ? 'Curah' : '']
      .filter(Boolean).join(' · ');
    meta.hidden = !meta.textContent;
  });
  mode.onchange = syncVariant;
  syncVariant();
  row.querySelector('.remove').onclick = () => {
    row.remove();
    workspace.querySelector('#add').focus();
  };
}

function showEditor() {
  const fromDraft = view.phase === 'intake_review';
  const source = fromDraft ? view.draft : view;
  const ingredients = source?.ingredients ?? [];
  const notes = source?.notes ?? [];
  workspace.innerHTML = `<div class="sheet">
    <h2>${fromDraft ? 'Ini bahan yang saya temukan' : 'Perbarui resep'}</h2>
    <p class="muted">${fromDraft ? 'Saya membaca rekaman dan label Anda. Cukup ubah bahan yang berbeda dari yang Anda pakai.' : 'Setelah disimpan, bukti dan usulan dari revisi ini perlu diperiksa kembali.'}</p>
    ${notes.length ? `<section class="note intake-note"><h3>Yang perlu Anda cek</h3><ul>${notes.map((note) => `<li>${escape(note)}</li>`).join('')}</ul><p>Pilih <strong>Ubah</strong> di bahan terkait, atau tambahkan bahan yang belum ada.</p></section>` : ''}
    ${source?.transcript ? `<details><summary>Transkrip rekaman</summary><p>${escape(source.transcript)}</p></details>` : ''}
    <form id="confirm-form">
      <details class="recipe-settings"><summary>Detail produk</summary><div class="grid">
        ${input('product_name', 'Nama produk', source?.product_name, true)}
        ${select('scope', 'Jenis produk', { snack: 'Camilan yang dicakup demo', facilitator_review: 'Produk atau proses yang perlu peninjauan' }, source?.scope)}
      </div></details>
      <div id="ingredients">${ingredients.map(ingredientEditor).join('')}</div>
      <button class="quiet" id="add" type="button">Tambah bahan</button>
      <p class="muted confirm-copy">Dengan memilih Periksa bahan ini, Anda menyatakan daftar ini sesuai dengan bahan yang Anda gunakan.</p>
      <div class="actions">
        <button class="primary" type="submit">Periksa bahan ini</button>
        ${fromDraft ? '' : '<button id="cancel-edit" type="button" class="quiet">Batal</button>'}
      </div>
    </form>
  </div>`;
  workspace.querySelectorAll('.editor').forEach(wireEditorRow);
  const list = workspace.querySelector('#ingredients');
  const settings = workspace.querySelector('.recipe-settings');
  settings.addEventListener('invalid', () => { settings.open = true; }, true);
  workspace.querySelector('#add').onclick = () => {
    list.insertAdjacentHTML('beforeend', ingredientEditor({ form: 'unknown', pack_condition: 'unknown' }));
    wireEditorRow(list.lastElementChild);
    list.lastElementChild.querySelector('input').focus();
  };
  const cancel = workspace.querySelector('#cancel-edit');
  if (cancel) cancel.onclick = () => { editing = false; render(); };

  workspace.querySelector('#confirm-form').onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const ingredients = [...list.children].map((row) => {
      const field = (name) => row.querySelector(`[name=${name}]`).value.trim();
      const variantMode = field('variant_mode');
      const additives = field('no_additives');
      return {
        ingredient_id: row.dataset.id || undefined,
        declared_name: field('declared_name'),
        brand: field('brand') || undefined,
        variant: variantMode === 'none' ? null : variantMode === 'named' ? field('variant') : undefined,
        form: field('form'),
        pack_condition: field('pack_condition'),
        purchase_location: field('purchase_location') || undefined,
        no_additives: additives === 'unknown' ? undefined : additives === 'yes',
      };
    });
    if (!ingredients.length) {
      message('Tambahkan setidaknya satu bahan sebelum konfirmasi.', true);
      workspace.querySelector('#add').focus();
      return;
    }
    run(async () => {
      const result = await request(path('confirm'), {
        revision: view.revision,
        product_name: form.elements.product_name.value,
        scope: form.elements.scope.value,
        reviewed: true,
        ingredients,
      });
      editing = false;
      return result;
    });
  };
}

function packRequest(ingredient) {
  return `<form class="pack-form" data-request="${escape(ingredient.pending_request.request_id)}">
    <fieldset>
      <legend>Foto kemasan · permintaan ${ingredient.pending_request.attempt} dari 2</legend>
      <p>Unggah bagian depan serta area yang menunjukkan produsen dan nomor sertifikat. Satu gambar cukup jika semuanya terlihat.</p>
      <div class="grid">
        ${select('condition', 'Kondisi kemasan', conditions, ingredient.pack_condition)}
        ${select('mode', 'Cara memberi bukti', { photo: 'Unggah foto', typed: 'Salin tulisan dari kemasan', no_pack: 'Tidak ada kemasan' }, 'photo')}
      </div>
      <label class="upload photo-fields">Foto kemasan<input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>
      <div class="typed-fields grid" hidden>
        ${input('product', 'Nama produk pada kemasan')}
        ${input('manufacturer', 'Produsen')}
        ${select('variant_mode', 'Status varian', { unknown: 'Tidak terbaca', named: 'Varian tertentu', none: 'Tanpa varian' }, 'unknown')}
        ${input('variant', 'Nama varian')}
        ${select('certificate_state', 'Nomor sertifikat', { printed: 'Tercetak', absent: 'Tidak tercetak', unreadable: 'Tidak terbaca' }, 'unreadable')}
        ${input('certificate_number', 'Nomor lengkap')}
      </div>
      <p class="current-confirm"><label><input type="checkbox" name="confirmed_current"> Ini kemasan bahan yang benar-benar saya pakai.</label></p>
      <button class="primary" type="submit">Kirim jawaban kemasan</button>
    </fieldset>
  </form>`;
}

function wirePack(form) {
  const mode = form.elements.mode;
  const condition = form.elements.condition;
  const syncMode = () => {
    if (condition.value === 'loose') mode.value = 'no_pack';
    const noPack = mode.value === 'no_pack';
    const photo = mode.value === 'photo';
    form.querySelector('.photo-fields').hidden = !photo;
    form.querySelector('.typed-fields').hidden = mode.value !== 'typed';
    form.querySelector('.current-confirm').hidden = noPack;
    form.elements.images.required = photo;
    form.elements.confirmed_current.required = !noPack;
  };
  mode.onchange = syncMode;
  condition.onchange = syncMode;
  syncMode();

  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData();
    data.set('revision', String(view.revision));
    data.set('request_id', form.dataset.request);
    data.set('condition', condition.value);
    data.set('mode', mode.value);
    data.set('confirmed_current', String(form.elements.confirmed_current.checked));
    if (mode.value === 'photo') {
      for (const file of form.elements.images.files) data.append('images', file);
    }
    if (mode.value === 'typed') {
      const value = (name) => form.elements[name].value.trim();
      const variantMode = value('variant_mode');
      const certificateState = value('certificate_state');
      const fields = {
        product: value('product') || null,
        manufacturer: value('manufacturer') || null,
        variant: variantMode === 'named' ? value('variant') || null : null,
        variant_known: variantMode === 'none' || (variantMode === 'named' && Boolean(value('variant'))),
        certificate_number: certificateState === 'printed' ? value('certificate_number') || null : null,
        certificate_state: certificateState,
        repacked: condition.value === 'repacked',
        unreadable_fields: [],
      };
      if (!fields.product) fields.unreadable_fields.push('product');
      if (!fields.manufacturer) fields.unreadable_fields.push('manufacturer');
      if (!fields.variant_known) fields.unreadable_fields.push('variant');
      if (certificateState === 'unreadable') fields.unreadable_fields.push('certificate_number');
      data.set('observed', JSON.stringify(fields));
    }
    run(() => request(path('pack'), data), 'Memeriksa bukti kemasan…');
  };
}

function evidenceLog(evidence) {
  if (!evidence.length) return '';
  return `<details><summary>Riwayat bukti (${evidence.length})</summary><ul>${evidence.map(({ observed, source_type, source_refs, conflicts, revision }) => {
    const fields = [
      observed.product || 'Produk tidak terbaca',
      observed.manufacturer || 'Produsen tidak terbaca',
      observed.variant_known ? observed.variant || 'Tanpa varian' : 'Varian belum diketahui',
      observed.certificate_number || (observed.certificate_state === 'absent' ? 'Nomor tidak tercetak' : 'Nomor tidak terbaca'),
    ];
    return `<li><strong>${source_type === 'photo' ? 'Pembacaan foto' : 'Salinan dari penjual'}</strong> · revisi ${revision}
      <p>${fields.map(escape).join(' · ')}</p>
      ${conflicts?.length ? `<p class="muted">${conflicts.map(escape).join(', ')}</p>` : ''}
      <small>${source_refs.map(escape).join(', ')}</small></li>`;
  }).join('')}</ul></details>`;
}

function offerCard(proposal) {
  const { listing, registry, status, proposal_id } = proposal;
  const stateText = {
    pending: 'Menunggu pilihan Anda',
    approved: 'Disetujui sebagai rencana, menunggu penerapan',
    declined: 'Ditolak',
  }[status];
  return `<section class="offer" aria-label="Usulan pengganti dari Shopee">
    <div class="row-head"><h3>${escape(listing.product)}${listing.variant ? ' · ' + escape(listing.variant) : ''}</h3><span class="badge">${escape(stateText)}</span></div>
    <p><strong>Penawaran simulasi Shopee · ${escape(listing.listing_id)}</strong></p>
    <dl>
      <dt>Varian</dt><dd>${escape(listing.variant || 'Tanpa varian')}</dd>
      <dt>Produsen</dt><dd>${escape(listing.manufacturer)}</dd>
      <dt>Toko</dt><dd>${escape(listing.shop)}</dd>
      <dt>Harga</dt><dd>${escape(idr.format(listing.price_idr))}</dd>
      <dt>Ukuran</dt><dd>${escape(listing.pack_size || 'Belum tercatat')}</dd>
      <dt>Dasar</dt><dd>${escape(registry.record_id)} · ${escape(registry.certificate_number)}</dd>
      <dt>Sumber</dt><dd>${escape(listing.source_ref)}</dd>
    </dl>
    <p>${escape(listing.fit)}</p>
    <p>Bahan pada resep saat ini tetap tercatat. Jika memilih untuk menerapkan usulan, konfirmasi kemasan produk yang benar-benar Anda gunakan.</p>
    ${!observer && view.phase !== 'paused' && status === 'pending' ? `<div class="actions" data-proposal="${escape(proposal_id)}">
      <button type="button" class="primary" data-decision="approve">Setujui sebagai rencana</button>
      <button type="button" data-decision="decline">Tolak usulan</button>
    </div>` : ''}
  </section>`;
}

function ingredientRow(ingredient) {
  const proposals = view.proposals.filter((proposal) => proposal.ingredient_id === ingredient.ingredient_id);
  return `<li class="ingredient">
    <div class="row-head">
      <h3>${escape(ingredient.declared_name)}${ingredient.variant ? ' · ' + escape(ingredient.variant) : ''}</h3>
      <span class="badge ${ingredient.status === 'unresolved' ? 'gap' : ''}">${statuses[ingredient.status]}</span>
    </div>
    <p class="muted">${[ingredient.brand, forms[ingredient.form], conditions[ingredient.pack_condition], ingredient.purchase_location].filter(Boolean).map(escape).join(' · ')}</p>
    ${ingredient.basis ? `<p>${escape(ingredient.basis)}</p>` : ''}
    ${evidenceLog(ingredient.evidence)}
    ${!observer && view.phase !== 'paused' && ingredient.pending_request ? packRequest(ingredient) : ''}
    ${proposals.map(offerCard).join('')}
  </li>`;
}

function trace() {
  const ingredientNames = new Map(view.ingredients.map((row) => [row.ingredient_id, row.declared_name]));
  const entries = view.events.map((event) => {
    const ingredient = ingredientNames.get(event.data.ingredient_id);
    const excluded = event.type === 'catalogue_searched' && Array.isArray(event.data.excluded)
      ? event.data.excluded : [];
    const exclusions = excluded.length ? `<details><summary>Penawaran yang disisihkan (${excluded.length})</summary>
      <ul>${excluded.filter((offer) => typeof offer?.listing_id === 'string' && typeof offer.reason === 'string')
        .map((offer) => `<li>${escape(offer.listing_id)} · ${escape(offer.reason)}</li>`).join('')}</ul></details>` : '';
    return `<li value="${event.seq}">${ingredient ? `<strong>${escape(ingredient)}</strong> · ` : ''}
      ${escape(event.data.summary)} <small class="muted">· revisi ${event.revision}</small>${exclusions}</li>`;
  });
  return `<section class="sheet trace"><h2>Jejak tindakan</h2><ol>${entries.join('')}</ol></section>`;
}

function download(body, mime, filename) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = url;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nextSellerAction() {
  if (observer || view.phase !== 'awaiting_seller') return '';
  const packs = view.ingredients.filter(row => row.pending_request);
  if (packs.length) {
    const names = packs.map(row => escape(row.declared_name)).join(', ');
    return `<section class="note intake-note"><h3>Foto yang saya perlukan</h3><p>${names}</p>
      <button type="button" class="quiet" id="next-seller-action">Buka permintaan foto</button></section>`;
  }
  if (view.proposals.some(offer => offer.status === 'pending')) {
    return `<section class="note intake-note"><h3>Saya menemukan calon pengganti</h3>
      <p>Lihat harga dan bukti produknya, lalu putuskan apakah pengganti ini cocok untuk resep Anda.</p>
      <button type="button" class="quiet" id="next-seller-action">Lihat usulan</button></section>`;
  }
  return '';
}

function showChecks() {
  const paused = view.phase === 'paused';
  const hasRecipe = view.confirmed_ingredient_ids.length > 0;
  workspace.innerHTML = `<div class="sheet">
    <div class="row-head"><h2>${view.phase === 'review_packet' ? 'Paket bukti bahan' : 'Bahan yang Anda gunakan'}</h2>
      <span class="badge">${sourceModes[view.source_mode] || 'Sumber kasus'} · revisi ${view.revision}</span></div>
    ${replay ? '<p class="note"><strong>Replay · Putar ulang rekaman.</strong> Jejak ini tersimpan dari sesi sebelumnya. Tampilan baca saja.</p>' :
      observer ? '<p class="note">Tampilan baca saja.</p>' : ''}
    ${view.scope === 'facilitator_review' && hasRecipe ? '<p class="note">Produk atau proses ini perlu ditinjau oleh fasilitator.</p>' : ''}
    ${paused ? '<p class="note">Pemeriksaan terjeda. Coba lagi untuk melanjutkan kasus ini.</p>' : ''}
    ${nextSellerAction()}
    ${hasRecipe ? `<ol class="ledger">${view.ingredients.map(ingredientRow).join('')}</ol>` : ''}
    ${!observer ? `<div class="actions">
      ${paused ? '<button type="button" class="primary" id="retry">Coba lagi</button>' : ''}
      ${paused && !hasRecipe ? '<a href="/">Mulai dengan rekaman atau label lain</a>' : ''}
      ${hasRecipe ? '<button type="button" class="quiet" id="edit">Ubah resep</button><button type="button" class="primary export" data-format="html">Unduh paket bukti</button><button type="button" class="quiet export" data-format="json">Unduh JSON</button><button type="button" class="quiet export" data-format="trace">Unduh rekaman jejak</button>' : ''}
    </div>` : ''}
  </div>${trace()}`;

  const next = workspace.querySelector('#next-seller-action');
  if (next) next.onclick = () => {
    const target = workspace.querySelector('.pack-form select') || workspace.querySelector('[data-decision]');
    target?.focus();
  };
  workspace.querySelectorAll('.pack-form').forEach(wirePack);
  workspace.querySelectorAll('[data-decision]').forEach((button) => {
    button.onclick = () => run(() => request(path('decision'), {
      revision: view.revision,
      proposal_id: button.closest('[data-proposal]').dataset.proposal,
      decision: button.dataset.decision,
    }));
  });
  const retry = workspace.querySelector('#retry');
  if (retry) retry.onclick = () => run(() => request(path('retry'), { revision: view.revision }));
  const edit = workspace.querySelector('#edit');
  if (edit) edit.onclick = () => {
    if (busy) return;
    editing = true;
    render();
    workspace.querySelector('#confirm-form input')?.focus();
  };
  workspace.querySelectorAll('.export').forEach((button) => {
    button.onclick = async () => {
      const result = await run(() => request(path('export'), { revision: view.revision }), 'Menyiapkan paket bukti…');
      if (!result) return;
      const stem = 'telusur-bukti-r' + view.revision;
      if (button.dataset.format === 'html' && typeof result.html === 'string') {
        download(result.html, 'text/html;charset=utf-8', stem + '.html');
      } else if (button.dataset.format === 'json' && result.packet) {
        download(JSON.stringify(result.packet, null, 2), 'application/json;charset=utf-8', stem + '.json');
      } else if (button.dataset.format === 'trace' && result.case) {
        const { draft: _privateDraft, error: _error, ...recorded } = result.case;
        download(JSON.stringify({ case: recorded }, null, 2), 'application/json;charset=utf-8', 'telusur-jejak-r' + view.revision + '.json');
      } else {
        message('Paket belum tersedia. Coba lagi.', true);
      }
    };
  });
}

function render() {
  const stage = editing || !view || view.phase === 'intake_review' ? 'intake'
    : view.phase === 'review_packet' ? 'packet' : 'checks';
  document.querySelectorAll('[data-stage]').forEach((step) => {
    if (step.dataset.stage === stage) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
  title.textContent = view?.product_name || view?.draft?.product_name || 'Susun bukti bahan resep';
  if (!view) showStart();
  else if (!observer && (view.phase === 'intake_review' || editing)) showEditor();
  else showChecks();
}

if (observerId) {
  observer = true;
  run(async () => {
    const result = await request('/api/cases/' + encodeURIComponent(observerId));
    return { case: result.case || result };
  });
} else {
  render();
}
