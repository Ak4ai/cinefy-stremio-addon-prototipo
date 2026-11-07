// Liga um id do IMDb (usado pelo Stremio) a um titulo do Cinefy, por nome e ano.
import * as api from "./api.js";

const CINEMETA = process.env.CINEMETA_URL || "https://v3-cinemeta.strem.io";
const cache = new Map();
const memo = async (key, ttl, fn) => {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttl });
  return val;
};

export const norm = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " e ").replace(/[^a-z0-9]+/g, " ").trim();

// "tt123" (filme) ou "tt123:2:5" (serie, temporada 2, episodio 5)
export function parseStremioId(type, id) {
  const [imdb, s, e] = id.split(":");
  return { imdb, season: s ? Number(s) : null, episode: e ? Number(e) : null, type };
}

export async function cinemetaMeta(type, imdb) {
  return memo(`cm:${type}:${imdb}`, 24 * 3600e3, async () => {
    const res = await fetch(`${CINEMETA}/meta/${type}/${imdb}.json`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const { meta } = await res.json();
    if (!meta) return null;
    const y = String(meta.year || meta.releaseInfo || meta.released || "").match(/\d{4}/);
    return { name: meta.name, year: y ? Number(y[0]) : null };
  });
}

const yearOf = (d) => (typeof d === "string" && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

// Pontua um candidato da busca do Cinefy contra o nome e o ano vindos do IMDb.
export function score(item, meta, kind) {
  const names = [item.name, item.originalName].map(norm).filter(Boolean);
  const want = norm(meta.name);
  let s = 0;
  if (names.includes(want)) s += 3;
  else if (names.some((n) => n.includes(want) || want.includes(n))) s += 1;
  const y = yearOf(item.releaseDate);
  if (meta.year && y) s += y === meta.year ? 2 : Math.abs(y - meta.year) === 1 ? 1 : -2;
  if (item.kind && kind && item.kind !== kind) s -= 3;
  return s;
}

export async function findCinefyTitle(type, imdb) {
  return memo(`ft:${type}:${imdb}`, 6 * 3600e3, async () => {
    const meta = await cinemetaMeta(type, imdb);
    if (!meta) return null;
    const kind = type === "movie" ? "movie" : "series";
    const res = await api.titleSearch(meta.name, 10);
    const best = (res.items || [])
      .map((item) => ({ item, s: score(item, meta, kind) }))
      .sort((a, b) => b.s - a.s)[0];
    return best && best.s >= 3 ? best.item : null;
  });
}

// ---- nomes para a busca por texto ----

// "Mushoku Tensei: Jobless Reincarnation" -> "Mushoku Tensei" (os videos costumam usar so o inicio)
export const shortName = (s) => String(s || "").split(/\s*[:(–-]\s*/)[0].trim();

// Nomes (com letras latinas) pelos quais os videos do Cinefy podem chamar o titulo.
export function nameVariants(names, { short }) {
  const seen = new Map();
  for (const n of names) {
    const s = short ? shortName(n) : String(n || "").trim();
    const k = norm(s);
    if (k.length >= 3 && /[a-z]/.test(k) && !seen.has(k)) seen.set(k, s);
  }
  return [...seen.values()].slice(0, 2);
}

export const nameInTitle = (title, variants) => {
  const t = norm(title);
  return variants.some((v) => t.includes(norm(v)));
};

const NOISE = /\b(filme|filmes|completo|completa|dublado|dublada|legendado|legendada|dual|audio|hd|fhd|4k|1080p|720p|2160p|assistindo|1a vez|primeira vez|react|reacao|live|ao vivo|full|movie|pt br|ptbr|brasil|original|oficial)\b/g;

// Filme: depois de tirar ano e palavras de enfeite, o titulo do video tem que ser IGUAL ao nome.
// Assim "Matrix Reloaded" nao entra como fonte de "Matrix".
export function movieTitleMatches(title, variants) {
  const t = norm(title).replace(/\b(19|20)\d{2}\b/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
  return variants.some((v) => t === norm(v));
}
