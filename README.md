# Tools Gambar - tools.atur.in

Aplikasi web statis untuk mengolah gambar, semuanya client-side di browser. File tidak pernah di-upload ke server mana pun.

## Cara pakai

1. Buka https://tools.atur.in di browser HP atau laptop.
2. Pilih gambar (bisa banyak file sekaligus) lewat tombol atau drag and drop.
3. Klik salah satu tool, atur opsinya, tekan Terapkan.
4. Download hasil dengan tombol Download Hasil, atau Download Semua (ZIP) untuk batch.

Satu gambar bisa dipakai lintas tool tanpa upload ulang. Tombol Kembalikan ke Asli mengembalikan gambar aktif ke kondisi awal.

## Daftar tool (22)

1. Kompres, slider kualitas dan target ukuran KB (pencarian biner pada kualitas JPEG/WebP).
2. Resize, px atau persen, kunci aspek rasio.
3. Convert, output JPG, PNG, WebP. Input JPG, PNG, WebP, AVIF, GIF, BMP, dan SVG.
4. Crop, drag kotak di pratinjau, preset 1:1, 4:3, 16:9, bebas.
5. Rotate, putar 90/180/270 derajat, cermin horizontal/vertikal.
6. Watermark, teks, posisi, ukuran, opacity.
7. Sensor, drag kotak lalu isi hitam, pixelate, atau blur (untuk nomor KTP, alamat, wajah).
8. Hapus Background, AI on-device (@imgly/background-removal via CDN). Pertama kali memakai tool ini, model sekitar 40 MB diunduh dan di-cache browser. Hasil PNG transparan.
9. HEIC ke JPG, via heic2any. File HEIC juga otomatis diubah saat dipilih di drop zone.
10. Pas Foto, ukuran 2x3, 3x4, 4x6 cm pada 300 dpi, latar merah, biru, putih, atau custom. Lembar 4R campuran (8 foto: 2 foto 4x6, 2 foto 3x4, 4 foto 2x3) dan Lembar 4R isi penuh.
11. Ganti Background Pas Foto, hapus background dengan AI lalu taruh di atas warna solid.
12. QR Code, teks, link, atau WhatsApp, atur warna dan ukuran, download PNG.
13. Gabung Gambar, vertikal, horizontal, atau grid, atur jarak dan warna latar.
14. Ukuran Sosmed, preset IG Feed, IG Story, TikTok, Thumbnail YouTube, Foto Produk Shopee, Status WA, FB Post. Mode isi penuh (crop tengah) atau muat (latar warna).
15. Hapus Metadata, simpan ulang via canvas sehingga EXIF dan GPS terbuang.
16. Favicon, PNG 16/32/48 px plus favicon.ico, download sebagai ZIP.
17. Tanda Tangan Transparan, piksel terang jadi transparan dengan slider threshold.
18. Laporan Foto A4, susun foto, judul, dan caption di halaman A4, Print atau Save as PDF.
19. Upscale, naikkan resolusi 2x atau 4x. Mode canvas (cepat, plus sharpening ringan) dan mode AI ESRGAN via UpscalerJS dan TensorFlow.js dari CDN. Mode AI dibatasi untuk gambar di bawah sekitar 2 MP supaya tidak kehabisan memori di HP. Kalau model AI gagal dimuat, otomatis fallback ke mode canvas.
20. SVG ke PNG/JPG/WebP, rasterisasi via Image dan canvas. SVG tanpa width dan height memakai lebar default 1024 px (atau lebar yang diisi), tinggi mengikuti aspek viewBox.
21. EPS ke PNG/JPG, lewat Photopea Live Messaging API (embed iframe https://www.photopea.com + postMessage). File EPS, AI, dan PSD dibuka Photopea di browser, lalu diekspor ke PNG atau JPG. Butuh internet untuk memuat aplikasi Photopea, tapi file diproses di perangkat dan tidak di-upload ke server. Ukuran hasil mengikuti rasterisasi Photopea saat membuka file; opsi lebar hasil mengatur ulang ukuran dokumen sebelum ekspor, tinggi mengikuti aspek aslinya.
22. Edit di Photopea, editor Photopea yang terlihat di halaman. Kirim gambar aktif ke Photopea, edit langsung di editornya, lalu ambil hasilnya kembali sebagai gambar aktif. Catatan privasi: tool lain memproses file sepenuhnya lokal tanpa pihak ketiga; jalur Photopea memuat aplikasi dari photopea.com dan file diproses oleh kode Photopea di browser (tetap di perangkat, tidak di-upload ke server).

## Batch ZIP

Tombol Download Semua (ZIP) memproses semua gambar dengan tool yang sedang aktif. Tool yang mendukung batch: kompres, resize, convert, watermark, dan hapus metadata. Tool lain menampilkan pesan bahwa batch belum didukung.

## Teknologi

- Vanilla JS dan CSS saja, tanpa framework berat.
- Semua library pihak ketiga hanya via CDN: JSZip, heic2any, qrcodejs, @imgly/background-removal, dan untuk mode upscale AI: @tensorflow/tfjs, @upscalerjs/esrgan-medium, upscaler.
- Photopea Live Messaging API (https://www.photopea.com/api/live): iframe Photopea + postMessage. File dikirim sebagai ArrayBuffer, script dikirim sebagai string, hasil diambil lewat app.activeDocument.saveToOE("png"/"jpg").
- Tidak ada kredensial, token, atau kunci apa pun di file ini.

## Deploy (disarankan: Cloudflare Pages)

1. Ekstrak file zip ini ke satu folder di laptop.
2. Buka dashboard Cloudflare → Workers & Pages → Create → Pages → Upload assets.
3. Beri nama project, contoh: `tools-aturin`.
4. Drag folder hasil ekstrak ke area upload (pastikan `index.html` ada di root folder), lalu Deploy.
5. Coba dulu alamat `https://tools-aturin.pages.dev` yang dikasih Cloudflare. Kalau aplikasi kebuka, lanjut ke langkah 6.
6. Di project Pages itu, buka Custom domains → Set up a custom domain → isi `tools.atur.in` → Continue. Cloudflare memasang DNS-nya sendiri secara otomatis.
7. Kalau muncul error soal record sudah ada, hapus dulu record CNAME `tools` yang lama di DNS atur.in (yang targetnya `yunigithub.github.io`), lalu ulangi langkah 6.
8. Tunggu sebentar, lalu buka https://tools.atur.in.

File `CNAME` di folder ini hanya dipakai GitHub Pages; di Cloudflare Pages file itu tidak dibutuhkan dan bisa diabaikan.

## Deploy alternatif: GitHub Pages (tools.atur.in)

1. Buat repo GitHub baru, contoh: `tools-aturin`.
2. Upload semua file di folder ini (index.html, styles.css, app.js, photopea.js, CNAME, README.md) ke branch utama repo.
3. Di repo, buka Settings, Pages, pilih branch utama dan folder root, lalu simpan.
4. Di Cloudflare (DNS atur.in), tambah record CNAME: nama `tools`, target `username.github.io` (ganti username dengan username GitHub kamu), proxy OFF (DNS only).
5. Tunggu beberapa menit, lalu buka https://tools.atur.in. File CNAME di repo membuat GitHub Pages memakai domain itu.

Catatan: halaman ini butuh internet untuk memuat library dari CDN saat pertama kali dipakai. Tool hapus background dan upscale AI mengunduh model dari CDN pada pemakaian pertama, setelah itu model tersimpan di cache browser. Tool EPS dan Edit di Photopea butuh internet untuk memuat aplikasi Photopea dari photopea.com setiap sesi; file tetap diproses di browser dan tidak di-upload ke server.
