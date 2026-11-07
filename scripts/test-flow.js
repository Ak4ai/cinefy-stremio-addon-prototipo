// Teste de ponta a ponta com Cinefy FALSO: login, OTP, fontes por titulo, sessao expirada e protecoes.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { FAKE, startMock } from "./mock-api.js";

const API = 7100, ADDON = 7101;
const base = `http://127.0.0.1:${ADDON}`;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "cinefy-test-"));
const mock = await startMock(API);

let logs = "";
const child = spawn(process.execPath, ["index.js"], {
  env: { ...process.env, PORT: String(ADDON), CINEFY_API: `http://127.0.0.1:${API}`, CINEMETA_URL: `http://127.0.0.1:${API}`,
    CINEFY_HOME: home, CINEFY_TOKEN: "", CINEFY_CHANNELS: "smart" },
});
child.stdout.on("data", (d) => (logs += d));
child.stderr.on("data", (d) => (logs += d));
await new Promise((r) => setTimeout(r, 2500));

let fails = 0;
const check = (nome, cond, extra = "") => { console.log(`${cond ? "  OK   " : "  FALHA"} ${nome}${cond ? "" : " " + extra}`); if (!cond) fails++; };
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
const streams = async (type, id) => (await (await fetch(`${base}/stream/${type}/${encodeURIComponent(id)}.json`)).json()).streams;
const hostRequest = (host) => new Promise((resolve) => {
  http.get({ host: "127.0.0.1", port: ADDON, path: "/login", headers: { Host: host } }, (r) => { r.resume(); resolve(r.statusCode); });
});

try {
  const man = await (await fetch(`${base}/manifest.json`)).json();
  check("manifesto e configuravel (a engrenagem do Stremio aparece)", man.behaviorHints?.configurable === true);
  const cfg0 = await fetch(`${base}/configure`);
  check("/configure sem sessao mostra o formulario de login", cfg0.status === 200 && (await cfg0.text()).includes('name="password"'));
  check("status inicial: desconectado", (await (await fetch(`${base}/status`)).json()).conectado === false);
  let s = await streams("movie", "tt1045778");
  check("sem sessao: fonte pede login (externalUrl)", s.length === 1 && String(s[0].externalUrl).endsWith("/login"), JSON.stringify(s));

  let html = await (await fetch(`${base}/login`, form({ email: FAKE.email, password: "errada" }))).text();
  check("senha errada: mostra erro e nao conecta", html.includes("Login recusado") && !fs.existsSync(path.join(home, "session.json")));

  html = await (await fetch(`${base}/login`, form({ email: FAKE.email, password: FAKE.password }))).text();
  check("login correto: conectado", html.includes("Pronto"));
  const saved = fs.readFileSync(path.join(home, "session.json"), "utf8");
  check("arquivo de sessao guarda so o token, sem senha nem e-mail", saved.includes(FAKE.token) && !saved.includes(FAKE.password) && !saved.includes(FAKE.email), saved);

  check("/configure com sessao mostra que esta conectado", (await (await fetch(`${base}/configure`)).text()).includes("Pronto"));
  s = await streams("movie", "tt1045778");
  check("filme: 3 fontes = 2 ligadas ao titulo + 1 achada so pela busca de texto", s.length === 3, JSON.stringify(s.map((x) => x.name)));
  check("filme: 'Year One Reloaded' (outro filme) NAO entra e nao ha fonte repetida", !s.some((x) => x.name.includes("Canal H")) && new Set(s.map((x) => x.name)).size === s.length);
  check("filme: video dublado achado pela busca vem primeiro", s[0].name === "Cinefy · Canal G" || s[0].description.includes("[DUBLADO]"), JSON.stringify(s.map((x) => x.name)));
  check("fonte tem canal, resolucao e rotulo [DUBLADO]", s.some((x) => x.name === "Cinefy · Outro Canal" && x.description.includes("[DUBLADO]") && x.description.includes("1080p")), JSON.stringify(s));
  check("fonte e o link direto da URL assinada, sem proxy nem cabecalhos extras", s.every((x) => x.url.includes("/playlist.m3u8") && !x.behaviorHints));
  let ep = await streams("series", "tt9999999:1:2");
  check("serie 1:2 -> Canal A (ligado) + Canal D (so pela busca de texto)", ep.length === 2 && ep.some((x) => x.name === "Cinefy · Canal A") && ep.some((x) => x.name === "Cinefy · Canal D"), JSON.stringify(ep.map((x) => x.name)));
  check("serie 1:2: novel/volume e video de outra serie ficam de fora", !ep.some((x) => /Canal [EF]/.test(x.name)));
  ep = await streams("series", "tt9999999:2:2");
  check("serie 2:2 -> Canal C (esta na pagina 2) com rotulo [REACT]", ep.length === 1 && ep[0].name === "Cinefy · Canal C" && ep[0].description.includes("[REACT]"), JSON.stringify(ep));
  check("serie 1:9 (sem video) -> lista vazia, sem erro", (await streams("series", "tt9999999:1:9")).length === 0);
  check("serie sem temporada/episodio no id -> lista vazia", (await streams("series", "tt9999999")).length === 0);

  await fetch(`${base}/logout`);
  html = await (await fetch(`${base}/login`, form({ email: FAKE.otpEmail, password: FAKE.password }))).text();
  check("conta com 2 etapas: pede o codigo", html.includes("Verificacao em duas etapas") && html.includes('name="tempToken"'));
  html = await (await fetch(`${base}/login/otp`, form({ code: "000000", tempToken: "tmp-falso" }))).text();
  check("codigo errado: erro e mantem o formulario", html.includes("Código inválido") && html.includes('value="tmp-falso"'));
  html = await (await fetch(`${base}/login/otp`, form({ code: FAKE.otp, tempToken: "tmp-falso" }))).text();
  check("codigo certo: conectado", html.includes("Pronto"));

  mock.state.validToken = "outro-token"; // sessao expira no servidor
  s = await streams("movie", "tt1045778");
  check("sessao expirada: volta a pedir login e apaga o token", s.length === 1 && s[0].externalUrl && !fs.existsSync(path.join(home, "session.json")), JSON.stringify(s));

  check("Host estranho (DNS rebinding) e bloqueado", (await hostRequest("evil.example.com")) === 403);
  const origin = await fetch(`${base}/login`, { ...form({ email: "a@b.c", password: "x" }), headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://evil.example.com" } });
  check("Origin de outro site e bloqueado", origin.status === 403);
  const same = await fetch(`${base}/login`, { ...form({ email: "a@b.c", password: "x" }), headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: base } });
  check("Origin do proprio addon e aceito (como o navegador envia)", same.status === 200);
  check("pagina de login usa Referrer-Policy same-origin (o navegador envia Origin correto)", (await fetch(`${base}/login`)).headers.get("referrer-policy") === "same-origin");
  check("a senha nunca aparece nos logs do addon", !logs.includes(FAKE.password) && !logs.includes(FAKE.token), "(vazou)");
} finally {
  child.kill();
  mock.server.close();
  fs.rmSync(home, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} falha(s)` : "\nTodos os testes passaram");
process.exit(fails ? 1 : 0);
