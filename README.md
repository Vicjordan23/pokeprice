# PokéPrice

Web app móvil para consultar el precio de cartas Pokémon y llevar el valor de tu colección.
Datos de precios vía [pokemontcg.io](https://docs.pokemontcg.io/) (Cardmarket en EUR y TCGplayer en USD).

## Qué hace

- **Buscar:** por nombre (y número opcional: `charizard 199`).
- **Ficha:** precio de tendencia de Cardmarket, variación 7d/30d, mini-gráfica con las medias de 30d, 7d y 1d, y precios por mercado.
- **Escanear:** haces una foto (o eliges una imagen), un OCR en el navegador ([Tesseract.js](https://github.com/naptha/tesseract.js), se descarga de jsDelivr al primer uso) lee el número de carta (`199/165`) y el nombre, y se buscan candidatos en pokemontcg.io. La foto no se sube a ningún servidor. Funciona mejor con cartas en inglés y buena luz; con otro idioma se apoya en el número.
- **Colección:** guarda cartas en el navegador (localStorage), suma su valor y refresca los precios al abrir.

No incluye todavía: visor de cámara en vivo, reconocimiento por imagen (solo OCR de texto), precios por estado (NM/LP…), cartas gradadas ni alertas. La API gratuita no da esos datos.

## Usar

```bash
npm start     # http://localhost:8080  (sirve los ficheros estáticos; no hay build)
npm test      # pruebas de la lógica pura (node:test)
```

Sin dependencias. Los módulos ES necesitan servirse por HTTP, no abrir `index.html` con doble clic.

## Notas

- Sin clave de API, pokemontcg.io permite 1.000 peticiones/día; con clave gratuita, 20.000. Se configura en `src/config.js`. En una app solo-cliente la clave es visible: si la web es pública, conviene un pequeño proxy.
- Los precios son medias que la API actualiza a diario, no el precio en tiempo real.
- Revisa los términos de uso de pokemontcg.io antes de un uso comercial.
