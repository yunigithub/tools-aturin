'use strict';
/* Image Tools - everything runs in the browser, files are never uploaded. */

const $ = (id) => document.getElementById(id);
let uid = 0;

const state = {
  files: [],          // { id, name, blob, img, width, height, size, type, edited, caption }
  activeId: null,
  work: document.createElement('canvas'),
  orig: document.createElement('canvas'),
  exportFormat: 'png',
  exportQuality: 0.92,
  tool: null,
  cropRatio: null,
  pfBg: '#d32f2f',
  bfBg: '#d32f2f',
  smPreset: null,
  faviconBlobs: null,
};

const TOOL_LABELS = {
  compress: 'Compress', resize: 'Resize', upscale: 'Upscale', convert: 'Convert',
  svg: 'SVG to PNG', crop: 'Crop', rotate: 'Rotate', watermark: 'Watermark',
  sensor: 'Censor', bgremove: 'Remove Background', heic: 'HEIC to JPG',
  eps: 'EPS to PNG', photopea: 'Edit in Photopea', pasfoto: 'Passport Photo', bgfoto: 'Change Passport Photo Background',
  qr: 'QR Code', merge: 'Merge Images', sosmed: 'Social Media Sizes',
  metadata: 'Remove Metadata', favicon: 'Favicon', signature: 'Transparent Signature',
  a4: 'A4 Photo Report',
};

/* ---------- util ---------- */
function fmtBytes(n) {
  if (!isFinite(n) || n < 0) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
function showStatus(msg, type) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (type ? ' ' + type : '');
}
function extFor(format) { return format === 'jpeg' ? 'jpg' : format; }
function baseName(name) { return (name || 'image').replace(/\.[^.]+$/, ''); }
function copyCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
function flattenCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0);
  return c;
}
function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    const type = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const src = format === 'jpeg' ? flattenCanvas(canvas) : canvas;
    src.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('failed to create the file.'));
    }, type, format === 'png' ? undefined : quality);
  });
}
function workToBlob(format, quality) { return canvasToBlob(state.work, format, quality); }
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('the image file could not be read.')); };
    img.src = url;
  });
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- SVG ---------- */
function svgToBlob(text, targetWidth) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  let aspect = 1;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) aspect = p[2] / p[3];
  } else {
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (w > 0 && h > 0) aspect = w / h;
  }
  const W = Math.max(16, Math.round(targetWidth || 1024));
  const H = Math.max(1, Math.round(W / aspect));
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  const out = new XMLSerializer().serializeToString(doc);
  return new Blob([out], { type: 'image/svg+xml' });
}

/* ---------- incoming files ---------- */
function activeEntry() {
  return state.files.find((f) => f.id === state.activeId) || null;
}
function makeEntry(name, blob, img) {
  return {
    id: ++uid, name, blob, img,
    width: img.naturalWidth, height: img.naturalHeight,
    size: blob.size, type: blob.type || 'image/png',
    edited: null, caption: '',
  };
}
async function fileToEntry(file) {
  const name = file.name || 'image';
  const lower = name.toLowerCase();
  if (/\.(heic|heif)$/.test(lower) || file.type === 'image/heic' || file.type === 'image/heif') {
    if (typeof heic2any === 'undefined') throw new Error('the HEIC library has not loaded yet. Check your internet connection, then reload the page.');
    const out = await heic2any({ blob: file, toType: 'image/png' });
    const blob = Array.isArray(out) ? out[0] : out;
    const img = await loadImage(blob);
    return makeEntry(name.replace(/\.(heic|heif)$/i, '.png'), blob, img);
  }
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(lower)) {
    const text = await file.text();
    const blob = svgToBlob(text, 1024);
    const img = await loadImage(blob);
    return makeEntry(name, blob, img);
  }
  if (!file.type || !file.type.startsWith('image/')) throw new Error('not an image file.');
  const img = await loadImage(file);
  return makeEntry(name, file, img);
}
async function addFiles(list) {
  const arr = Array.from(list || []);
  if (!arr.length) return;
  for (const file of arr) {
    try {
      const entry = await fileToEntry(file);
      if (entry) state.files.push(entry);
    } catch (err) {
      showStatus('Failed to load ' + file.name + ': ' + (err && err.message ? err.message : 'file not supported.'), 'err');
    }
  }
  renderFileList();
  renderA4Captions();
  if (!state.activeId && state.files.length) setActive(state.files[0].id);
  else updatePreview();
}
function renderFileList() {
  const wrap = $('fileList');
  wrap.innerHTML = '';
  state.files.forEach((f) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip' + (f.id === state.activeId ? ' active' : '');
    const thumb = document.createElement('img');
    thumb.src = URL.createObjectURL(f.blob);
    thumb.alt = f.name;
    const label = document.createElement('span');
    label.textContent = f.name + ' (' + f.width + 'x' + f.height + ')';
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'rm'; rm.textContent = 'x';
    rm.title = 'Remove this file';
    rm.addEventListener('click', (ev) => { ev.stopPropagation(); removeFile(f.id); });
    chip.appendChild(thumb); chip.appendChild(label); chip.appendChild(rm);
    chip.addEventListener('click', () => setActive(f.id));
    wrap.appendChild(chip);
  });
}
function removeFile(id) {
  const idx = state.files.findIndex((f) => f.id === id);
  if (idx < 0) return;
  state.files.splice(idx, 1);
  if (state.activeId === id) {
    state.activeId = null;
    if (state.files.length) setActive(state.files[0].id);
    else {
      state.work.width = 0; state.work.height = 0;
      $('previewWrap').hidden = true;
      $('noImageHint').hidden = false;
      $('imgInfo').textContent = '';
    }
  }
  renderFileList();
  renderA4Captions();
}
function stashWork() {
  const e = activeEntry();
  if (e) e.edited = copyCanvas(state.work);
}
function setActive(id) {
  const prev = activeEntry();
  if (prev && prev.id !== id) stashWork();
  const entry = state.files.find((f) => f.id === id);
  if (!entry) return;
  state.activeId = id;
  const src = entry.edited || entry.img;
  state.work.width = src.naturalWidth || src.width;
  state.work.height = src.naturalHeight || src.height;
  state.work.getContext('2d').drawImage(src, 0, 0);
  state.orig.width = entry.img.naturalWidth;
  state.orig.height = entry.img.naturalHeight;
  state.orig.getContext('2d').drawImage(entry.img, 0, 0);
  overlay.rects = [];
  renderOverlay();
  syncResizeInputs();
  renderFileList();
  $('previewWrap').hidden = false;
  $('noImageHint').hidden = true;
  updatePreview();
}
function resetToOriginal() {
  const entry = activeEntry();
  if (!entry) { showStatus('No image yet.', 'err'); return; }
  state.work.width = state.orig.width;
  state.work.height = state.orig.height;
  state.work.getContext('2d').drawImage(state.orig, 0, 0);
  entry.edited = null;
  overlay.rects = [];
  renderOverlay();
  syncResizeInputs();
  updatePreview();
  showStatus('Image restored to its original.', 'ok');
}

/* ---------- preview ---------- */
let infoToken = 0;
async function updateInfo() {
  const token = ++infoToken;
  const entry = activeEntry();
  if (!state.work.width) { $('imgInfo').textContent = ''; return; }
  const base = 'Size: ' + state.work.width + ' x ' + state.work.height + ' px'
    + (entry ? ' | Original file: ' + fmtBytes(entry.size) : '');
  $('imgInfo').textContent = base + ' | Result: calculating...';
  try {
    const blob = await workToBlob($('dlFormat').value, Number($('dlQuality').value) / 100);
    if (token !== infoToken) return;
    $('imgInfo').textContent = base + ' | Result: ' + fmtBytes(blob.size) + ' (' + $('dlFormat').value.toUpperCase() + ')';
  } catch (e) { /* ignore, info still shows without the result size */ }
}
function updatePreview() {
  const pv = $('previewCanvas');
  pv.width = state.work.width;
  pv.height = state.work.height;
  pv.getContext('2d').drawImage(state.work, 0, 0);
  updateInfo();
}
async function reloadWork(blob) {
  const img = await loadImage(blob);
  state.work.width = img.naturalWidth;
  state.work.height = img.naturalHeight;
  state.work.getContext('2d').drawImage(img, 0, 0);
  updatePreview();
}
async function downloadCurrent() {
  const entry = activeEntry();
  if (!entry) { showStatus('No image yet.', 'err'); return; }
  try {
    const format = $('dlFormat').value;
    const blob = await workToBlob(format, Number($('dlQuality').value) / 100);
    downloadBlob(blob, baseName(entry.name) + '-result.' + extFor(format));
    showStatus('File downloaded.', 'ok');
  } catch (err) {
    showStatus('Download failed: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- crop and censor overlay ---------- */
const overlay = { mode: null, rects: [], drag: null };
function layerRect() { return $('overlayLayer').getBoundingClientRect(); }
function pointToImage(ev) {
  const r = layerRect();
  const W = state.work.width, H = state.work.height;
  if (!W || !H) return null;
  const x = Math.max(0, Math.min(W, ((ev.clientX - r.left) / r.width) * W));
  const y = Math.max(0, Math.min(H, ((ev.clientY - r.top) / r.height) * H));
  return { x, y };
}
function renderOverlay() {
  const layer = $('overlayLayer');
  layer.innerHTML = '';
  if (!overlay.mode || !state.work.width) { layer.hidden = true; return; }
  layer.hidden = false;
  const W = state.work.width, H = state.work.height;
  overlay.rects.forEach((rc, i) => {
    const div = document.createElement('div');
    div.className = 'overlay-rect';
    div.style.left = (rc.x / W * 100) + '%';
    div.style.top = (rc.y / H * 100) + '%';
    div.style.width = (rc.w / W * 100) + '%';
    div.style.height = (rc.h / H * 100) + '%';
    div.dataset.index = String(i);
    if (overlay.mode === 'crop') {
      ['nw', 'ne', 'sw', 'se'].forEach((pos) => {
        const h = document.createElement('div');
        h.className = 'overlay-handle ' + pos;
        h.dataset.handle = pos;
        div.appendChild(h);
      });
    }
    layer.appendChild(div);
  });
  const count = $('snCount');
  if (count) count.textContent = overlay.mode === 'sensor'
    ? (overlay.rects.length ? overlay.rects.length + ' censor boxes created.' : 'No censor boxes yet.')
    : count.textContent;
}
function setOverlayMode(mode) {
  overlay.mode = mode;
  if (mode === 'crop' && overlay.rects.length > 1) overlay.rects = overlay.rects.slice(0, 1);
  renderOverlay();
}
function clampRect(rc) {
  const W = state.work.width, H = state.work.height;
  rc.w = Math.max(4, Math.min(W - rc.x, rc.w));
  rc.h = Math.max(4, Math.min(H - rc.y, rc.h));
  rc.x = Math.max(0, Math.min(W - 4, rc.x));
  rc.y = Math.max(0, Math.min(H - 4, rc.y));
  return rc;
}
function applyRatioToRect(rc) {
  const ratio = state.cropRatio;
  if (!ratio) return;
  rc.h = Math.max(4, Math.round(rc.w / ratio));
  if (rc.y + rc.h > state.work.height) {
    rc.h = state.work.height - rc.y;
    rc.w = Math.round(rc.h * ratio);
  }
  if (rc.x + rc.w > state.work.width) {
    rc.w = state.work.width - rc.x;
    rc.h = Math.max(4, Math.round(rc.w / ratio));
  }
}
function overlayPointerDown(ev) {
  if (!overlay.mode || !state.work.width) return;
  ev.preventDefault();
  const layer = $('overlayLayer');
  layer.setPointerCapture(ev.pointerId);
  const p = pointToImage(ev);
  if (!p) return;
  const handle = ev.target.dataset && ev.target.dataset.handle;
  const rectEl = ev.target.closest ? ev.target.closest('.overlay-rect') : null;
  const idx = rectEl ? Number(rectEl.dataset.index) : -1;
  if (handle && idx >= 0) {
    overlay.drag = { type: 'resize', index: idx, handle, start: p, orig: Object.assign({}, overlay.rects[idx]) };
    return;
  }
  if (idx >= 0) {
    overlay.drag = { type: 'move', index: idx, start: p, orig: Object.assign({}, overlay.rects[idx]) };
    return;
  }
  const rc = { x: p.x, y: p.y, w: 4, h: 4 };
  if (overlay.mode === 'crop') {
    overlay.rects = [rc];
    overlay.drag = { type: 'new', index: 0, start: p, orig: rc };
  } else {
    overlay.rects.push(rc);
    overlay.drag = { type: 'new', index: overlay.rects.length - 1, start: p, orig: rc };
  }
  renderOverlay();
}
function overlayPointerMove(ev) {
  if (!overlay.drag) return;
  const p = pointToImage(ev);
  if (!p) return;
  const d = overlay.drag;
  const rc = overlay.rects[d.index];
  if (!rc) return;
  if (d.type === 'move') {
    rc.x = d.orig.x + (p.x - d.start.x);
    rc.y = d.orig.y + (p.y - d.start.y);
    rc.x = Math.max(0, Math.min(state.work.width - rc.w, rc.x));
    rc.y = Math.max(0, Math.min(state.work.height - rc.h, rc.y));
  } else if (d.type === 'resize') {
    const o = d.orig;
    if (d.handle === 'se') { rc.w = p.x - o.x; rc.h = p.y - o.y; }
    if (d.handle === 'nw') { rc.w = (o.x + o.w) - p.x; rc.h = (o.y + o.h) - p.y; rc.x = p.x; rc.y = p.y; }
    if (d.handle === 'ne') { rc.w = p.x - o.x; rc.h = (o.y + o.h) - p.y; rc.y = p.y; }
    if (d.handle === 'sw') { rc.w = (o.x + o.w) - p.x; rc.h = p.y - o.y; rc.x = p.x; }
    if (overlay.mode === 'crop') applyRatioToRect(rc);
    clampRect(rc);
  } else if (d.type === 'new') {
    rc.x = Math.min(d.start.x, p.x);
    rc.y = Math.min(d.start.y, p.y);
    rc.w = Math.max(4, Math.abs(p.x - d.start.x));
    rc.h = Math.max(4, Math.abs(p.y - d.start.y));
    if (overlay.mode === 'crop') applyRatioToRect(rc);
    clampRect(rc);
  }
  renderOverlay();
}
function overlayPointerUp() { overlay.drag = null; }

/* ---------- switch tool ---------- */
function openTool(name) {
  state.tool = name;
  document.querySelectorAll('.tool-panel').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.tool-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === name);
  });
  const panel = $('panel-' + name);
  if (panel) panel.hidden = false;
  if (name === 'crop' || name === 'sensor') setOverlayMode(name);
  else setOverlayMode(null);
  if (name === 'a4') renderA4Captions();
  if (name === 'photopea') ensureEditorBridge().catch(() => {});
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- basic transforms (used by single tools and batch) ---------- */
function resizeCanvas(src, w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function drawWatermarkOn(canvas, s) {
  const ctx = canvas.getContext('2d');
  const scale = Math.max(0.3, canvas.width / 1000);
  const size = Math.max(10, Math.round(s.size * scale));
  const pad = Math.round(canvas.width * 0.03);
  ctx.save();
  ctx.globalAlpha = s.opacity;
  ctx.fillStyle = s.color;
  ctx.font = 'bold ' + size + 'px sans-serif';
  ctx.textBaseline = 'middle';
  let x, y;
  if (s.pos === 'tl') { ctx.textAlign = 'left'; x = pad; y = pad + size / 2; }
  else if (s.pos === 'tr') { ctx.textAlign = 'right'; x = canvas.width - pad; y = pad + size / 2; }
  else if (s.pos === 'bl') { ctx.textAlign = 'left'; x = pad; y = canvas.height - pad - size / 2; }
  else if (s.pos === 'br') { ctx.textAlign = 'right'; x = canvas.width - pad; y = canvas.height - pad - size / 2; }
  else { ctx.textAlign = 'center'; x = canvas.width / 2; y = canvas.height / 2; }
  ctx.fillText(s.text, x, y);
  ctx.restore();
}
function rotateCanvas(src, deg) {
  const rad = deg * Math.PI / 180;
  const swap = deg === 90 || deg === 270;
  const c = document.createElement('canvas');
  c.width = swap ? src.height : src.width;
  c.height = swap ? src.width : src.height;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2);
  x.rotate(rad);
  x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
function flipCanvas(src, axis) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  if (axis === 'h') { x.translate(c.width, 0); x.scale(-1, 1); }
  else { x.translate(0, c.height); x.scale(1, -1); }
  x.drawImage(src, 0, 0);
  return c;
}
function coverDraw(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
async function compressCanvas(canvas, format, quality, targetKb) {
  if (!targetKb || format === 'png') {
    return canvasToBlob(canvas, format, quality);
  }
  let lo = 0.05, hi = 1, best = null;
  for (let i = 0; i < 12; i++) {
    const q = (lo + hi) / 2;
    const b = await canvasToBlob(canvas, format, q);
    if (b.size <= targetKb * 1024) { best = b; lo = q; }
    else { hi = q; }
    if (hi - lo < 0.02) break;
  }
  if (!best) best = await canvasToBlob(canvas, format, 0.05);
  return best;
}

/* ---------- 1. compress ---------- */
async function applyCompress() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const format = $('cmpFormat').value;
  const quality = Number($('cmpQuality').value) / 100;
  const target = Number($('cmpTarget').value) || 0;
  try {
    const before = (await workToBlob(format, quality)).size;
    const blob = await compressCanvas(state.work, format, quality, target);
    await reloadWork(blob);
    state.exportFormat = format;
    $('dlFormat').value = format;
    $('cmpEstimate').textContent = 'Before: ' + fmtBytes(before) + ', after: ' + fmtBytes(blob.size) + '.'
      + (target && blob.size > target * 1024 ? ' The ' + target + ' KB target was not reached, even at the lowest quality.' : '');
    showStatus('Compression done, result size ' + fmtBytes(blob.size) + '.', 'ok');
  } catch (err) {
    showStatus('Compression failed: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- 2. resize ---------- */
function syncResizeInputs() {
  $('rsWidth').value = state.work.width || '';
  $('rsHeight').value = state.work.height || '';
}
function applyResizeValues(w, h) {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  if (!w || !h || w < 1 || h < 1) { showStatus('Enter a valid width and height.', 'err'); return; }
  state.work = resizeCanvas(state.work, w, h);
  syncResizeInputs();
  updatePreview();
  showStatus('Resize done: ' + state.work.width + ' x ' + state.work.height + ' px.', 'ok');
}
function onResizeWidthInput() {
  if (!$('rsLock').checked) return;
  const w = Number($('rsWidth').value);
  const h0 = state.orig.height, w0 = state.orig.width;
  if (w > 0 && w0 > 0 && h0 > 0) $('rsHeight').value = Math.max(1, Math.round(w * h0 / w0));
}
function onResizeHeightInput() {
  if (!$('rsLock').checked) return;
  const h = Number($('rsHeight').value);
  const h0 = state.orig.height, w0 = state.orig.width;
  if (h > 0 && w0 > 0 && h0 > 0) $('rsWidth').value = Math.max(1, Math.round(h * w0 / h0));
}

/* ---------- 3. convert ---------- */
async function applyConvert() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const format = $('cvFormat').value;
  try {
    const blob = await canvasToBlob(state.work, format, 0.92);
    await reloadWork(blob);
    state.exportFormat = format;
    $('dlFormat').value = format;
    showStatus('Converted to ' + format.toUpperCase() + ', size ' + fmtBytes(blob.size) + '.', 'ok');
  } catch (err) {
    showStatus('Conversion failed: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- 4. crop ---------- */
function applyCrop() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const rc = overlay.rects[0];
  if (!rc) { showStatus('Draw a crop box first by dragging over the image.', 'err'); return; }
  const sx = Math.round(rc.x), sy = Math.round(rc.y);
  const sw = Math.round(rc.w), sh = Math.round(rc.h);
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(state.work, sx, sy, sw, sh, 0, 0, sw, sh);
  state.work = c;
  overlay.rects = [];
  renderOverlay();
  syncResizeInputs();
  updatePreview();
  showStatus('Crop done: ' + sw + ' x ' + sh + ' px.', 'ok');
}

/* ---------- 5. rotate ---------- */
function applyRotate(deg) {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  state.work = rotateCanvas(state.work, deg);
  syncResizeInputs();
  updatePreview();
  showStatus('Image rotated ' + deg + ' degrees.', 'ok');
}
function applyFlip(axis) {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  state.work = flipCanvas(state.work, axis);
  updatePreview();
  showStatus(axis === 'h' ? 'Image flipped horizontally.' : 'Image flipped vertically.', 'ok');
}

/* ---------- 6. watermark ---------- */
function watermarkSettings() {
  return {
    text: $('wmText').value.trim() || 'Image Tools',
    pos: $('wmPos').value,
    size: Number($('wmSize').value),
    opacity: Number($('wmOpacity').value) / 100,
    color: $('wmColor').value,
  };
}
function applyWatermark() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  drawWatermarkOn(state.work, watermarkSettings());
  updatePreview();
  showStatus('Watermark applied.', 'ok');
}

/* ---------- 7. censor ---------- */
function applySensor() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  if (!overlay.rects.length) { showStatus('Draw a censor box first by dragging over the image.', 'err'); return; }
  const mode = $('snMode').value;
  const n = overlay.rects.length;
  const ctx = state.work.getContext('2d');
  overlay.rects.forEach((rc) => {
    const x = Math.round(rc.x), y = Math.round(rc.y);
    const w = Math.round(rc.w), h = Math.round(rc.h);
    if (mode === 'black') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
    } else if (mode === 'pixel') {
      const small = document.createElement('canvas');
      const bw = Math.max(1, Math.round(w / 14)), bh = Math.max(1, Math.round(h / 14));
      small.width = bw; small.height = bh;
      small.getContext('2d').drawImage(state.work, x, y, w, h, 0, 0, bw, bh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, bw, bh, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = 'blur(12px)';
      ctx.drawImage(state.work, 0, 0);
      ctx.restore();
      ctx.filter = 'none';
    }
  });
  overlay.rects = [];
  renderOverlay();
  updatePreview();
  showStatus('Censor applied to ' + n + ' areas.', 'ok');
}

/* ---------- 8 and 11. remove background ---------- */
let bgModule = null;
function setBgStatus(msg) {
  const el = $('bgStatus');
  if (el) el.textContent = msg || '';
  const bf = $('bfStatus');
  if (bf) bf.textContent = msg || '';
}
async function removeBgBlob(blob) {
  try {
    if (!bgModule) {
      setBgStatus('Loading the AI library, please wait...');
      const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
      bgModule = mod.removeBackground
        || (mod.default && mod.default.removeBackground)
        || mod.default;
      if (typeof bgModule !== 'function') throw new Error('the background removal library could not be loaded.');
    }
    const out = await bgModule(blob, {
      progress: (key, current, total) => {
        if (total > 0) setBgStatus('Downloading the AI model... ' + Math.round((current / total) * 100) + '%');
        else setBgStatus('Processing the image with AI...');
      },
    });
    return out;
  } catch (err) {
    showStatus('Background removal failed: ' + (err && err.message ? err.message : 'the AI model could not be loaded. Check your internet connection and try again.'), 'err');
    setBgStatus('');
    return null;
  }
}
async function applyBgRemove() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  setBgStatus('Preparing the image...');
  const blob = await workToBlob('png', 1);
  const cut = await removeBgBlob(blob);
  if (!cut) return;
  const img = await loadImage(cut);
  state.work.width = img.naturalWidth;
  state.work.height = img.naturalHeight;
  state.work.getContext('2d').drawImage(img, 0, 0);
  state.exportFormat = 'png';
  $('dlFormat').value = 'png';
  setBgStatus('');
  updatePreview();
  showStatus('Background removed, the result is a transparent PNG.', 'ok');
}
async function applyBgFoto() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  setBgStatus('Removing the background with AI...');
  const blob = await workToBlob('png', 1);
  const cut = await removeBgBlob(blob);
  if (!cut) return;
  const img = await loadImage(cut);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.fillStyle = state.bfBg;
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0);
  state.work = c;
  state.exportFormat = 'png';
  $('dlFormat').value = 'png';
  setBgStatus('');
  syncResizeInputs();
  updatePreview();
  showStatus('Background changed to your chosen color.', 'ok');
}

/* ---------- 9. HEIC to JPG ---------- */
let heicFile = null;
async function convertHeic() {
  const file = heicFile;
  if (!file) { $('heicStatus').textContent = 'Choose a HEIC file first.'; return; }
  const lower = (file.name || '').toLowerCase();
  if (!(/\.(heic|heif)$/.test(lower) || file.type === 'image/heic' || file.type === 'image/heif')) {
    $('heicStatus').textContent = 'This file is not HEIC. Choose a .heic or .heif file.';
    return;
  }
  if (typeof heic2any === 'undefined') {
    $('heicStatus').textContent = 'The HEIC library has not loaded yet. Check your internet connection, then reload the page.';
    return;
  }
  $('heicStatus').textContent = 'Converting HEIC to JPG...';
  try {
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(out) ? out[0] : out;
    const img = await loadImage(blob);
    const entry = makeEntry(file.name.replace(/\.(heic|heif)$/i, '.jpg'), blob, img);
    state.files.push(entry);
    setActive(entry.id);
    downloadBlob(blob, entry.name);
    $('heicStatus').textContent = 'HEIC converted to JPG and downloaded.';
  } catch (err) {
    $('heicStatus').textContent = 'HEIC conversion failed: ' + (err && err.message ? err.message : 'the file could not be read.');
  }
}

/* ---------- 10. passport photo ---------- */
const PAS_SIZES = { '2x3': [236, 354], '3x4': [354, 472], '4x6': [472, 709] };
function applyPasFoto() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const size = PAS_SIZES[$('pfSize').value] || PAS_SIZES['4x6'];
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  const x = c.getContext('2d');
  x.fillStyle = state.pfBg;
  x.fillRect(0, 0, c.width, c.height);
  coverDraw(x, state.work, 0, 0, c.width, c.height);
  state.work = c;
  syncResizeInputs();
  updatePreview();
  showStatus('Passport photo ' + $('pfSize').value + ' cm created (' + size[0] + ' x ' + size[1] + ' px).', 'ok');
}
function buildSheet4R(mixed) {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const W = 1200, H = 1800, margin = 40, gap = 24;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, W, H);
  let y = margin;
  let count = 0;
  const rows = mixed
    ? [{ n: 2, size: '4x6' }, { n: 2, size: '3x4' }, { n: 4, size: '2x3' }]
    : (() => {
        const key = $('pfSize').value;
        const s = PAS_SIZES[key];
        const cols = Math.max(1, Math.floor((W - 2 * margin + gap) / (s[0] + gap)));
        const rowsCount = Math.max(1, Math.floor((H - 2 * margin + gap) / (s[1] + gap)));
        const arr = [];
        for (let r = 0; r < rowsCount; r++) arr.push({ n: cols, size: key });
        return arr;
      })();
  rows.forEach((row) => {
    const s = PAS_SIZES[row.size];
    const rowW = row.n * s[0] + (row.n - 1) * gap;
    let rx = Math.round((W - rowW) / 2);
    for (let i = 0; i < row.n; i++) {
      coverDraw(x, state.work, rx, y, s[0], s[1]);
      rx += s[0] + gap;
      count++;
    }
    y += s[1] + gap;
  });
  state.work = c;
  syncResizeInputs();
  updatePreview();
  showStatus('4R sheet created with ' + count + ' photos (' + (mixed ? 'mixed: 2 photos at 4x6, 2 at 3x4, 4 at 2x3' : 'size ' + $('pfSize').value + ' cm') + '). Download it as a JPG with the Download Result button.', 'ok');
}

/* ---------- 12. QR code ---------- */
function qrContent() {
  if ($('qrType').value === 'wa') {
    const num = ($('qrWa').value || '').replace(/\D/g, '');
    if (!num) return '';
    return 'https://wa.me/' + num;
  }
  return ($('qrText').value || '').trim();
}
function makeQr() {
  if (typeof QRCode === 'undefined') {
    showStatus('The QR library has not loaded yet. Check your internet connection, then reload the page.', 'err');
    return;
  }
  const text = qrContent();
  if (!text) { showStatus('The QR content is still empty.', 'err'); return; }
  const out = $('qrOut');
  out.innerHTML = '';
  const size = Number($('qrSize').value) || 512;
  new QRCode(out, {
    text,
    width: size,
    height: size,
    colorDark: $('qrDark').value,
    colorLight: $('qrLight').value,
    correctLevel: QRCode.CorrectLevel.M,
  });
  showStatus('QR code created.', 'ok');
}
function downloadQr() {
  const out = $('qrOut');
  const canvas = out.querySelector('canvas');
  if (canvas) {
    canvas.toBlob((b) => { if (b) downloadBlob(b, 'qr-code.png'); }, 'image/png');
    return;
  }
  const img = out.querySelector('img');
  if (img && img.src) {
    const a = document.createElement('a');
    a.href = img.src; a.download = 'qr-code.png';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  showStatus('Create a QR code first.', 'err');
}

/* ---------- 13. merge images ---------- */
async function applyMerge() {
  if (state.files.length < 2) { showStatus('You need at least 2 images to merge.', 'err'); return; }
  const dir = $('mgDir').value;
  const gap = Math.max(0, Number($('mgGap').value) || 0);
  const bg = $('mgBg').value;
  const imgs = state.files.map((f) => f.edited || f.img);
  const widths = imgs.map((im) => im.naturalWidth || im.width);
  const heights = imgs.map((im) => im.naturalHeight || im.height);
  let W, H;
  if (dir === 'vertical') {
    W = Math.max.apply(null, widths);
    H = heights.reduce((a, b) => a + b, 0) + gap * (imgs.length - 1);
  } else if (dir === 'horizontal') {
    W = widths.reduce((a, b) => a + b, 0) + gap * (imgs.length - 1);
    H = Math.max.apply(null, heights);
  } else {
    const cols = Math.max(2, Number($('mgCols').value) || 2);
    const cellW = Math.max.apply(null, widths);
    const cellH = Math.max.apply(null, heights);
    const rows = Math.ceil(imgs.length / cols);
    W = cols * cellW + gap * (cols + 1);
    H = rows * cellH + gap * (rows + 1);
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  if (dir === 'vertical') {
    let y = 0;
    imgs.forEach((im, i) => {
      const w = widths[i], h = heights[i];
      x.drawImage(im, Math.round((W - w) / 2), y, w, h);
      y += h + gap;
    });
  } else if (dir === 'horizontal') {
    let xx = 0;
    imgs.forEach((im, i) => {
      const w = widths[i], h = heights[i];
      x.drawImage(im, xx, Math.round((H - h) / 2), w, h);
      xx += w + gap;
    });
  } else {
    const cols = Math.max(2, Number($('mgCols').value) || 2);
    const cellW = Math.max.apply(null, widths);
    const cellH = Math.max.apply(null, heights);
    imgs.forEach((im, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = gap + col * (cellW + gap) + Math.round((cellW - widths[i]) / 2);
      const cy = gap + row * (cellH + gap) + Math.round((cellH - heights[i]) / 2);
      x.drawImage(im, cx, cy, widths[i], heights[i]);
    });
  }
  const blob = await canvasToBlob(c, 'png');
  const img = await loadImage(blob);
  const entry = makeEntry('merged.png', blob, img);
  entry.edited = copyCanvas(c);
  state.files.push(entry);
  setActive(entry.id);
  showStatus('Images merged (' + W + ' x ' + H + ' px).', 'ok');
}

/* ---------- 14. social media sizes ---------- */
function applySosmed() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  if (!state.smPreset) { showStatus('Choose a size preset first.', 'err'); return; }
  const tw = state.smPreset.w, th = state.smPreset.h;
  const mode = $('smMode').value;
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  if (mode === 'cover') {
    coverDraw(x, state.work, 0, 0, tw, th);
  } else {
    x.fillStyle = $('smBg').value;
    x.fillRect(0, 0, tw, th);
    const iw = state.work.width, ih = state.work.height;
    const scale = Math.min(tw / iw, th / ih);
    const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
    x.drawImage(state.work, Math.round((tw - dw) / 2), Math.round((th - dh) / 2), dw, dh);
  }
  state.work = c;
  syncResizeInputs();
  updatePreview();
  showStatus('Size changed to ' + state.smPreset.label + ' (' + tw + ' x ' + th + ' px).', 'ok');
}

/* ---------- 15. remove metadata ---------- */
async function applyMetadata() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  try {
    const before = (await workToBlob('png', 1)).size;
    const blob = await canvasToBlob(state.work, 'png');
    await reloadWork(blob);
    $('mdNote').textContent = 'Metadata (EXIF, GPS, camera info, date) has been removed. The image was re-saved without metadata. Before: '
      + fmtBytes(before) + ', after: ' + fmtBytes(blob.size) + '.';
    showStatus('Metadata removed.', 'ok');
  } catch (err) {
    showStatus('Removing metadata failed: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- 16. favicon ---------- */
function buildIco(pngs) {
  const count = pngs.length;
  const headerLen = 6 + 16 * count;
  let total = headerLen;
  pngs.forEach((p) => { total += p.data.length; });
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  v.setUint16(0, 0, true);
  v.setUint16(2, 1, true);
  v.setUint16(4, count, true);
  let offset = headerLen;
  pngs.forEach((p, i) => {
    const o = 6 + 16 * i;
    v.setUint8(o, p.size >= 256 ? 0 : p.size);
    v.setUint8(o + 1, p.size >= 256 ? 0 : p.size);
    v.setUint8(o + 2, 0);
    v.setUint8(o + 3, 0);
    v.setUint16(o + 4, 1, true);
    v.setUint16(o + 6, 32, true);
    v.setUint32(o + 8, p.data.length, true);
    v.setUint32(o + 12, offset, true);
    new Uint8Array(buf, offset, p.data.length).set(p.data);
    offset += p.data.length;
  });
  return new Blob([buf], { type: 'image/x-icon' });
}
async function buildFavicon() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const s = Math.min(state.work.width, state.work.height);
  const sx = Math.round((state.work.width - s) / 2);
  const sy = Math.round((state.work.height - s) / 2);
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(state.work, sx, sy, s, s, 0, 0, size, size);
    const blob = await canvasToBlob(c, 'png');
    pngs.push({ size, blob, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const ico = buildIco(pngs);
  state.faviconBlobs = { pngs, ico };
  $('fvList').textContent = 'Ready: favicon-16.png, favicon-32.png, favicon-48.png, favicon.ico.';
  $('fvDownload').disabled = false;
  showStatus('Favicon created.', 'ok');
}
async function downloadFaviconZip() {
  if (!state.faviconBlobs) { showStatus('Create a favicon first.', 'err'); return; }
  if (typeof JSZip === 'undefined') {
    showStatus('The ZIP library has not loaded yet. Check your internet connection, then reload the page.', 'err');
    return;
  }
  const zip = new JSZip();
  state.faviconBlobs.pngs.forEach((p) => zip.file('favicon-' + p.size + '.png', p.blob));
  zip.file('favicon.ico', state.faviconBlobs.ico);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, 'favicon.zip');
  showStatus('Favicon ZIP downloaded.', 'ok');
}

/* ---------- 17. transparent signature ---------- */
function applySignature() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const threshold = Number($('sgThreshold').value);
  const ctx = state.work.getContext('2d');
  const imgData = ctx.getImageData(0, 0, state.work.width, state.work.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum >= threshold) d[i + 3] = 0;
    else d[i + 3] = Math.max(0, Math.min(255, Math.round(255 - (lum / threshold) * 255)));
  }
  ctx.putImageData(imgData, 0, 0);
  state.exportFormat = 'png';
  $('dlFormat').value = 'png';
  updatePreview();
  showStatus('Transparent signature created. Download it as a PNG so the transparency is kept.', 'ok');
}

/* ---------- 18. A4 photo report ---------- */
function renderA4Captions() {
  const wrap = $('a4Captions');
  wrap.innerHTML = '';
  state.files.forEach((f) => {
    const div = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Caption for ' + f.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = f.caption || '';
    input.placeholder = 'Write a caption for this photo';
    input.maxLength = 120;
    input.addEventListener('input', () => { f.caption = input.value; });
    label.appendChild(input);
    div.appendChild(label);
    wrap.appendChild(div);
  });
}
function buildA4() {
  if (!state.files.length) { showStatus('Choose an image first.', 'err'); return; }
  const prev = $('a4Preview');
  prev.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = $('a4Title').value.trim() || 'Photo Report';
  prev.appendChild(title);
  state.files.forEach((f) => {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f.blob);
    img.alt = f.name;
    const cap = document.createElement('figcaption');
    cap.textContent = f.caption || f.name;
    fig.appendChild(img);
    fig.appendChild(cap);
    prev.appendChild(fig);
  });
  $('a4PreviewWrap').hidden = false;
  $('a4PreviewWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showStatus('A4 report is ready. Press Print / Save PDF to print it.', 'ok');
}

/* ---------- upscale ---------- */
function sharpenCanvas(canvas, amount) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const s = src.data, d = dst.data;
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let v = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const px = Math.min(w - 1, Math.max(0, x + kx));
            const py = Math.min(h - 1, Math.max(0, y + ky));
            v += s[(py * w + px) * 4 + ch] * k[(ky + 1) * 3 + (kx + 1)];
          }
        }
        const orig = s[idx + ch];
        d[idx + ch] = Math.max(0, Math.min(255, Math.round(orig + (v - orig) * amount)));
      }
      d[idx + 3] = s[idx + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
}
function upscaleCanvasMode(scale, sharpen) {
  const src = state.work;
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  if (sharpen) {
    if (c.width * c.height <= 20000000) sharpenCanvas(c, 0.6);
    else showStatus('The result image is too large for sharpening, so that step was skipped.', '');
  }
  state.work = c;
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}
function setUpStatus(msg) { const el = $('upStatus'); if (el) el.textContent = msg || ''; }
async function upscaleAIMode(scale) {
  const pixels = state.work.width * state.work.height;
  if (pixels > 2000000) {
    showStatus('This image is too large for AI mode on this device (max about 2 MP). Use canvas mode.', 'err');
    return false;
  }
  try {
    setUpStatus('Loading TensorFlow.js and the ESRGAN model, please wait...');
    if (typeof tf === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js');
    }
    const modelGlobal = scale === 2 ? 'ESRGANMedium2x' : 'ESRGANMedium4x';
    if (typeof window[modelGlobal] === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-medium@latest/dist/umd/' + scale + 'x.min.js');
    }
    if (typeof Upscaler === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/upscaler@latest/dist/browser/umd/upscaler.min.js');
    }
    const upscaler = new Upscaler({ model: window[modelGlobal] });
    setUpStatus('AI model ready, processing the image...');
    const out = await upscaler.upscale(state.work, {
      output: 'canvas',
      progress: (p) => { setUpStatus('Processing with AI... ' + Math.round(p * 100) + '%'); },
    });
    if (!out || !out.width) throw new Error('the AI model did not produce an image.');
    state.work = out;
    setUpStatus('AI upscale done.');
    return true;
  } catch (err) {
    showStatus('AI mode failed: ' + (err && err.message ? err.message : 'the model could not be loaded.'), 'err');
    setUpStatus('');
    return false;
  }
}
async function applyUpscale() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  const scale = Number($('upScale').value) || 2;
  const mode = $('upMode').value;
  const before = state.work.width + ' x ' + state.work.height;
  if (mode === 'ai') {
    const ok = await upscaleAIMode(scale);
    if (ok) {
      syncResizeInputs();
      updatePreview();
      $('upInfo').textContent = 'Before: ' + before + ' px, after: ' + state.work.width + ' x ' + state.work.height + ' px (AI ESRGAN mode).';
      showStatus('AI upscale done.', 'ok');
      return;
    }
    showStatus('AI mode failed to load, using canvas mode.', 'err');
  }
  setUpStatus('Processing with canvas mode...');
  upscaleCanvasMode(scale, $('upSharpen').checked);
  setUpStatus('');
  syncResizeInputs();
  updatePreview();
  $('upInfo').textContent = 'Before: ' + before + ' px, after: ' + state.work.width + ' x ' + state.work.height + ' px (canvas mode).';
  showStatus('Upscale done: ' + state.work.width + ' x ' + state.work.height + ' px.', 'ok');
}

/* ---------- SVG to PNG ---------- */
async function convertSvgFile() {
  const input = $('svgInput');
  const file = input.files && input.files[0];
  if (!file) { $('svgStatus').textContent = 'Choose an SVG file first.'; return; }
  const width = Math.max(16, Number($('svgWidth').value) || 1024);
  const format = $('svgFormat').value;
  try {
    const text = await file.text();
    const blob = svgToBlob(text, width);
    const img = await loadImage(blob);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const outBlob = await canvasToBlob(c, format, 0.92);
    const entry = makeEntry(
      file.name.replace(/\.svg$/i, '.' + (format === 'jpeg' ? 'jpg' : format)),
      outBlob, img
    );
    state.files.push(entry);
    setActive(entry.id);
    state.exportFormat = format;
    $('dlFormat').value = format;
    $('svgStatus').textContent = 'SVG converted to ' + format.toUpperCase() + ', size ' + c.width + ' x ' + c.height + ' px.';
    showStatus('SVG converted.', 'ok');
  } catch (err) {
    $('svgStatus').textContent = 'Failed to convert SVG: ' + (err && err.message ? err.message : 'invalid file.');
  }
}

/* ---------- EPS via Photopea ---------- */
let epsFile = null;
function setEpsStatus(msg) { const el = $('epsStatus'); if (el) el.textContent = msg || ''; }
async function convertEps() {
  if (!epsFile) { setEpsStatus('Choose an EPS, AI, or PSD file first.'); return; }
  const format = $('epsFormat').value;
  const targetWidth = Math.max(0, Number($('epsWidth').value) || 0);
  try {
    setEpsStatus('Loading Photopea...');
    const bridge = getHiddenPhotopeaBridge();
    await bridge.ready();
    setEpsStatus('Opening the file in Photopea...');
    const buf = await epsFile.arrayBuffer();
    await bridge.openFile(buf);
    if (targetWidth > 0) {
      setEpsStatus('Setting the result width to ' + targetWidth + ' px...');
      await bridge.resizeToWidth(targetWidth);
    }
    setEpsStatus('Exporting to ' + format.toUpperCase() + '...');
    const blob = await bridge.exportImage(format);
    if (!blob) throw new Error('Photopea did not return a result file.');
    const img = await loadImage(blob);
    const outName = epsFile.name.replace(/\.(eps|ai|psd|ps)$/i, '') + '.' + (format === 'jpeg' ? 'jpg' : format);
    const entry = makeEntry(outName, blob, img);
    state.files.push(entry);
    setActive(entry.id);
    state.exportFormat = format;
    $('dlFormat').value = format;
    setEpsStatus('');
    showStatus('EPS converted to ' + format.toUpperCase() + ' through Photopea.', 'ok');
  } catch (err) {
    setEpsStatus('');
    showStatus('EPS conversion failed: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- Edit di Photopea ---------- */
let editorBridge = null;
function setPpStatus(msg) { const el = $('ppStatus'); if (el) el.textContent = msg || ''; }
async function ensureEditorBridge() {
  if (editorBridge) return editorBridge;
  const frame = $('ppFrame');
  if (!frame.getAttribute('src')) frame.setAttribute('src', PHOTOPEA_URL);
  editorBridge = new PhotopeaBridge(frame);
  setPpStatus('Loading Photopea, please wait...');
  try {
    await editorBridge.ready();
    setPpStatus('Photopea is ready. Send the active image to start editing.');
  } catch (err) {
    setPpStatus('Photopea could not be loaded. Check your internet connection, then open this tool again.');
    editorBridge = null;
    throw err;
  }
  return editorBridge;
}
async function sendActiveToPhotopea() {
  if (!activeEntry()) { showStatus('Choose an image first.', 'err'); return; }
  try {
    setPpStatus('Loading Photopea...');
    const bridge = await ensureEditorBridge();
    setPpStatus('Sending the image to Photopea...');
    const blob = await workToBlob('png', 1);
    await bridge.openFile(await blob.arrayBuffer());
    setPpStatus('Image sent. Edit it directly in the Photopea editor above.');
    showStatus('Active image sent to Photopea.', 'ok');
  } catch (err) {
    setPpStatus('');
    showStatus('Failed to send to Photopea: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}
async function fetchFromPhotopea() {
  if (!editorBridge) { setPpStatus('Open the Photopea editor first and send an image.'); return; }
  try {
    setPpStatus('Getting the result from Photopea...');
    const blob = await editorBridge.exportImage('png');
    if (!blob) throw new Error('Photopea did not return an image.');
    const img = await loadImage(blob);
    const entry = makeEntry('photopea-result.png', blob, img);
    state.files.push(entry);
    setActive(entry.id);
    state.exportFormat = 'png';
    $('dlFormat').value = 'png';
    setPpStatus('The Photopea result is now the active image.');
    showStatus('The edited result from Photopea was retrieved.', 'ok');
  } catch (err) {
    setPpStatus('');
    showStatus('Failed to get the result: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- batch ZIP ---------- */
function toolLabel(name) { return TOOL_LABELS[name] || name; }
function imageToCanvas(img) {
  if (img instanceof HTMLCanvasElement) return copyCanvas(img);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}
async function batchTransform(entry, tool) {
  const img = entry.edited || entry.img;
  const src = imageToCanvas(img);
  if (tool === 'compress') {
    const format = $('cmpFormat').value;
    const quality = Number($('cmpQuality').value) / 100;
    const target = Number($('cmpTarget').value) || 0;
    const blob = await compressCanvas(src, format, quality, target);
    return { blob, name: baseName(entry.name) + '-compressed.' + extFor(format) };
  }
  if (tool === 'resize') {
    const w = Number($('rsWidth').value);
    const h = Number($('rsHeight').value);
    if (!w || !h) throw new Error('enter the resize width and height first.');
    const c = resizeCanvas(src, w, h);
    const blob = await canvasToBlob(c, 'png');
    return { blob, name: baseName(entry.name) + '-resize.png' };
  }
  if (tool === 'convert') {
    const format = $('cvFormat').value;
    const blob = await canvasToBlob(src, format, 0.92);
    return { blob, name: baseName(entry.name) + '-convert.' + extFor(format) };
  }
  if (tool === 'watermark') {
    drawWatermarkOn(src, watermarkSettings());
    const blob = await canvasToBlob(src, 'png');
    return { blob, name: baseName(entry.name) + '-watermark.png' };
  }
  if (tool === 'metadata') {
    const blob = await canvasToBlob(src, 'png');
    return { blob, name: baseName(entry.name) + '-clean.png' };
  }
  throw new Error('this tool does not support batch.');
}
async function downloadAllZip() {
  if (!state.files.length) { showStatus('No image yet.', 'err'); return; }
  if (typeof JSZip === 'undefined') {
    showStatus('The ZIP library has not loaded yet. Check your internet connection, then reload the page.', 'err');
    return;
  }
  const supported = ['compress', 'resize', 'convert', 'watermark', 'metadata'];
  if (!supported.includes(state.tool)) {
    showStatus('The ' + toolLabel(state.tool || 'this') + ' tool does not support batch yet. Choose compress, resize, convert, watermark, or remove metadata.', 'err');
    return;
  }
  showStatus('Processing ' + state.files.length + ' images, please wait...');
  try {
    const zip = new JSZip();
    for (const entry of state.files) {
      const out = await batchTransform(entry, state.tool);
      zip.file(out.name, out.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'image-tools-batch.zip');
    showStatus('ZIP with ' + state.files.length + ' images created.', 'ok');
  } catch (err) {
    showStatus('Batch failed: ' + (err && err.message ? err.message : 'an error occurred.'), 'err');
  }
}

/* ---------- init ---------- */
function init() {
  const dz = $('dropzone');
  const fi = $('fileInput');
  $('btnPick').addEventListener('click', (ev) => { ev.stopPropagation(); fi.click(); });
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fi.click(); } });
  fi.addEventListener('change', () => { addFiles(fi.files); fi.value = ''; });
  ['dragenter', 'dragover'].forEach((evt) => dz.addEventListener(evt, (ev) => { ev.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((evt) => dz.addEventListener(evt, (ev) => { ev.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (ev) => { addFiles(ev.dataTransfer.files); });

  document.querySelectorAll('.tool-btn').forEach((b) => {
    b.addEventListener('click', () => openTool(b.dataset.tool));
  });

  $('btnReset').addEventListener('click', resetToOriginal);
  $('btnDownload').addEventListener('click', downloadCurrent);
  $('btnDownloadAll').addEventListener('click', downloadAllZip);
  $('dlFormat').addEventListener('change', () => { state.exportFormat = $('dlFormat').value; updateInfo(); });
  $('dlQuality').addEventListener('input', () => {
    $('dlQualityVal').textContent = $('dlQuality').value;
    state.exportQuality = Number($('dlQuality').value) / 100;
    updateInfo();
  });

  const layer = $('overlayLayer');
  layer.addEventListener('pointerdown', overlayPointerDown);
  layer.addEventListener('pointermove', overlayPointerMove);
  layer.addEventListener('pointerup', overlayPointerUp);
  layer.addEventListener('pointercancel', overlayPointerUp);

  $('cmpQuality').addEventListener('input', () => { $('cmpQualityVal').textContent = $('cmpQuality').value; });
  $('cmpApply').addEventListener('click', applyCompress);

  $('rsWidth').addEventListener('input', onResizeWidthInput);
  $('rsHeight').addEventListener('input', onResizeHeightInput);
  $('rsApply').addEventListener('click', () => applyResizeValues(Number($('rsWidth').value), Number($('rsHeight').value)));
  $('rsApplyPercent').addEventListener('click', () => {
    const p = Number($('rsPercent').value);
    if (!p || p <= 0) { showStatus('Enter a valid percent.', 'err'); return; }
    applyResizeValues(Math.round(state.work.width * p / 100), Math.round(state.work.height * p / 100));
  });

  $('cvApply').addEventListener('click', applyConvert);

  document.querySelectorAll('.ratio-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.cropRatio = b.dataset.ratio ? Number(b.dataset.ratio) : null;
      if (overlay.rects[0]) { applyRatioToRect(overlay.rects[0]); clampRect(overlay.rects[0]); renderOverlay(); }
    });
  });
  $('cropApply').addEventListener('click', applyCrop);
  $('cropClear').addEventListener('click', () => { overlay.rects = []; renderOverlay(); });

  $('rot90').addEventListener('click', () => applyRotate(90));
  $('rot180').addEventListener('click', () => applyRotate(180));
  $('rot270').addEventListener('click', () => applyRotate(270));
  $('flipH').addEventListener('click', () => applyFlip('h'));
  $('flipV').addEventListener('click', () => applyFlip('v'));

  $('wmSize').addEventListener('input', () => { $('wmSizeVal').textContent = $('wmSize').value; });
  $('wmOpacity').addEventListener('input', () => { $('wmOpacityVal').textContent = $('wmOpacity').value + '%'; });
  $('wmApply').addEventListener('click', applyWatermark);

  $('snApply').addEventListener('click', applySensor);
  $('snClear').addEventListener('click', () => { overlay.rects = []; renderOverlay(); });

  $('bgApply').addEventListener('click', applyBgRemove);
  $('bfApply').addEventListener('click', applyBgFoto);

  $('heicInput').addEventListener('change', (ev) => {
    heicFile = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
    if (heicFile) $('heicStatus').textContent = 'Selected file: ' + heicFile.name;
  });
  $('heicConvert').addEventListener('click', convertHeic);

  document.querySelectorAll('.bg-swatch').forEach((b) => {
    b.addEventListener('click', () => {
      const group = b.dataset.group;
      document.querySelectorAll('.bg-swatch[data-group="' + group + '"]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      if (group === 'pf') state.pfBg = b.dataset.bg;
      else state.bfBg = b.dataset.bg;
    });
  });
  $('pfCustom').addEventListener('input', (ev) => { state.pfBg = ev.target.value; });
  $('bfCustom').addEventListener('input', (ev) => { state.bfBg = ev.target.value; });
  $('pfApply').addEventListener('click', applyPasFoto);
  $('pfSheet').addEventListener('click', () => buildSheet4R(true));
  $('pfSheetFull').addEventListener('click', () => buildSheet4R(false));

  $('qrType').addEventListener('change', () => {
    $('qrWaWrap').hidden = $('qrType').value !== 'wa';
  });
  $('qrMake').addEventListener('click', makeQr);
  $('qrDownload').addEventListener('click', downloadQr);

  $('mgDir').addEventListener('change', () => {
    $('mgColsWrap').hidden = $('mgDir').value !== 'grid';
  });
  $('mgApply').addEventListener('click', applyMerge);

  document.querySelectorAll('.sm-preset').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.sm-preset').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.smPreset = { w: Number(b.dataset.w), h: Number(b.dataset.h), label: b.textContent.trim() };
      $('smSelected').textContent = 'Preset selected: ' + state.smPreset.label + '.';
    });
  });
  $('smMode').addEventListener('change', () => {
    $('smBgWrap').hidden = $('smMode').value !== 'contain';
  });
  $('smApply').addEventListener('click', applySosmed);

  $('mdApply').addEventListener('click', applyMetadata);

  $('fvBuild').addEventListener('click', buildFavicon);
  $('fvDownload').addEventListener('click', downloadFaviconZip);

  $('sgThreshold').addEventListener('input', () => { $('sgThresholdVal').textContent = $('sgThreshold').value; });
  $('sgApply').addEventListener('click', applySignature);

  $('a4Build').addEventListener('click', buildA4);
  $('a4Print').addEventListener('click', () => window.print());

  $('upApply').addEventListener('click', applyUpscale);

  $('svgConvert').addEventListener('click', convertSvgFile);
  $('epsInput').addEventListener('change', (ev) => {
    epsFile = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
    if (epsFile) setEpsStatus('Selected file: ' + epsFile.name + '. Press Convert with Photopea.');
  });
  $('epsConvert').addEventListener('click', convertEps);

  $('ppSend').addEventListener('click', sendActiveToPhotopea);
  $('ppFetch').addEventListener('click', fetchFromPhotopea);

  showStatus('Choose an image to start.');
}
init();
