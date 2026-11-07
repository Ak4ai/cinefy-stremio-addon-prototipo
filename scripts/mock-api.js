// Cinefy e Cinemeta FALSOS, so para testes automaticos. Credenciais de mentira.
import http from "node:http";

export const FAKE = { email: "teste@exemplo.com", password: "senha-falsa", token: "token-falso", otpEmail: "otp@exemplo.com", otp: "123456" };

export function startMock(port) {
  const state = { validToken: FAKE.token };
  const videoDetail = (id, canal, titulo, tid = "T1") => ({
    id, title: titulo, tags: [], author: { displayName: canal },
    stream: { resolutions: [480, 720, 1080], duration: 5820 },
    catalogTitle: { id: tid, name: tid === "S1" ? "Serie Falsa" : "Ano Um", overview: "Sinopse falsa", genres: ["Comedia"], releaseDate: "2009-06-18", voteAverage: 5.2 },
    playback: { url: `http://127.0.0.1:${port}/cdn/${id}/playlist.m3u8` },
  });
  const videos = {
    v1: videoDetail("v1", "Smart", "ANO UM"),
    v2: videoDetail("v2", "Outro Canal", "Ano Um (2009) DUBLADO"),
    v3: videoDetail("v3", "Canal A", "Serie Falsa | T1 - Ep. 2", "S1"),
    v4: videoDetail("v4", "Canal B", "Serie Falsa T1 EP 3", "S1"),
    v5: videoDetail("v5", "Canal C", "Serie Falsa T2 EP 2 (1ª vez assistindo)", "S1"),
    // videos que NAO estao ligados ao titulo: so a busca por texto os encontra
    v6: videoDetail("v6", "Canal D", "Serie Falsa EP 02 (T1)", null),
    v7: videoDetail("v7", "Canal E", "Serie Falsa Novel - Volume 1, Cap. 02", null),
    v8: videoDetail("v8", "Canal F", "Outra Coisa EP 02", null),
    v9: videoDetail("v9", "Canal G", "Year One (2009) DUBLADO HD", null),
    v10: videoDetail("v10", "Canal H", "Year One Reloaded", null),
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    const authed = req.headers.authorization === `Bearer ${state.validToken}`;
    let body = {};
    if (req.method === "POST") {
      const chunks = []; for await (const c of req) chunks.push(c);
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* vazio */ }
    }

    if (u.pathname === "/v2/auth/login") {
      if (!body.session || body.session.platform !== "web") return send(422, { message: "Erro de validação" });
      if (body.email === FAKE.email && body.password === FAKE.password) return send(200, { data: { accessToken: state.validToken } });
      if (body.email === FAKE.otpEmail && body.password === FAKE.password) return send(200, { data: { tempToken: "tmp-falso" } });
      return send(401, { message: "Credenciais inválidas" });
    }
    if (u.pathname === "/v2/auth/login/otp") {
      if (body.tempToken === "tmp-falso" && body.code === FAKE.otp) return send(200, { data: { accessToken: state.validToken } });
      return send(422, { message: "Código inválido" });
    }
    if (u.pathname === "/v1/user/smart") return send(200, { id: "u1", displayName: "Smart" });
    if (u.pathname === "/v2/titles/search") {
      if (u.searchParams.get("query") === "Serie Falsa") {
        return send(200, { items: [{ id: "S1", kind: "series", name: "Serie Falsa", originalName: "Serie Falsa", releaseDate: "2005-01-01" }], nextCursor: null });
      }
      return send(200, { items: [
        { id: "T2", kind: "movie", name: "Outro Filme", originalName: "Other Movie", releaseDate: "2001-01-01" },
        { id: "T1", kind: "movie", name: "Ano Um", originalName: "Year One", releaseDate: "2009-06-18" },
      ], nextCursor: null });
    }
    if (u.pathname.startsWith("/meta/movie/")) return send(200, { meta: { name: "Year One", year: "2009" } });
    if (u.pathname.startsWith("/meta/series/")) return send(200, { meta: { name: "Serie Falsa", year: "2005" } });
    if (u.pathname === "/v1/videos") {
      if (!authed) return send(401, { message: "Você precisa estar logado" });
      const q = u.searchParams.get("query");
      if (q) { // busca por texto: devolve tambem videos sem ligacao com o titulo, e ruido
        const page = Number(u.searchParams.get("page") || 1);
        const ids = /^Serie Falsa EP 0?2$/.test(q) ? ["v6", "v7", "v8", "v3"] : /^(Year One|Ano Um)$/.test(q) ? ["v9", "v10", "v1"] : [];
        return send(200, { data: page === 1 ? ids.map((i) => videos[i]) : [], total: ids.length, page, totalPage: 1 });
      }
      if (u.searchParams.get("catalogTitle") === "S1") {
        const page = Number(u.searchParams.get("page") || 1); // 2 paginas, para testar a paginacao
        const ids = page === 1 ? ["v3", "v4"] : page === 2 ? ["v5"] : [];
        return send(200, { data: ids.map((i) => videos[i]), total: 3, page, totalPage: 2 });
      }
      const ids = u.searchParams.get("catalogTitle") === "T1" ? ["v1", "v2"] : ["v1"];
      return send(200, { data: ids.map((i) => videos[i]), total: ids.length, page: 1, totalPage: 1 });
    }
    if (u.pathname.startsWith("/v1/video/")) {
      if (!authed) return send(401, { message: "Você precisa estar logado" });
      const v = videos[u.pathname.split("/").pop()];
      return v ? send(200, v) : send(404, { message: "nao achado" });
    }
    send(404, { message: "rota desconhecida" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, state })));
}
