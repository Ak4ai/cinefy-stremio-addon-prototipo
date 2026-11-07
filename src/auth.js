// Sessao do Cinefy: login por e-mail e senha, verificacao em duas etapas (OTP) e guarda do token.
// A senha NUNCA e salva nem registrada em log: ela so passa pela requisicao de login.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_BASE, SESSION_INFO } from "./config.js";

export class AuthError extends Error {}

const dir = process.env.CINEFY_HOME || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "cinefy-addon");
const file = path.join(dir, "session.json");

let token = null;
let fromEnv = false;

function load() {
  if (process.env.CINEFY_TOKEN) {
    token = process.env.CINEFY_TOKEN;
    fromEnv = true;
    return;
  }
  try {
    token = JSON.parse(fs.readFileSync(file, "utf8")).token || null;
  } catch {
    token = null;
  }
}
load();

function save() {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token }), { mode: 0o600 });
}

export const getToken = () => token;
export const hasToken = () => Boolean(token);

export function clearToken() {
  if (fromEnv) return; // token vindo do ambiente nao e apagado
  token = null;
  try { fs.rmSync(file, { force: true }); } catch { /* ignora */ }
}

export function setToken(t) {
  token = t;
  fromEnv = false;
  save();
}

async function post(route, body) {
  let res;
  try {
    res = await fetch(API_BASE + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AuthError("Nao consegui falar com o Cinefy. Verifique a conexao.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message : `Erro ${res.status}`;
    throw new AuthError(res.status === 401 || res.status === 422 ? `Login recusado: ${msg}` : msg);
  }
  return json.data || json;
}

// Retorna { ok: true } ou { otp: true, tempToken } quando a conta exige o codigo de 2 etapas.
export async function login(email, password) {
  if (!email || !password) throw new AuthError("Informe e-mail e senha.");
  const d = await post("/v2/auth/login", { email, password, session: SESSION_INFO });
  if (d.accessToken) { setToken(d.accessToken); return { ok: true }; }
  if (d.tempToken) return { otp: true, tempToken: d.tempToken };
  throw new AuthError("Resposta de login inesperada.");
}

export async function loginOtp(code, tempToken) {
  if (!code || !tempToken) throw new AuthError("Informe o codigo de verificacao.");
  const d = await post("/v2/auth/login/otp", { code, tempToken });
  if (!d.accessToken) throw new AuthError("Codigo recusado.");
  setToken(d.accessToken);
  return { ok: true };
}
