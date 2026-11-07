// Pagina e rotas de login locais. So atende em loopback e nunca registra credenciais.
import * as auth from "./auth.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const page = (body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cinefy no Stremio</title>
<style>
:root{color-scheme:light dark}
body{font:16px system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:Canvas;color:CanvasText}
main{width:min(92vw,380px);padding:24px;border:1px solid #8884;border-radius:12px}
h1{font-size:20px;margin:0 0 4px}p{margin:6px 0 14px;opacity:.75}
label{display:block;margin:12px 0 4px;font-size:14px}
input{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid #8886;border-radius:8px;background:Field;color:FieldText}
button{width:100%;margin-top:18px;padding:11px;font-size:16px;border:0;border-radius:8px;background:#6b46c1;color:#fff;cursor:pointer}
.msg{margin-top:14px;padding:10px;border-radius:8px;background:#c0392b22}.ok{background:#27ae6022}
small{display:block;margin-top:14px;opacity:.6}
</style></head><body><main>${body}</main></body></html>`;

const form = (msg) => page(`<h1>Entrar no Cinefy</h1><p>Seus dados vao direto para o Cinefy. Este addon nao guarda a senha.</p>
<form method="post" action="/login"><label>E-mail<input name="email" type="email" autocomplete="username" required autofocus></label>
<label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
<button>Entrar</button></form>${msg ? `<div class="msg">${esc(msg)}</div>` : ""}`);

const otpForm = (tempToken, msg) => page(`<h1>Verificacao em duas etapas</h1><p>Digite o codigo do seu aplicativo autenticador.</p>
<form method="post" action="/login/otp"><input type="hidden" name="tempToken" value="${esc(tempToken)}">
<label>Codigo<input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus></label>
<button>Confirmar</button></form>${msg ? `<div class="msg">${esc(msg)}</div>` : ""}`);

const done = () => page(`<h1>Pronto</h1><div class="msg ok">Voce esta conectado ao Cinefy. Pode fechar esta pagina e abrir o Stremio.</div>
<small>Para sair, abra <code>/logout</code>.</small>`);

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 10_000) throw new Error("corpo grande demais");
    chunks.push(c);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

function send(res, status, html, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  res.end(html);
}

// Evita que outro site abra o login no seu navegador (DNS rebinding / CSRF).
function allowed(req, port, loopbackOnly) {
  if (!loopbackOnly) return true;
  const ok = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (!ok.has(req.headers.host || "")) return false;
  const origin = req.headers.origin;
  return !origin || ok.has(origin.replace(/^https?:\/\//, ""));
}

// Retorna true se a rota foi tratada aqui.
export async function handleLogin(req, res, { port, loopbackOnly }) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  if (!["/login", "/login/otp", "/logout", "/status", "/configure"].includes(p)) return false;
  if (!allowed(req, port, loopbackOnly)) { send(res, 403, "proibido", "text/plain"); return true; }

  if (p === "/status") {
    send(res, 200, JSON.stringify({ conectado: auth.hasToken() }), "application/json");
    return true;
  }
  if (p === "/logout") {
    auth.clearToken();
    send(res, 200, page(`<h1>Desconectado</h1><div class="msg ok">Sessao removida deste computador.</div>`));
    return true;
  }
  if (req.method === "GET") {
    send(res, 200, p === "/login" || p === "/configure" ? (auth.hasToken() ? done() : form()) : form());
    return true;
  }
  if (req.method !== "POST") { send(res, 405, "metodo nao permitido", "text/plain"); return true; }

  let body = {};
  try {
    body = await readBody(req);
    if (p === "/login") {
      const r = await auth.login(body.email, body.password);
      send(res, 200, r.otp ? otpForm(r.tempToken) : done());
    } else {
      await auth.loginOtp(body.code, body.tempToken);
      send(res, 200, done());
    }
  } catch (e) {
    const msg = e instanceof auth.AuthError ? e.message : "Nao foi possivel entrar.";
    send(res, 200, p === "/login" ? form(msg) : otpForm(body.tempToken, msg));
  }
  return true;
}
