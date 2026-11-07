// Teste de fumaca: confere login, catalogo, detalhe e se o CDN aceita a URL assinada.
// Imprime so status e formatos. Nunca imprime o token nem a URL assinada.
import * as api from "../src/api.js";

const slug = process.argv[2] || "smart";
const ok = (m) => console.log("  OK  ", m);
const bad = (m) => { console.log("  FALHA", m); process.exitCode = 1; };

try {
  const me = await api.me();
  ok(`login: conta com ${me.subsMetadata?.count ?? "?"} assinatura(s) ativa(s)`);
} catch (e) { bad(`login: ${e.message}`); process.exit(1); }

const ch = await api.channel(slug);
ok(`canal '${slug}': ${ch.videos} videos`);

const list = await api.videos({ author: ch.id, page: 1, perPage: 3 });
ok(`catalogo: ${list.data.length} de ${list.total} (pagina 1 de ${list.totalPage})`);

const v = await api.video(list.data[0].id);
const url = v.playback?.url;
if (!url) { bad("detalhe sem playback.url"); process.exit(1); }
const exp = Number(new URL(url).pathname.match(/expires=(\d+)/)?.[1]);
ok(`detalhe: metadados ${v.catalogTitle ? "do catalogo" : "basicos"}, URL expira em ${exp ? Math.round((exp * 1000 - Date.now()) / 36e5 * 10) / 10 + " h" : "?"}`);
ok(`campo playback.authorization: ${v.playback.authorization ? "presente (" + typeof v.playback.authorization + ")" : "ausente"}`);

async function probe(label, headers) {
  const r = await fetch(url, { headers });
  const body = r.ok ? await r.text() : "";
  console.log(`  CDN ${label}: HTTP ${r.status}${r.ok ? ", " + (body.startsWith("#EXTM3U") ? "playlist HLS valida" : "resposta inesperada") : ""}`);
  return r.ok;
}
const comRef = await probe("com Referer", { Referer: "https://cinefy.gg/", Origin: "https://cinefy.gg" });
const semRef = await probe("sem Referer", {});
console.log(`\nConclusao: Referer ${semRef ? "NAO e necessario" : comRef ? "e NECESSARIO (o addon ja o envia)" : "nao resolveu; ver playback.authorization"}`);
