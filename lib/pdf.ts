/**
 * Client-side "download as a real PDF" helpers.
 *
 * Produces a genuine, multi-page A4 `.pdf` FILE (not an `.html` file, and not a
 * browser print dialog) by rasterising HTML with jsPDF + html2canvas — so the
 * download always succeeds and looks like the document it represents.
 *
 * jsPDF + html2canvas are heavy, so they are loaded lazily (dynamic import) and
 * only arrive when the user actually downloads something.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Html2Canvas = (el: HTMLElement, opts?: Record<string, any>) => Promise<HTMLCanvasElement>;

async function loadLibs() {
  const [h2c, jspdf] = await Promise.all([import('html2canvas'), import('jspdf')]);
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

/** Slice a tall capture across A4 pages and download it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveCanvasAsPdf(jsPDF: any, canvas: HTMLCanvasElement, filename: string) {
  if (!canvas.width || !canvas.height) throw new Error('empty canvas');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
  heightLeft -= pageH;
  while (heightLeft > 0.5) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= pageH;
  }
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/**
 * Render a fully self-contained HTML document (e.g. buildLoanStatementHtml) into
 * a real PDF and download it.
 *
 * The document is rendered in an OFF-SCREEN IFRAME at a fixed desktop width, so
 * the result is identical on every device — crucially, it does NOT inherit the
 * caller's narrow phone viewport (which previously squashed the ledger table and
 * blew the statement up across several pages).
 */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const { html2canvas, jsPDF } = await loadLibs();

  const WIDTH = 800; // fixed render width → stable A4 layout regardless of screen
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${WIDTH}px;height:200px;border:0;background:#fff;`;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error('no iframe document');
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for parse/layout, images and fonts so nothing captures blank.
    await new Promise<void>((res) => {
      if (doc.readyState === 'complete') return res();
      iframe.addEventListener('load', () => res(), { once: true });
      setTimeout(res, 2000);
    });
    await waitForImages(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { await (doc as any).fonts?.ready; } catch { /* no web fonts — fine */ }

    const body = doc.body;
    const fullHeight = Math.max(body.scrollHeight, body.offsetHeight, 200);
    iframe.style.height = `${fullHeight}px`;

    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: WIDTH,
      height: fullHeight,
      windowWidth: WIDTH,
      windowHeight: fullHeight,
      logging: false,
    });
    saveCanvasAsPdf(jsPDF, canvas, filename);
  } finally {
    iframe.remove();
  }
}

/**
 * Rasterise a live element into a multi-page A4 PDF and download it. Used for
 * fixed-width documents (e.g. the receipt card). Elements matching `.no-print`
 * are skipped, and any scroll clamp on the target is lifted on the clone so the
 * whole thing is captured.
 */
export async function downloadElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const { html2canvas, jsPDF } = await loadLibs();
  await waitForImages(el);

  el.setAttribute('data-pdf-capture', '1');
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
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
  saveCanvasAsPdf(jsPDF, canvas, filename);
}
