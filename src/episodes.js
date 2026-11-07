// Descobre temporada e episodio a partir do TITULO de um video do Cinefy.
// No Cinefy os videos ficam ligados a serie inteira; o episodio so aparece no texto do titulo.

const clean = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[°º]/g, "o") // grau e ordinal: "3°Temp", "06° Ep"
    .replace(/_+/g, " ");

function expand(a, b) {
  if (b == null) return [a];
  // "17 e 18", "09-10": faixa curta vira a lista de episodios; o resto vira so os dois numeros
  return b > a && b - a <= 3 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a, b];
}

// Retorna { season: number|null, episodes: number[] } ou null se nao achar episodio.
export function parseSE(title) {
  const t = clean(title);
  let season = null;
  let eps = null;
  let m;

  if ((m = t.match(/\bs(\d{1,2})[\s._-]*e(?:p)?[\s._:-]*0*(\d{1,3})\b/i)) || (m = t.match(/\b(\d{1,2})x0*(\d{1,3})\b/i))) {
    season = Number(m[1]);
    eps = [Number(m[2])];
  } else {
    if ((m = t.match(/\b(\d{1,2})\s*\.?\s*[ao]?\s*(?:temp(?:orada)?|season)\b/i))) season = Number(m[1]);
    else if ((m = t.match(/\b(?:t|temp|temporada|season)\.?\s*0*(\d{1,2})\b/i))) season = Number(m[1]);
    else if ((m = t.match(/\b(\d{1,2})t\b/i))) season = Number(m[1]); // "2T EP 01"

    m = t.match(/\b(?:ep(?:isodios?|isode)?s?|cap(?:itulos?)?)\.?\s*:?\s*0*(\d{1,3})(?:\s*(?:e|&|,|\/|-|a)\s*0*(\d{1,3}))?\b/i);
    if (m) eps = expand(Number(m[1]), m[2] != null ? Number(m[2]) : null);
    else if ((m = t.match(/\b0*(\d{1,3})\s*o?\s*\.?\s*(?:ep(?:isodios?|isode)?s?)\b/i))) eps = [Number(m[1])]; // "06° Ep"
  }
  return eps ? { season, episodes: eps } : null;
}

// O video e o episodio S:E? Sem temporada no titulo (comum em animes), so aceita a temporada 1.
export function matchesEpisode(video, season, episode) {
  const p = parseSE(video.title);
  if (!p || !p.episodes.includes(episode)) return false;
  return p.season == null ? season === 1 : p.season === season;
}

// Videos que nao sao episodio (livros, trailers, aberturas...) e seriam falsos positivos.
const NON_EPISODE = /\b(novel|volume|vol|manga|hq|livro|audiobook|trailer|opening|ending|amv|resumo|explicacao|analise|teoria|ranking)\b/i;
export const isNonEpisode = (title) => NON_EPISODE.test(clean(title));
