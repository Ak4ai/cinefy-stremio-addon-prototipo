// Cliente minimo da API do Cinefy, usando a sessao guardada em auth.js.
// O token nunca e registrado em log.
import { API_BASE, SESSION_INFO } from "./config.js";
import * as auth from "./auth.js";

const PLATFORM_QS = new URLSearchParams(SESSION_INFO).toString();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function get(path, { needsAuth = true, retries = 2 } = {}) {
  const headers = { Accept: "application/json" };
  if (needsAuth) {
    const t = auth.getToken();
    if (!t) throw new ApiError(401, "Sem sessao. Entre em /login do addon.");
    headers.Authorization = `Bearer ${t}`;
  }
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(API_BASE + path, { headers, signal: AbortSignal.timeout(15000) });
      if (res.status === 401) {
        if (needsAuth) auth.clearToken();
        throw new ApiError(401, "Sessao expirada. Entre de novo em /login do addon.");
      }
      if (res.status === 429 || res.status >= 500) {
        last = new ApiError(res.status, `Erro ${res.status} da API`);
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        continue;
      }
      if (!res.ok) throw new ApiError(res.status, `Erro ${res.status} em ${path.split("?")[0]}`);
      return await res.json();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export const me = () => get(`/v2/auth/@me?${PLATFORM_QS}`);
export const channel = (slug) => get(`/v1/user/${encodeURIComponent(slug)}`, { needsAuth: false });
export const videos = ({ author, page = 1, perPage = 50, collapse = false }) =>
  get(`/v1/videos?perPage=${perPage}&page=${page}&author=${author}&collapse=${collapse}&sortedOrder=desc`);
export const video = (id) => get(`/v1/video/${encodeURIComponent(id)}`);
export const playlists = (id) => get(`/v2/videos/${encodeURIComponent(id)}/public-playlists`);
// Vinculo titulo -> videos: o proprio site usa catalogTitle=<id> na pagina do titulo.
export const videosByTitle = (titleId, perPage = 20, page = 1) =>
  get(`/v1/videos?perPage=${perPage}&page=${page}&sortedOrder=desc&collapse=true&catalogTitle=${encodeURIComponent(titleId)}`);
// Busca por texto nos videos (parametro query). Com o episodio na consulta ("Nome EP 01") a API
// ranqueia os videos certos primeiro; sem ele, a lista e enorme e generica.
export const searchVideos = (query, page = 1) =>
  get(`/v1/videos?perPage=20&page=${page}&query=${encodeURIComponent(query)}`);
export const titleSearch = (query, limit = 10) =>
  get(`/v2/titles/search?query=${encodeURIComponent(query)}&limit=${limit}`);
export const title = (id) => get(`/v2/titles/${encodeURIComponent(id)}`);
export const titleChildren = (id) => get(`/v2/titles/${encodeURIComponent(id)}/children`);
