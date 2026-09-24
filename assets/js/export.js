// Download helpers: SVG as-is, PNG rasterised through a canvas at a chosen scale.

export function slugify(s) {
  return (s || 'periodic-table').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'periodic-table';
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSVG(svg, name) {
  download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' }), `${slugify(name)}.svg`);
}

export async function svgToPngBlob(svg, scale = 2) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const w = Number(doc.getAttribute('width'));
  const h = Number(doc.getAttribute('height'));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not rasterise the SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPNG(svg, name, scale) {
  download(await svgToPngBlob(svg, scale), `${slugify(name)}@${scale}x.png`);
}

export async function copyPNG(svg, scale) {
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error('Clipboard images need HTTPS and a modern browser');
  // Passing a promise keeps Safari's user-gesture requirement happy.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPngBlob(svg, scale) })]);
}
