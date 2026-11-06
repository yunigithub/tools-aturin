'use strict';
/* Photopea Live Messaging API - https://www.photopea.com/api/live
   Outer Environment (OE) mengirim data ke iframe Photopea lewat postMessage:
   String berisi script yang dijalankan Photopea, atau ArrayBuffer berisi file
   (Photopea mendeteksi tipe file dari signature). Photopea membalas string
   "done" saat siap menerima perintah dan setiap selesai memproses satu pesan.
   Untuk mengambil hasil, script memanggil app.activeDocument.saveToOE("png")
   atau ("jpg"), lalu Photopea mengirim ArrayBuffer hasil diikuti "done".
   Semua diproses di browser, file tidak di-upload ke server. */

const PHOTOPEA_URL = 'https://www.photopea.com';
const PHOTOPEA_ORIGINS = ['https://www.photopea.com', 'https://photopea.com'];
const PHOTOPEA_READY_TIMEOUT = 90000;
const PHOTOPEA_OP_TIMEOUT = 180000;

class PhotopeaBridge {
  constructor(iframe) {
    this.iframe = iframe;
    this.chain = Promise.resolve();
    this.pending = null;
    this.extraBuffers = [];
    this.isReady = false;
    this.readyResolve = null;
    this.readyReject = null;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimer = setTimeout(() => {
      if (!this.isReady && this.readyReject) {
        this.readyReject(new Error('Photopea tidak bisa dimuat. Periksa koneksi internet lalu muat ulang halaman.'));
      }
    }, PHOTOPEA_READY_TIMEOUT);
    this.onMessage = this.onMessage.bind(this);
    window.addEventListener('message', this.onMessage);
  }

  onMessage(e) {
    if (!this.iframe.contentWindow || e.source !== this.iframe.contentWindow) return;
    if (PHOTOPEA_ORIGINS.indexOf(e.origin) < 0) return;
    const data = e.data;
    if (typeof data === 'string') {
      if (data === 'done') {
        if (!this.isReady) {
          this.isReady = true;
          clearTimeout(this.readyTimer);
          if (this.readyResolve) this.readyResolve();
        }
        this.finishPending(null);
      }
      // string lain (mis. hasil echo) tidak dipakai di sini
    } else if (data instanceof ArrayBuffer) {
      if (this.pending) this.pending.buffers.push(data);
      else this.extraBuffers.push(data);
    }
  }

  finishPending(err) {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    clearTimeout(p.timer);
    const buffers = this.extraBuffers.concat(p.buffers);
    this.extraBuffers = [];
    if (err) p.reject(err);
    else p.resolve(buffers);
  }

  ready() { return this.readyPromise; }

  send(data) {
    const task = () => this.readyPromise.then(() => new Promise((resolve, reject) => {
      const pending = { buffers: [], resolve, reject, timer: null };
      pending.timer = setTimeout(() => {
        if (this.pending === pending) {
          this.pending = null;
          reject(new Error('Photopea tidak merespons. Coba muat ulang halaman lalu ulangi.'));
        }
      }, PHOTOPEA_OP_TIMEOUT);
      this.pending = pending;
      this.iframe.contentWindow.postMessage(data, '*');
    }));
    this.chain = this.chain.then(task, task);
    return this.chain;
  }

  sendScript(script) { return this.send(script); }

  async openFile(arrayBuffer) {
    await this.send(arrayBuffer);
  }

  async resizeToWidth(width) {
    const w = Math.max(1, Math.round(width));
    await this.sendScript(
      'try{var d=app.activeDocument;var s=' + w + '/d.width;'
      + 'd.resizeImage(' + w + ',Math.round(d.height*s));}catch(e){}'
    );
  }

  async exportImage(format) {
    const fmt = format === 'jpeg' ? 'jpg' : format;
    const buffers = await this.sendScript('app.activeDocument.saveToOE("' + fmt + '");');
    if (!buffers.length) return null;
    const type = fmt === 'jpg' ? 'image/jpeg' : fmt === 'gif' ? 'image/gif' : 'image/png';
    return new Blob([buffers[0]], { type });
  }
}

let hiddenBridge = null;
function getHiddenPhotopeaBridge() {
  if (hiddenBridge) return hiddenBridge;
  const iframe = document.createElement('iframe');
  iframe.src = PHOTOPEA_URL;
  iframe.title = 'Photopea';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;border:0;';
  document.body.appendChild(iframe);
  hiddenBridge = new PhotopeaBridge(iframe);
  return hiddenBridge;
}
