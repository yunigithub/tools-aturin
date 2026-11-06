# Image Tools - tools.atur.in

A static web app for editing images, all client-side in the browser. Files are never uploaded to any server.

## How to use

1. Open https://tools.atur.in in your phone or laptop browser.
2. Choose images (you can pick several files at once) with the button or drag and drop.
3. Click a tool, set its options, press Apply.
4. Download the result with the Download Result button, or Download All (ZIP) for batches.

One image can be used across tools without uploading it again. The Restore Original button returns the active image to its initial state.

## Tool list (22)

1. Compress, quality slider and target size in KB (binary search on JPEG/WebP quality).
2. Resize, px or percent, aspect ratio lock.
3. Convert, output JPG, PNG, WebP. Input JPG, PNG, WebP, AVIF, GIF, BMP, and SVG.
4. Crop, drag a box on the preview, presets 1:1, 4:3, 16:9, free.
5. Rotate, turn 90/180/270 degrees, flip horizontal/vertical.
6. Watermark, text, position, size, opacity.
7. Censor, drag boxes then fill black, pixelate, or blur (for ID numbers, addresses, faces).
8. Remove Background, on-device AI (@imgly/background-removal via CDN). The first time you use this tool, the model (about 40 MB) downloads and is cached by the browser. Transparent PNG result.
9. HEIC to JPG, via heic2any. HEIC files are also converted automatically when picked in the drop zone.
10. Passport Photo, sizes 2x3, 3x4, 4x6 cm at 300 dpi, red, blue, white, or custom background. Mixed 4R sheet (8 photos: 2 photos at 4x6, 2 at 3x4, 4 at 2x3) and full 4R sheet.
11. Change Passport Photo Background, remove the background with AI then place the photo on a solid color.
12. QR Code, text, link, or WhatsApp, set colors and size, download PNG.
13. Merge Images, vertical, horizontal, or grid, set gap and background color.
14. Social Media Sizes, presets for IG Feed, IG Story, TikTok, YouTube Thumbnail, Shopee Product Photo, WhatsApp Status, Facebook Post. Fill mode (center crop) or fit mode (color background).
15. Remove Metadata, re-save through canvas so EXIF and GPS are dropped.
16. Favicon, PNGs at 16/32/48 px plus favicon.ico, downloaded as a ZIP.
17. Transparent Signature, bright pixels become transparent with a threshold slider.
18. A4 Photo Report, arrange photos, a title, and captions on an A4 page, Print or Save as PDF.
19. Upscale, raise resolution 2x or 4x. Canvas mode (fast, plus light sharpening) and AI ESRGAN mode via UpscalerJS and TensorFlow.js from a CDN. AI mode is limited to images under about 2 MP so phones do not run out of memory. If the AI model fails to load, it falls back to canvas mode automatically.
20. SVG to PNG/JPG/WebP, rasterized via Image and canvas. An SVG without width and height uses the default width of 1024 px (or the width you enter), height follows the viewBox aspect.
21. EPS to PNG/JPG, through the Photopea Live Messaging API (embedded iframe https://www.photopea.com + postMessage). EPS, AI, and PSD files open in Photopea in the browser, then export to PNG or JPG. Needs internet to load the Photopea app, but files are processed on the device and never uploaded to a server. The result size follows Photopea rasterization when opening the file; the result width option resizes the document before export, height follows the original aspect.
22. Edit in Photopea, the visible Photopea editor on the page. Send the active image to Photopea, edit it right in the editor, then take the result back as the active image. Privacy note: the other tools process files fully locally with no third party; the Photopea path loads the app from photopea.com and files are processed by Photopea code in the browser (they stay on the device, they are not uploaded to a server).

## Batch ZIP

The Download All (ZIP) button processes every image with the active tool. Tools that support batch: compress, resize, convert, watermark, and remove metadata. Other tools show a message that batch is not supported yet.

## Technology

- Vanilla JS and CSS only, no heavy framework.
- All third-party libraries only via CDN: JSZip, heic2any, qrcodejs, @imgly/background-removal, and for AI upscale mode: @tensorflow/tfjs, @upscalerjs/esrgan-medium, upscaler.
- Photopea Live Messaging API (https://www.photopea.com/api/live): Photopea iframe + postMessage. Files are sent as ArrayBuffer, scripts as strings, results come back through app.activeDocument.saveToOE("png"/"jpg").
- No credentials, tokens, or keys of any kind in these files.

## SEO files

- `robots.txt` allows all crawlers, including AI crawlers, and points to the sitemap.
- `sitemap.xml` lists the single page https://tools.atur.in/.
- `llms.txt` is a short markdown summary of the site and its 22 tools for AI search and assistants.
- `og-image.png` (1200 x 630) is the social sharing image used by the Open Graph and Twitter Card tags.
- `favicon.svg`, `favicon-192.png`, `favicon-512.png`, and `apple-touch-icon.png` are the site icons referenced in the page head.

## Deploy (recommended: Cloudflare Pages)

1. Extract this zip to one folder on your laptop.
2. Open the Cloudflare dashboard, go to Workers & Pages, Create, Pages, Upload assets.
3. Give the project a name, for example: `tools-aturin`.
4. Drag the extracted folder into the upload area (make sure `index.html` is at the folder root), then Deploy.
5. First try the `https://tools-aturin.pages.dev` address Cloudflare gives you. If the app opens, go to step 6.
6. In that Pages project, open Custom domains, Set up a custom domain, enter `tools.atur.in`, Continue. Cloudflare sets up the DNS itself automatically.
7. If you get an error about an existing record, first delete the old `tools` CNAME record in the atur.in DNS (the one pointing to `yunigithub.github.io`), then repeat step 6.
8. Wait a moment, then open https://tools.atur.in.

The `CNAME` file in this folder is only used by GitHub Pages; on Cloudflare Pages it is not needed and can be ignored.

## Deploy alternative: GitHub Pages (tools.atur.in)

1. Create a new GitHub repo, for example: `tools-aturin`.
2. Upload every file in this folder (index.html, styles.css, app.js, photopea.js, CNAME, README.md, plus robots.txt, sitemap.xml, llms.txt, favicon.svg, favicon-192.png, favicon-512.png, apple-touch-icon.png, og-image.png) to the main branch.
3. In the repo, open Settings, Pages, pick the main branch and the root folder, then save.
4. In Cloudflare (atur.in DNS), add a CNAME record: name `tools`, target `username.github.io` (replace username with your GitHub username), proxy OFF (DNS only).
5. Wait a few minutes, then open https://tools.atur.in. The CNAME file in the repo makes GitHub Pages use that domain.

Note: this page needs internet to load libraries from the CDN on first use. The background removal and AI upscale tools download models from the CDN on first use, after that the models stay in the browser cache. The EPS tool and Edit in Photopea need internet to load the Photopea app from photopea.com every session; files are still processed in the browser and never uploaded to a server.
