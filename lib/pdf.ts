/**
 * Client-side "download as a real PDF" helper.
 *
 * Produces a genuine, multi-page A4 `.pdf` FILE (not an `.html` file, and not a
 * browser print dialog) by rasterising a live DOM node — so the download always
 * succeeds and looks exactly like what is on screen.
 *
 * jsPDF + html2canvas are heavy, so they are loaded lazily (dynamic import) and
 * only arrive when the user actually downloads something.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Html2Canvas = (el: HTMLElement, opts?: Record<string, any>) => Promise<HTMLCanvasElement>;

async function loadLibs() {
  const [h2c, jspdf] = await Promise.all([import('html2canvas'), import('jspdf')]);
  // html2canvas ships as a default export; jsPDF as a named one.
  const html2canvas = ((h2c as unknown as { default: Html2Canvas }).default ?? (h2c as unknown as Html2Canvas));
  return { html2canvas, jsPDF: jspdf.jsPDF };
}

/** Resolve once every <img> under `root` has loaded (or errored) so the capture
 *  never races ahead of a not-yet-painted photo. */
function waitForImages(root: ParentNode): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  ).then(() => undefined);
}

/**
 * Rasterise a live element into a multi-page A4 PDF and trigger a download.
 * Elements matching `.no-print` (e.g. action buttons) are skipped.
 */
export async function downloadElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const { html2canvas, jsPDF } = await loadLibs();
  await waitForImages(el);

  // Mark the target so we can find its clone. The on-screen panel is often a
  // scroll box (max-height + overflow:auto); on the CLONE we lift that clamp so
  // the WHOLE statement is captured, not just the visible viewport.
  el.setAttribute('data-pdf-capture', '1');
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale: 2, // crisp text at A4
      useCORS: true, // load cross-origin photos where the host allows it
      backgroundColor: '#ffffff',
      logging: false,
      ignoreElements: (node: Element) =>
        node instanceof HTMLElement &&
        (node.classList.contains('no-print') || node.id === 'no-print'),
      onclone: (clonedDoc: Document) => {
        const c = clonedDoc.querySelector('[data-pdf-capture="1"]');
        if (c instanceof HTMLElement) {
          c.style.maxHeight = 'none';
          c.style.height = 'auto';
          c.style.overflow = 'visible';
        }
      },
    });
  } finally {
    el.removeAttribute('data-pdf-capture');
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  // Slice the tall capture across A4 pages by shifting the image up each page.
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= pageH;
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
