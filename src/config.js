// Configuracao compartilhada. CINEFY_API existe so para testes com uma API falsa.
export const API_BASE = process.env.CINEFY_API || "https://api.cinefy.gg";

// Mesmo conjunto que o site envia em /v2/auth/@me e usa como "session" no login.
export const SESSION_INFO = {
  platform: "web",
  platformLang: "pt-BR",
  platformTimeZone: "America/Sao_Paulo",
  screenWidth: 1920,
  screenHeight: 1080,
};
