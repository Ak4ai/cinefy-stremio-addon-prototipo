import sdk from "stremio-addon-sdk";
import * as api from "./api.js";
import * as auth from "./auth.js";
import { parseStremioId, findCinefyTitle, cinemetaMeta, nameVariants, nameInTitle, movieTitleMatches } from "./titles.js";
import { matchesEpisode, isNonEpisode } from "./episodes.js";

const { addonBuilder } = sdk;
const PER_PAGE = 20; // a API recusa perPage=50 (400); o site usa 20
const PREFIX = "cinefy:";
const MAX_SOURCES = 40;
const SEARCH_PAGES = Number(process.env.CINEFY_SEARCH_PAGES) || 4; // 20 resultados por pagina, por consulta de texto
// O CDN nao exige Referer (testado). Por padrao a fonte e o link direto; CINEFY_PROXY_HEADERS=1 reativa o proxy do Stremio.
const SEND_REFERER = process.env.CINEFY_PROXY_HEADERS === "1";

// cache curto so para nao repetir a mesma chamada ao abrir um titulo
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

// Erros viram log legivel (sem dados sensiveis) e resposta vazia, em vez de um 500 cru no Stremio.
const safe = (name, fallback, fn) => async (args) => {
  try {
    return await fn(args);
  } catch (e) {
    console.warn(`[${name}] ${e.message}`);
    return typeof fallback === "function" ? fallback(e) : fallback;
  }
};

const text = (d) => (typeof d === "string" ? d : d && typeof d === "object" ? d.text || d.pt || d.content || "" : "");
const year = (s) => (typeof s === "string" && /^\d{4}/.test(s) ? s.slice(0, 4) : undefined);
const minutes = (sec) => (typeof sec === "number" && sec > 0 ? `${Math.round(sec / 60)} min` : undefined);

// Pista de idioma a partir do titulo e das tags do video (o Cinefy nao expoe o idioma do audio).
// Os rotulos seguem o filtro PT-BR do Stremio for Gamepad.
export function languageTag(v) {
  const s = `${v.title || ""} ${(v.tags || []).join(" ")}`.toLowerCase();
  if (/dual\s*[aá]udio|\bdual\b/.test(s)) return "[DUAL]";
  if (/dublad|pt-?br|portugu[eê]s/.test(s)) return "[DUBLADO]";
  if (/legendad|\bleg\b|\bsub\b/.test(s)) return "[LEGENDADO]";
  return "";
}

function toPreview(v) {
  const ct = v.catalogTitle || {};
  return {
    id: PREFIX + v.id,
    type: "movie",
    name: ct.name || v.title,
    poster: ct.poster || v.thumbnail,
    posterShape: ct.poster ? "poster" : "landscape",
    releaseInfo: year(ct.releaseDate),
  };
}

function toMeta(v) {
  const ct = v.catalogTitle || {};
  return {
    ...toPreview(v),
    background: ct.backdrop || v.thumbnail,
    logo: ct.titleLogo,
    description: ct.overview || text(v.description),
    genres: Array.isArray(ct.genres) ? ct.genres : undefined,
    imdbRating: typeof ct.voteAverage === "number" ? ct.voteAverage.toFixed(1) : undefined,
    runtime: minutes(v.stream && v.stream.duration),
    released: ct.releaseDate,
  };
}

// Transforma um video do Cinefy em uma fonte do Stremio.
function toStream(v) {
  const url = v.playback && v.playback.url;
  if (!url) return null;
  const top = Array.isArray(v.stream && v.stream.resolutions) ? Math.max(...v.stream.resolutions) : null;
  // videos de reacao/comentario (ex.: "1a vez assistindo") nao sao so o filme: avisa na descricao
  const react = /rea[cç][aã]o|react|(1[ªa]|primeira)\s*vez|assistindo|comentad|\bcom\s+a\s+gente\b/i.test(v.title || "") ? "[REACT]" : "";
  const lang = [languageTag(v), react].filter(Boolean).join(" ");
  const canal = (v.author && v.author.displayName) || "Cinefy";
  const stream = {
    url,
    name: `Cinefy · ${canal}`,
    description: [lang, top ? `${top}p` : "", v.title].filter(Boolean).join(" · "),
  };
  if (SEND_REFERER) {
    stream.behaviorHints = {
      notWebReady: true,
      proxyHeaders: { request: { Referer: "https://cinefy.gg/", Origin: "https://cinefy.gg" } },
    };
  }
  return stream;
}

// Todos os videos ligados a uma serie (a API pagina de 20 em 20). Limite de 15 paginas = 300 videos.
const MAX_PAGES = 15;
async function seriesVideos(titleId) {
  return cached(`sv:${titleId}`, 10 * 60_000, async () => {
    const first = await api.videosByTitle(titleId, 20, 1);
    const all = [...(first.data || [])];
    const last = Math.min(Number(first.totalPage) || 1, MAX_PAGES);
    for (let p = 2; p <= last; p += 5) {
      const batch = [];
      for (let q = p; q < p + 5 && q <= last; q++) batch.push(api.videosByTitle(titleId, 20, q).catch(() => ({ data: [] })));
      for (const r of await Promise.all(batch)) all.push(...(r.data || []));
    }
    return all;
  });
}

// Busca por texto: varias consultas, varias paginas, em paralelo. Falha de uma consulta nao derruba as outras.
async function textSearch(queries) {
  const jobs = [];
  for (const q of queries) {
    for (let p = 1; p <= SEARCH_PAGES; p++) {
      jobs.push(cached(`q:${q}:${p}`, 10 * 60_000, () => api.searchVideos(q, p)).catch(() => ({ data: [] })));
    }
  }
  return (await Promise.all(jobs)).flatMap((r) => r.data || []);
}

// Junta listas de videos sem repetir o mesmo id.
function unique(...lists) {
  const seen = new Set();
  const out = [];
  for (const v of lists.flat()) {
    if (v && v.id && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
  }
  return out;
}

const pad2 = (n) => String(n).padStart(2, "0");

// Ordem das fontes: dubladas primeiro, depois maior resolucao; videos de reacao por ultimo.
const rank = (v) => {
  const tag = languageTag(v);
  const top = Array.isArray(v.stream && v.stream.resolutions) ? Math.max(...v.stream.resolutions) : 0;
  const react = /rea[cç][aã]o|react|(1[ªa]|primeira)\s*vez|assistindo/i.test(v.title || "") ? 1 : 0;
  return [react, tag === "[DUAL]" || tag === "[DUBLADO]" ? 0 : 1, -top];
};
const byRank = (a, b) => {
  const x = rank(a), y = rank(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

// Busca o detalhe (com a URL assinada atual) dos videos, 8 por vez para nao sobrecarregar a API.
async function streamsFor(videoList) {
  const picked = [...videoList].sort(byRank).slice(0, MAX_SOURCES);
  const streams = [];
  let expired = null;
  for (let i = 0; i < picked.length; i += 8) {
    const details = await Promise.allSettled(picked.slice(i, i + 8).map((v) => api.video(v.id)));
    for (const d of details) {
      if (d.status === "fulfilled") streams.push(toStream(d.value));
      else if (d.reason && d.reason.status === 401) expired = d.reason;
    }
  }
  if (!streams.length && expired) throw expired; // sessao expirada: o handler mostra o aviso de login
  return streams.filter(Boolean);
}

export async function buildAddon(slugs, { loginUrl } = {}) {
  const channels = [];
  for (const slug of slugs) {
    try {
      const c = await api.channel(slug);
      channels.push({ slug, id: c.id, name: c.displayName || slug });
    } catch (e) {
      console.warn(`[aviso] canal '${slug}' ignorado: ${e.message}`);
    }
  }
  if (!channels.length) throw new Error("Nenhum canal valido em CINEFY_CHANNELS.");

  const loginStream = {
    name: "Cinefy",
    description: "Entre na sua conta do Cinefy (clique para abrir)",
    externalUrl: loginUrl,
  };

  const manifest = {
    id: "local.cinefy.privado",
    version: "0.4.0",
    name: "Cinefy (privado)",
    description: "Fontes e videos da sua conta do Cinefy. Uso pessoal, roda localmente.",
    resources: [
      "catalog",
      { name: "meta", types: ["movie"], idPrefixes: [PREFIX] },
      { name: "stream", types: ["movie", "series"], idPrefixes: [PREFIX, "tt"] },
    ],
    types: ["movie", "series"],
    catalogs: channels.map((c) => ({ type: "movie", id: `canal:${c.slug}`, name: `Cinefy - ${c.name}` })),
    // configurable: o Stremio mostra a engrenagem, que abre /configure (a pagina de login) no navegador
    behaviorHints: { configurable: true, configurationRequired: false, adult: false },
  };

  const builder = new addonBuilder(manifest);
  const byCatalog = new Map(channels.map((c) => [`canal:${c.slug}`, c]));

  builder.defineCatalogHandler(safe("catalogo", { metas: [] }, async ({ id, extra }) => {
    const ch = byCatalog.get(id);
    if (!ch) return { metas: [] };
    const page = Math.floor((Number(extra && extra.skip) || 0) / PER_PAGE) + 1;
    const res = await cached(`cat:${ch.id}:${page}`, 60_000, () =>
      api.videos({ author: ch.id, page, perPage: PER_PAGE }));
    const list = (res.data || []).filter((v) => v.published !== false && v.status !== "failed");
    return { metas: list.map(toPreview), cacheMaxAge: 60 };
  }));

  builder.defineMetaHandler(safe("meta", { meta: null }, async ({ id }) => {
    if (!id.startsWith(PREFIX)) return { meta: null };
    const v = await cached(`meta:${id}`, 5 * 60_000, () => api.video(id.slice(PREFIX.length)));
    return { meta: toMeta(v), cacheMaxAge: 300 };
  }));

  builder.defineStreamHandler(safe("stream", (e) => ({ streams: e.status === 401 && loginUrl ? [loginStream] : [] }),
    async ({ type, id }) => {
      if (!auth.hasToken()) return { streams: loginUrl ? [loginStream] : [] };

      // Video escolhido direto no catalogo do canal: uma fonte so.
      if (id.startsWith(PREFIX)) {
        const v = await api.video(id.slice(PREFIX.length));
        const s = toStream(v);
        return { streams: s ? [s] : [], cacheMaxAge: 0 };
      }

      // Filme/episodio do Stremio (id do IMDb): cada video do Cinefy para esse titulo vira uma fonte.
      // Duas origens, sem repetir: os videos LIGADOS ao titulo no Cinefy e os achados pela BUSCA
      // por texto (muitos canais nao ligam o video ao titulo, entao so a busca os encontra).
      const { imdb, season, episode } = parseStremioId(type, id);
      const meta = await cinemetaMeta(type, imdb);
      if (!meta) return { streams: [], cacheMaxAge: 300 };
      const title = await findCinefyTitle(type, imdb); // pode ser null: ainda da para buscar por texto
      const names = [meta.name, title && title.name, title && title.originalName];

      if (type === "series") {
        if (season == null || episode == null) return { streams: [], cacheMaxAge: 300 };
        const variants = nameVariants(names, { short: true });
        // a API ranqueia melhor quando o episodio vai na consulta; cada forma de escrever acha canais diferentes
        const queries = variants.flatMap((v) => [...new Set([
          `${v} EP ${pad2(episode)}`, `${v} EP ${episode}`, `${v} T${season} EP ${pad2(episode)}`,
        ])]);
        const [linked, found] = await Promise.all([title ? seriesVideos(title.id) : [], textSearch(queries)]);
        // o episodio so esta no texto do titulo de cada video
        const hits = unique(linked, found.filter((v) => nameInTitle(v.title, variants)))
          .filter((v) => !isNonEpisode(v.title) && matchesEpisode(v, season, episode));
        return { streams: await streamsFor(hits), cacheMaxAge: 0 };
      }

      const variants = nameVariants(names, { short: false });
      const [linked, found] = await Promise.all([title ? seriesVideos(title.id) : [], textSearch(variants)]);
      const hits = unique(linked, found.filter((v) => movieTitleMatches(v.title, variants)));
      return { streams: await streamsFor(hits), cacheMaxAge: 0 };
    }));

  return builder.getInterface();
}
