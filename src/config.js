// La API funciona sin clave (1.000 peticiones/día). Con clave gratuita sube a 20.000.
// Ojo: en una app 100 % cliente la clave es visible para quien abra la web.
export const CONFIG = {
  apiBase: 'https://api.pokemontcg.io/v2',
  apiKey: '',
  // Lector de texto (OCR) que se descarga al primer escaneo.
  ocrModule: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js',
};
