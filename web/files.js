export async function readSource(file) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Each file must be at most 10 MB.");
  const lower = file.name.toLowerCase();
  if (!/\.(pdf|txt|md)$/.test(lower))
    throw new Error("Choose a PDF, TXT or MD file.");
  let content;
  if (lower.endsWith(".pdf")) {
    const pdfjs = await import("/vendor/pdfjs/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/build/pdf.worker.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
      isEvalSupported: false,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 100)
        throw new Error("PDF files must have at most 100 pages.");
      const pages = [];
      let length = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const text = await page.getTextContent();
        const value = text.items
          .map((item) => item.str + (item.hasEOL ? "\n" : " "))
          .join("");
        length += value.length;
        if (length > 100000)
          throw new Error(
            "Source text must be at most 100,000 characters. Split this file into smaller parts.",
          );
        pages.push(value);
        page.cleanup();
      }
      content = pages.join("\n\n");
    } finally {
      await task.destroy();
    }
    if (!content.trim())
      throw new Error(
        "No PDF text found. Scanned PDFs need OCR before import.",
      );
  } else content = await file.text();
  if (!content.trim() || content.length > 100000)
    throw new Error("Source text must contain 1–100,000 characters.");
  return content;
}
