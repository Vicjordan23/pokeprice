// Temas visuales. Cada tema cambia colores (CSS en styles.css, [data-theme]) y los Pokémon del fondo.
// Las ilustraciones son arte oficial servido por el repositorio público de PokéAPI; son solo decoración
// (si no cargan, se ocultan y la app sigue igual).

const ART = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

export const THEMES = {
  cyber: { name: 'Neón cian', swatch: ['#00E5FF', '#B026FF'], ids: [150, 94, 448, 130] },   // Mewtwo, Gengar, Lucario, Gyarados
  violet: { name: 'Ultravioleta', swatch: ['#FF2BD6', '#7C4DFF'], ids: [197, 196, 151, 92] }, // Umbreon, Espeon, Mew, Gastly
  aurora: { name: 'Aurora', swatch: ['#39FF14', '#00C2FF'], ids: [25, 6, 658, 384] },        // Pikachu, Charizard, Greninja, Rayquaza
};

const KEY = 'pokeprice.theme.v1';
const DEFAULT = 'cyber';

function saved() {
  try { const t = localStorage.getItem(KEY); return t in THEMES ? t : DEFAULT; } catch { return DEFAULT; }
}

export function applyTheme(name) {
  if (!(name in THEMES)) name = DEFAULT;
  document.documentElement.dataset.theme = name;
  document.querySelectorAll('#decor img').forEach((img, i) => {
    img.hidden = false;
    img.src = ART(THEMES[name].ids[i]);
  });
  document.querySelectorAll('#themebar button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === name)));
  try { localStorage.setItem(KEY, name); } catch { /* sin almacenamiento */ }
}

export function initTheme() {
  const decor = document.getElementById('decor');
  for (let i = 1; i <= 4; i++) {
    const img = document.createElement('img');
    img.className = `pk p${i}`;
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('error', () => { img.hidden = true; });
    decor.appendChild(img);
  }
  const bar = document.getElementById('themebar');
  bar.innerHTML = Object.entries(THEMES)
    .map(([id, t]) => `<button type="button" data-theme="${id}" aria-label="Tema ${t.name}" title="${t.name}" style="--s1:${t.swatch[0]};--s2:${t.swatch[1]}"></button>`)
    .join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-theme]');
    if (b) applyTheme(b.dataset.theme);
  });
  applyTheme(saved());
}
