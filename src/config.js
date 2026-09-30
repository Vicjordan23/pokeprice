// TCGdex: API pública y gratuita, sin clave. https://tcgdex.dev
export const CONFIG = {
  apiBase: 'https://api.tcgdex.net/v2',
  // Idiomas en los que se busca el nombre leído por el escáner (la carta puede estar en cualquiera).
  scanLangs: ['es', 'en', 'de', 'fr', 'it'],
  // Lector de texto (OCR) que se descarga al primer escaneo.
  ocrModule: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js',
};
