// Fondo decorativo: cuatro Pokémon (arte oficial servido por el repositorio público de PokéAPI).
// Son solo decoración: si no cargan, se ocultan y la app sigue igual.
const ART = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const IDS = [25, 6, 658, 384]; // Pikachu, Charizard, Greninja, Rayquaza

export function initTheme() {
  const decor = document.getElementById('decor');
  IDS.forEach((id, i) => {
    const img = document.createElement('img');
    img.className = `pk p${i + 1}`;
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('error', () => { img.hidden = true; });
    img.src = ART(id);
    decor.appendChild(img);
  });
}
