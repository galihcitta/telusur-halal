import { renderSourceReferences } from './source-references.js';

const workspace = document.querySelector('#workspace');
const notice = document.querySelector('#notice');
let view;
let session;
let editing = false;
let busy = false;
let observer = false;
let replay = false;
let screen;
let activePanel;
let intakeFiles;
const packPhotos = new Map();
const previews = new WeakMap();
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

const iconPaths = {
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>',
  audio: '<path d="M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4"/>',
  edit: '<path d="m14 5 5 5M5 14 16 3l5 5-11 11-6 1z"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;

function focusHeading() {
  workspace.querySelector('#page-title')?.focus();
}

function previewImage(canvas, file) {
  if (!canvas) return;
  previews.set(canvas, file);
  if (!file || typeof createImageBitmap !== 'function') return;
  createImageBitmap(file).then((image) => {
    if (previews.get(canvas) === file) {
      const scale = Math.min(1, 720 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false;
    }
    image.close();
  }).catch(() => {});
}

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
      const focusWasInWorkspace = workspace.contains(document.activeElement);
      view = result.case;
      render();
      if (focusWasInWorkspace) focusHeading();
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
  form.elements.label.onchange = () => {
    form.querySelector('.file-name').textContent = form.elements.label.files[0]?.name || 'Belum ada foto';
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
      if (result.case?.draft) {
        intakeFiles = { audio: URL.createObjectURL(data.get('audio')), label: data.get('label') };
      }
      resetPreview();
      return result;
    }, 'Membaca rekaman dan label…');
  };
  const dishForm = workspace.querySelector('#dish-form');
  dishForm.elements.dish.onchange = () => {
    dishForm.querySelector('.file-name').textContent = dishForm.elements.dish.files[0]?.name || 'Belum ada foto';
  };
  dishForm.onsubmit = (event) => {
    event.preventDefault();
    if (captureBusy || recorder?.state === 'recording') {
      message('Hentikan rekaman suara sebelum mengirim foto masakan.', true);
      return;
    }
    const data = new FormData(dishForm);
    run(async () => {
      const result = await request('/api/cases', data);
      session = result.session;
      intakeFiles = { dish: data.get('dish') };
      resetPreview();
      return result;
    }, 'Membaca foto masakan…');
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
    <small class="ingredient-meta" ${summary ? '' : 'hidden'}>${summary}</small></span><span class="edit-hint">${icon('edit')} Ubah</span></summary>
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
    updateConfirmLabel();
    workspace.querySelector('#add').focus();
  };
}

function updateConfirmLabel() {
  if (view.phase !== 'intake_review') return;
  const count = workspace.querySelector('#ingredients').childElementCount;
  workspace.querySelector('#confirm-form [type=submit]').textContent = count
    ? `Konfirmasi ${count} bahan` : 'Konfirmasi bahan';
}

function showEditor() {
  const fromDraft = view.phase === 'intake_review';
  const source = fromDraft ? view.draft : view;
  const ingredients = source?.ingredients ?? [];
  const notes = source?.notes ?? [];
  const dishCase = view.intake_kind === 'dish_photo';
  const dishDraft = fromDraft && dishCase;
  const dishSource = `<section class="note intake-note">
      <h3>${source?.product_name ? 'Saran dari foto' : 'Masakan belum bisa dikenali'}</h3>
      <p>${source?.product_name
        ? 'Nama masakan dan bahan yang terlihat masih berupa saran. Ubah atau hapus yang tidak sesuai dengan resep Anda.'
        : 'Coba foto yang lebih jelas atau isi sendiri nama masakan dan bahan yang Anda pakai.'}</p>
      <p>Tambahkan bahan yang tidak terlihat, seperti minyak goreng, saus, bumbu, atau kaldu, jika dipakai. Foto masakan tidak membuktikan bahan atau status halal dan tidak bisa dipakai sebagai bukti kemasan.</p>
      <a href="/">Pilih foto lain</a>
    </section>`;
  workspace.innerHTML = `<div class="review-heading">
    <h1 id="page-title" tabindex="-1">${fromDraft ? 'Cek daftar bahan' : 'Perbarui resep'}</h1>
    <p class="muted">${fromDraft ? (dishDraft ? 'Lengkapi daftar ini sebelum bahan diperiksa.' : 'Cocokkan dengan resep yang Anda pakai.') : 'Setelah disimpan, bukti dan usulan dari revisi ini perlu diperiksa kembali.'}</p>
    </div>
    <div class="review-layout">
    <aside class="sheet review-source">
      <h2>${fromDraft ? (dishDraft ? 'Foto masakan' : 'Suara dan label') : 'Resep saat ini'}</h2>
      ${dishDraft ? dishSource : ''}
      ${dishDraft ? '<canvas class="source-preview" role="img" aria-label="Foto masakan yang diunggah" hidden></canvas>' : ''}
      ${fromDraft && intakeFiles?.audio ? `<audio class="source-audio" controls preload="metadata" aria-label="Dengarkan catatan suara" src="${escape(intakeFiles.audio)}"></audio>
      <canvas class="source-preview" role="img" aria-label="Foto label yang diunggah" hidden></canvas>` : ''}
      ${source?.transcript ? `<details><summary>${icon('audio')} Transkrip rekaman</summary><p>${escape(source.transcript)}</p></details>` : ''}
      ${notes.length ? `<section class="note intake-note"><h3>Yang perlu Anda cek</h3><ul>${notes.map((note) => `<li>${escape(note)}</li>`).join('')}</ul><p>Pilih <strong>Ubah</strong> di bahan terkait, atau tambahkan bahan yang belum ada.</p></section>` : ''}
      ${!fromDraft ? `<p>${escape(source?.product_name)}</p>` : ''}
    </aside>
    <form id="confirm-form">
      ${dishCase ? input('product_name', 'Nama masakan', source?.product_name, true) :
        `<details class="recipe-settings"><summary>Detail produk</summary><div class="grid">
        ${input('product_name', 'Nama produk', source?.product_name, true)}
        ${select('scope', 'Jenis produk', { snack: 'Pemeriksaan bahan', facilitator_review: 'Produk atau proses yang perlu peninjauan' }, source?.scope)}
      </div></details>`}
      <div id="ingredients">${ingredients.map(ingredientEditor).join('')}</div>
      <button class="quiet" id="add" type="button">Tambah bahan</button>
      <p class="muted confirm-copy">Konfirmasi bahwa daftar ini sesuai dengan bahan yang Anda gunakan.</p>
      <div class="actions">
        <button class="primary" type="submit">${fromDraft ? 'Konfirmasi bahan' : 'Simpan perubahan'}</button>
        ${fromDraft ? '' : '<button id="cancel-edit" type="button" class="quiet">Batal</button>'}
      </div>
    </form>
  </div>`;
  previewImage(workspace.querySelector('.source-preview'), dishDraft ? intakeFiles?.dish : intakeFiles?.label);
  updateConfirmLabel();
  workspace.querySelectorAll('.editor').forEach(wireEditorRow);
  const list = workspace.querySelector('#ingredients');
  const settings = workspace.querySelector('.recipe-settings');
  settings?.addEventListener('invalid', () => { settings.open = true; }, true);
  workspace.querySelector('#add').onclick = () => {
    list.insertAdjacentHTML('beforeend', ingredientEditor({ form: 'unknown', pack_condition: 'unknown' }));
    wireEditorRow(list.lastElementChild);
    updateConfirmLabel();
    list.lastElementChild.querySelector('input').focus();
  };
  const cancel = workspace.querySelector('#cancel-edit');
  if (cancel) cancel.onclick = () => { editing = false; render(); focusHeading(); };

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
        scope: dishCase ? 'facilitator_review' : form.elements.scope.value,
        reviewed: true,
        ingredients,
      });
      editing = false;
      if (result.case?.phase !== 'intake_review' && intakeFiles) {
        if (intakeFiles.audio) URL.revokeObjectURL(intakeFiles.audio);
        intakeFiles = undefined;
      }
      return result;
    });
  };
}

function packRequest(ingredient) {
  return `<form class="pack-form" data-request="${escape(ingredient.pending_request.request_id)}">
    <fieldset>
      <legend>Foto kemasan · permintaan ${ingredient.pending_request.attempt} dari 2</legend>
      <div class="grid">
        ${select('condition', 'Kondisi kemasan', conditions, ingredient.pack_condition)}
        ${select('mode', 'Cara memberi bukti', { photo: 'Unggah foto', typed: 'Salin tulisan dari kemasan', no_pack: 'Tidak ada kemasan' }, 'photo')}
      </div>
      <div class="photo-fields">
        <div class="camera-preview" aria-hidden="true">${icon('camera')}</div>
        <canvas class="source-preview" role="img" aria-label="Pratinjau foto kemasan" hidden></canvas>
        <label class="upload upload-row camera-action">${icon('camera')}<span>Ambil foto
          <input name="capture" type="file" accept="image/png,image/jpeg,image/webp" capture="environment">
          <small class="file-name" aria-live="polite">Belum ada foto</small>
        </span></label>
        <label class="upload upload-row"><span>Pilih dari galeri
          <input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple>
          <small class="file-name" aria-live="polite">Belum ada foto</small>
        </span></label>
      </div>
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

function wirePack(form, ingredient) {
  const mode = form.elements.mode;
  const condition = form.elements.condition;
  const { capture, images } = form.elements;
  const photoFiles = () => capture.files.length ? capture.files : images.files;
  const canvas = form.querySelector('canvas');
  const camera = form.querySelector('.camera-preview');
  const syncMode = () => {
    if (condition.value === 'loose') mode.value = 'no_pack';
    const noPack = mode.value === 'no_pack';
    const photo = mode.value === 'photo';
    form.querySelector('.photo-fields').hidden = !photo;
    form.querySelector('.typed-fields').hidden = mode.value !== 'typed';
    form.querySelector('.current-confirm').hidden = noPack;
    images.required = photo && !capture.files.length;
    form.elements.confirmed_current.required = !noPack;
  };
  mode.onchange = syncMode;
  condition.onchange = syncMode;
  function updatePhoto(changed, other) {
    if (changed.files.length) other.value = '';
    for (const input of [capture, images]) {
      const selected = input.files;
      input.nextElementSibling.textContent = selected.length > 1
        ? selected.length + ' foto dipilih' : selected[0]?.name || 'Belum ada foto';
    }
    const file = photoFiles()[0];
    camera.hidden = Boolean(file);
    canvas.hidden = true;
    previewImage(canvas, file);
    syncMode();
  }
  capture.onchange = () => updatePhoto(capture, images);
  images.onchange = () => updatePhoto(images, capture);
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
      for (const file of photoFiles()) data.append('images', file);
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
    const submittedPhoto = mode.value === 'photo' && photoFiles().length === 1 ? photoFiles()[0] : undefined;
    run(async () => {
      const result = await request(path('pack'), data);
      const updated = result.case?.ingredients.find(row => row.ingredient_id === ingredient.ingredient_id);
      const accepted = updated?.evidence.some(item => item.request_id === form.dataset.request && item.source_type === 'photo');
      if (submittedPhoto && accepted) packPhotos.set(ingredient.ingredient_id, { request: form.dataset.request, file: submittedPhoto });
      if (updated && !updated.pending_request) activePanel = undefined;
      screen = undefined;
      return result;
    }, 'Memeriksa bukti kemasan…');
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
      ${source_type === 'photo' && session && !observer ? source_refs.filter(source => /^sha256:[a-f0-9]{64}$/.test(source))
        .map(source => `<canvas class="report-photo" data-photo-source="${escape(source)}" role="img" aria-label="Foto kemasan yang diunggah" hidden></canvas>`).join('') : ''}
      ${renderSourceReferences(source_refs, escape, source_type)}</li>`;
  }).join('')}</ul></details>`;
}

function offerCard(proposal) {
  const { listing, registry, status, proposal_id } = proposal;
  const stateText = {
    pending: 'Menunggu pilihan Anda',
    approved: 'Disetujui, belum dipakai',
    declined: 'Ditolak',
  }[status];
  const featured = listing.listing_id === 'L-9' && listing.product === 'Cabai Bubuk Halal';
  return `<section class="offer" aria-label="Usulan pengganti dari Shopee">
    <div class="offer-product">
      ${featured ? '<figure class="offer-photo"><img src="/assets/chili-powder.webp" alt="" width="640" height="640"><figcaption>Ilustrasi produk</figcaption></figure>' : ''}
      <div>
        <span class="badge gap">Shopee simulasi</span>
        <h3>${escape(listing.product)}${listing.variant ? ' · ' + escape(listing.variant) : ''}</h3>
        <p class="muted">${[listing.pack_size, listing.shop].filter(Boolean).map(escape).join(' · ')}</p>
        <p class="muted">${escape(listing.manufacturer)}</p>
        <p class="offer-price">${escape(idr.format(listing.price_idr))}</p>
      </div>
    </div>
    <p class="offer-registry"><strong>Registri simulasi</strong> · ${escape(registry.certificate_number)}</p>
    <details><summary>Detail produk dan sumber</summary>
    <dl>
      <dt>Varian</dt><dd>${escape(listing.variant || 'Tanpa varian')}</dd>
      <dt>Penawaran</dt><dd>${escape(listing.listing_id)}</dd>
      <dt>Dasar</dt><dd>${escape(registry.record_id)} · ${escape(registry.certificate_number)}</dd>
      <dt>Sumber</dt><dd>${escape(listing.source_ref)}</dd>
    </dl>
    <p>${escape(listing.fit)}</p></details>
    <p class="note">${status === 'pending' ? 'Resep berubah setelah bahan dipakai. Konfirmasi kemasan produk yang benar-benar Anda gunakan.' : escape(stateText)}</p>
    ${!observer && view.phase !== 'paused' && status === 'pending' ? `<div class="actions" data-proposal="${escape(proposal_id)}">
      <button type="button" class="primary" data-decision="approve">Setujui usulan</button>
      <button type="button" class="quiet" data-decision="decline">Tolak usulan</button>
    </div>` : ''}
  </section>`;
}

const evidenceCount = () => view.ingredients.filter(row => row.status === 'exempt' || row.status === 'verified').length;
const evidenceSummary = () => `${evidenceCount()} dari ${view.ingredients.length} bahan punya bukti`;
const ingredientTitle = (ingredient) => [ingredient.declared_name, ingredient.variant,
  ingredient.pack_condition === 'loose' && !/\bcurah\b/i.test(ingredient.declared_name) ? 'curah' : ''].filter(Boolean).join(' ');

function variantConflict(ingredient) {
  const latest = ingredient.evidence.at(-1);
  const observed = latest?.observed;
  if (ingredient.reason !== 'IDENTITY_MISMATCH' || latest?.revision !== view.revision ||
      !observed?.variant_known || !ingredient.variant) return undefined;
  const normal = (value) => value?.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (normal(ingredient.variant) !== normal(observed.variant)) return latest;
}

function mapStatus(ingredient) {
  if (variantConflict(ingredient)) return 'Varian berbeda';
  if (ingredient.pending_request) return 'Perlu foto';
  if (ingredient.reason === 'SCOPE_REVIEW') return 'Perlu tinjauan';
  if (ingredient.status === 'exempt') return 'Pengecualian';
  if (ingredient.status === 'verified') return 'Kemasan cocok';
  return ingredient.status === 'open' ? statuses.open : 'Bukti belum tersedia';
}

function panelButton(kind, label, id = '', classes = 'quiet') {
  return `<button class="${classes}" type="button" data-kind="${kind}" data-id="${escape(id)}">${label}</button>`;
}

function ingredientRow(ingredient) {
  const id = ingredient.ingredient_id;
  const settled = ingredient.status === 'verified' || ingredient.status === 'exempt';
  const active = !observer && view.phase !== 'paused';
  const pending = active && ingredient.pending_request;
  const offer = active && view.proposals.some(row => row.ingredient_id === id && row.status === 'pending');
  const canInspect = ingredient.basis || ingredient.evidence.length || view.proposals.some(row => row.ingredient_id === id);
  const status = `${settled ? icon('check') : icon('alert')} ${mapStatus(ingredient)}`;
  const badge = `badge ${settled ? 'confirmed' : 'gap'}`;
  return `<li class="ingredient">
    <div class="map-row ${!settled && !pending ? 'is-gap' : ''}">
      <div class="map-name"><h3>${escape(ingredientTitle(ingredient))}</h3></div>
      <span class="map-connector" aria-hidden="true"></span>
      <div class="map-status">${canInspect ? panelButton('evidence', status, id, badge) : `<span class="${badge}">${status}</span>`}</div>
      ${pending ? panelButton('pack', variantConflict(ingredient) ? 'Foto ulang' : 'Foto kemasan', id, 'quiet row-action') : ''}
      ${offer ? panelButton('offer', 'Lihat opsi di Shopee <span aria-hidden="true">→</span>', id, 'primary row-action') : ''}
    </div>
  </li>`;
}

function productBanner() {
  const name = view.product_name;
  return name ? `<div class="product-banner compact ${/keripik pisang/i.test(name) ? 'has-photo' : ''}">
    <div class="product-copy"><p class="product-eyebrow">Produk Anda</p><p class="hero-title">${escape(name)}</p></div>
  </div>` : '';
}

function evidencePanel(ingredient) {
  const meta = [ingredient.brand, forms[ingredient.form], conditions[ingredient.pack_condition], ingredient.purchase_location]
    .filter(Boolean).map(escape).join(' · ');
  return `<h1 id="page-title" tabindex="-1">${escape(ingredientTitle(ingredient))}</h1>
    ${meta ? `<p class="muted">${meta}</p>` : ''}
    ${ingredient.basis ? `<p>${escape(ingredient.basis)}</p>` : ''}
    ${evidenceLog(ingredient.evidence)}
    ${view.proposals.filter(row => row.ingredient_id === ingredient.ingredient_id).map(offerCard).join('')}`;
}

function packPanel(ingredient) {
  const mismatch = variantConflict(ingredient);
  return `<h1 id="page-title" tabindex="-1">${mismatch ? 'Varian berbeda' : 'Foto kemasan'}</h1>
    <p class="muted">${escape(ingredientTitle(ingredient))}</p>
    ${mismatch ? `<div class="variant-comparison">
      <canvas class="source-preview mismatch-photo" role="img" aria-label="Foto kemasan yang diperiksa" hidden></canvas>
      <dl><div><dt>Resep Anda</dt><dd>${escape(ingredient.variant)}</dd></div>
      <div><dt>Foto atau tulisan pada kemasan</dt><dd>${escape(mismatch.observed.variant || 'Tanpa varian')}</dd></div></dl>
    </div><p class="note">${icon('alert')} Bukti belum cocok. Gunakan kemasan dengan varian yang tercantum pada resep.</p>`
      : '<p>Pastikan nama produk, produsen, varian, dan nomor sertifikat terbaca. Satu foto cukup jika semuanya terlihat.</p>'}
    ${packRequest(ingredient)}`;
}

function trace() {
  const strings = (items) => Array.isArray(items) ? items.filter((item) => typeof item === 'string') : [];
  const ingredientNames = new Map(view.ingredients.map((row) => [row.ingredient_id, row.declared_name]));
  const entries = view.events.map((event) => {
    const ingredient = ingredientNames.get(event.data.ingredient_id);
    const excluded = event.type === 'catalogue_searched' && Array.isArray(event.data.excluded)
      ? event.data.excluded : [];
    const exclusions = excluded.length ? `<details><summary>Penawaran yang disisihkan (${excluded.length})</summary>
      <ul>${excluded.filter((offer) => typeof offer?.listing_id === 'string' && typeof offer.reason === 'string')
        .map((offer) => `<li>${escape(offer.listing_id)} · ${escape(offer.reason)}</li>`).join('')}</ul></details>` : '';
    const toolResult = event.type === 'agent_tool_result' ? `
      <details><summary>Input dan hasil alat</summary>
      <pre class="trace-output">${escape(JSON.stringify({ input: event.data.input, result: event.data.result }, null, 2))}</pre></details>` : '';
    const pending = event.type === 'seller_wait' ? [
      ['Foto kemasan', event.data.pack_ingredients],
      ['Keputusan pengganti', event.data.decisions],
    ].map(([label, items]) => [label, strings(items)]).filter(([, items]) => items.length)
      .map(([label, items]) => `<div>${label} · ${items.map(escape).join(', ')}</div>`).join('') : '';
    const eligibleIds = strings(event.data.eligible);
    const eligible = event.type === 'catalogue_searched' && event.data.searched === true && Array.isArray(event.data.eligible)
      ? `<div>Penawaran yang sesuai · ${eligibleIds.map(escape).join(', ') || 'Tidak ada'}</div>` : '';
    const listing = event.type === 'substitute_proposed' && typeof event.data.listing_id === 'string'
      ? `<div>Penawaran terpilih · ${escape(event.data.listing_id)}</div>` : '';
    return `<li value="${event.seq}">${ingredient ? `<strong>${escape(ingredient)}</strong> · ` : ''}
      ${event.type === 'agent_tool_result' && typeof event.data.tool === 'string' ? `<code>${escape(event.data.tool)}</code> · ` : ''}
      ${escape(event.data.summary)} <small class="muted">· revisi ${event.revision}</small>${toolResult}${pending}${eligible}${listing}${exclusions}</li>`;
  });
  return `<section class="trace"><h1 id="page-title" tabindex="-1">Riwayat cek</h1><ol>${entries.join('')}</ol></section>`;
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

const hasRecipe = () => Boolean(view?.confirmed_ingredient_ids.length);

function caseInfo() {
  return `<div class="case-info">
    ${replay ? '<p class="note"><strong>Replay · Putar ulang rekaman.</strong> Tampilan baca saja.</p>' :
      observer ? '<p class="note">Tampilan baca saja.</p>' : ''}
    ${view.scope === 'facilitator_review' && hasRecipe() ? '<p class="note">Produk atau proses ini perlu ditinjau oleh fasilitator. Bukti setiap bahan tetap diperiksa secara terpisah.</p>' : ''}
    ${view.phase === 'paused' ? '<p class="note">Pemeriksaan terjeda. Coba lagi untuk melanjutkan kasus ini.</p>' : ''}
    <p class="case-source muted">${replay ? sourceModes.replay : (view.source_mode === 'actual_media' && view.intake_kind === 'dish_photo' ? 'Unggahan foto masakan' : sourceModes[view.source_mode]) || 'Sumber kasus'} · Revisi ${view.revision}</p>
  </div>`;
}

function packetView() {
  const approved = view.proposals.filter(proposal => proposal.status === 'approved');
  const currentEvents = view.events.filter(event => event.revision === view.revision);
  const searches = currentEvents.filter(event => event.type === 'catalogue_searched' && event.data.searched === true);
  const unmatched = view.ingredients.filter(row => {
    const latest = searches.findLast(event => event.data.ingredient_id === row.ingredient_id);
    return Array.isArray(latest?.data.eligible) && latest.data.eligible.length === 0;
  });
  const noProposals = view.proposals.some(proposal => proposal.status === 'pending')
    ? 'Tinjau usulan yang menunggu keputusan di tab Bukti.'
    : view.proposals.length ? 'Belum ada usulan yang disetujui.'
    : searches.length ? 'Pencarian tidak menemukan pengganti yang sesuai.'
    : 'Pencarian pengganti belum dilakukan. Lihat status tiap bahan di tab Bukti.';
  return `<div class="packet-layout">
    <section class="sheet packet-summary">
      <h1 id="page-title" tabindex="-1">Berkas bukti bahan</h1>
      <div class="recipe-columns">
        <section><h2>Resep saat ini</h2><p class="evidence-count">${evidenceSummary()}</p>
        <ul class="report-ingredients">${view.ingredients.map(row => {
          const supported = row.status === 'verified' || row.status === 'exempt';
          const verdict = currentEvents.findLast(event => event.type === 'evidence_checked' &&
            event.data.ingredient_id === row.ingredient_id);
          const sources = Array.isArray(verdict?.data.source_refs) ? verdict.data.source_refs
            : Array.isArray(row.source_refs) ? row.source_refs : [];
          const evidence = row.evidence.filter(item => item.revision === view.revision);
          return `<li>
            <strong>${escape(ingredientTitle(row))}</strong>
            <span class="badge ${supported ? 'confirmed' : 'gap'}">${icon(supported ? 'check' : 'alert')} <span>${escape(mapStatus(row))}</span></span>
            ${row.basis ? `<p>${escape(row.basis)}</p>` : ''}
            ${renderSourceReferences(sources, escape)}
            ${evidenceLog(evidence)}
          </li>`;
        }).join('')}</ul></section>
        <section><h2>Usulan pengganti</h2>
        ${approved.length ? `<ul>${approved.map(({ listing, registry }) => `<li><strong>${[listing.product, listing.variant, listing.pack_size].filter(Boolean).map(escape).join(' · ')}</strong>
        <p class="muted">${escape(registry.certificate_number)} · Registri simulasi</p>
        <span class="badge gap">${icon('alert')} Disetujui, belum dipakai</span></li>`).join('')}</ul>`
        : !unmatched.length || view.proposals.length ? `<p class="muted">${noProposals}</p>` : ''}
        ${unmatched.length ? `<p class="muted">Katalog Shopee simulasi belum memiliki pengganti yang sesuai untuk bahan berikut. Bawa daftar ini ke fasilitator untuk meninjau pilihan lain.</p>
        <ul>${unmatched.map(row => `<li>${escape(row.declared_name)}</li>`).join('')}</ul>` : ''}</section>
      </div>
    </section>
    <aside class="sheet handoff-panel">
      <h2>Untuk fasilitator</h2>
      <ul class="checklist">
        <li>Konfirmasi bahan dan kemasan yang dipakai</li>
        <li>Lengkapi dokumen usaha dan penanggung jawab halal</li>
        <li>Tinjau proses, produk, dan dokumen bersama fasilitator</li>
      </ul>
      <p class="muted">Belum diajukan</p>
      ${!observer ? `<button type="button" class="primary export" data-format="html">Unduh berkas bukti</button>
      <details><summary>Format lainnya</summary><div class="actions">
        <button type="button" class="quiet export" data-format="json">Unduh JSON</button>
        <button type="button" class="quiet export" data-format="trace">Unduh rekaman jejak</button>
      </div></details>` : ''}
      ${panelButton('history', 'Riwayat cek', '', 'subtle-link')}
    </aside>
  </div>`;
}

function showChecks(stage) {
  const paused = view.phase === 'paused';
  const ingredient = activePanel?.id && view.ingredients.find(row => row.ingredient_id === activePanel.id);
  const proposals = view.proposals.filter(row => row.ingredient_id === ingredient?.ingredient_id);
  let panel = '';
  if (activePanel?.kind === 'history') panel = trace();
  if (ingredient) {
    if (activePanel.kind === 'pack' && ingredient.pending_request && !observer && !paused) panel = packPanel(ingredient);
    if (activePanel.kind === 'evidence') panel = evidencePanel(ingredient);
    if (activePanel.kind === 'offer' && proposals.length) {
      panel = `<h1 id="page-title" tabindex="-1">Opsi pengganti</h1><p class="muted">Untuk ${escape(ingredientTitle(ingredient))}</p>
        ${[...proposals].reverse().map(offerCard).join('')}`;
    }
  }
  const packet = stage === 'packet' && !panel;
  const heading = panel ? '<h2>Peta bukti bahan</h2>' : '<h1 id="page-title" tabindex="-1">Peta bukti bahan</h1>';
  workspace.innerHTML = `${productBanner()}${caseInfo()}
    ${packet ? packetView() : `<div class="case-layout ${panel ? 'has-panel' : ''}">
      <section class="sheet map-panel">
        <div class="map-heading">${heading}
          ${hasRecipe() ? `<p class="evidence-count">${evidenceSummary()}</p>` : ''}
        </div>
        ${hasRecipe() ? `<ol class="ledger">${view.ingredients.map(ingredientRow).join('')}</ol>` : '<p class="muted">Belum ada daftar bahan yang dikonfirmasi.</p>'}
        <div class="case-actions">${panelButton('history', 'Riwayat cek', '', 'subtle-link')}</div>
      </section>
      ${panel ? `<aside class="sheet case-panel">${panelButton('back', '← Kembali ke bukti', '', 'subtle-link panel-back')}${panel}</aside>` : ''}
    </div>`}
    ${!observer ? `<div class="case-actions">
      ${paused ? '<button type="button" class="primary" id="retry">Coba lagi</button>' : ''}
      ${paused && !hasRecipe() ? `<a href="/">${view.intake_kind === 'dish_photo' ? 'Pilih foto lain' : 'Mulai dengan rekaman atau label lain'}</a>` : ''}
      ${hasRecipe() && !packet ? '<button type="button" class="quiet" id="edit">Ubah resep</button>' : ''}
    </div>` : ''}`;

  workspace.querySelectorAll('[data-kind]').forEach(button => {
    button.onclick = () => {
      if (busy) return;
      screen = 'checks';
      activePanel = button.dataset.kind === 'back' ? undefined : { kind: button.dataset.kind, id: button.dataset.id };
      render();
      focusHeading();
    };
  });
  workspace.querySelectorAll('[data-photo-source]').forEach(canvas => {
    const details = canvas.closest('details');
    details.addEventListener('toggle', async () => {
      if (!details.open || canvas.dataset.loaded) return;
      canvas.dataset.loaded = 'true';
      try {
        const response = await fetch(path('photos/' + encodeURIComponent(canvas.dataset.photoSource)), {
          headers: { Authorization: 'Bearer ' + session },
        });
        if (!response.ok) throw new Error('Foto tidak tersedia.');
        previewImage(canvas, await response.blob());
      } catch {
        delete canvas.dataset.loaded;
      }
    });
  });
  const pack = workspace.querySelector('.pack-form');
  if (pack) {
    wirePack(pack, ingredient);
    const photo = packPhotos.get(ingredient.ingredient_id);
    if (photo && photo.request === variantConflict(ingredient)?.request_id) {
      previewImage(workspace.querySelector('.mismatch-photo'), photo.file);
    }
  }
  workspace.querySelectorAll('[data-decision]').forEach((button) => {
    button.onclick = () => run(async () => {
      const result = await request(path('decision'), {
        revision: view.revision,
        proposal_id: button.closest('[data-proposal]').dataset.proposal,
        decision: button.dataset.decision,
      });
      if (result.case?.phase === 'review_packet') {
        screen = undefined;
        activePanel = undefined;
      }
      return result;
    });
  });
  const retry = workspace.querySelector('#retry');
  if (retry) retry.onclick = () => run(() => request(path('retry'), { revision: view.revision }));
  const edit = workspace.querySelector('#edit');
  if (edit) edit.onclick = () => {
    if (busy) return;
    editing = true;
    screen = undefined;
    activePanel = undefined;
    render();
    focusHeading();
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
    : screen || (view.phase === 'review_packet' ? 'packet' : 'checks');
  document.querySelectorAll('[data-stage]').forEach((step) => {
    if (step.dataset.stage === stage) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
    step.disabled = step.dataset.stage === 'intake'
      ? observer || Boolean(view && !hasRecipe() && stage !== 'intake')
      : !hasRecipe() && step.dataset.stage !== stage;
    step.onclick = () => {
      if (busy || step.dataset.stage === stage) return;
      editing = step.dataset.stage === 'intake';
      screen = editing ? undefined : step.dataset.stage;
      activePanel = undefined;
      render();
      focusHeading();
    };
  });
  if (!view) showStart();
  else if (!observer && (view.phase === 'intake_review' || editing)) showEditor();
  else showChecks(stage);
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
