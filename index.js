import http from "node:http";
import sdk from "stremio-addon-sdk";
import { buildAddon } from "./src/addon.js";
import { handleLogin } from "./src/login-page.js";
import * as auth from "./src/auth.js";

const PORT = Number(process.env.PORT) || 7000;
// So escuta em 127.0.0.1 por padrao: o addon usa a SUA sessao e nao deve ficar exposto na rede.
// Para a TV acessar pela rede local, defina HOST=0.0.0.0 e proteja a rede.
const HOST = process.env.HOST || "127.0.0.1";
const loopbackOnly = ["127.0.0.1", "localhost", "::1"].includes(HOST);
const slugs = (process.env.CINEFY_CHANNELS || "smart").split(",").map((s) => s.trim()).filter(Boolean);
const loginUrl = `http://${loopbackOnly ? "127.0.0.1" : HOST}:${PORT}/login`;

const addon = await buildAddon(slugs, { loginUrl });
const router = sdk.getRouter(addon);

http
  .createServer(async (req, res) => {
    try {
      if (await handleLogin(req, res, { port: PORT, loopbackOnly })) return;
    } catch {
      res.statusCode = 500;
      return res.end("erro");
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    router(req, res, () => {
      res.statusCode = 404;
      res.end("nao encontrado");
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Addon no ar: http://${HOST}:${PORT}/manifest.json`);
    console.log(auth.hasToken() ? "Sessao do Cinefy: conectada" : `Sessao do Cinefy: nao conectada. Entre em ${loginUrl}`);
  });
