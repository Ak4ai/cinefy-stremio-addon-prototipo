# Cinefy para Stremio (protótipo)

![Demonstração: instalar o addon, entrar pela engrenagem e escolher a fonte por canal](docs/demo.gif)

> **Protótipo.** Funciona e tem testes automáticos, mas é um projeto em evolução: o casamento de títulos e a leitura de episódios são heurísticas e podem errar (veja "Limites conhecidos").

Addon **local** do Stremio que traz as fontes de vídeo da **sua** conta do Cinefy. Ele não contém nem distribui nenhum conteúdo: roda na sua máquina, entra com o seu login e só mostra o que a sua conta já pode assistir.

## Como funciona

- **Fontes por título:** quando você abre um filme ou episódio no Stremio, o addon descobre o nome e o ano pelo código do IMDb e junta, sem repetir, duas origens: os vídeos **ligados** ao título no Cinefy e os achados pela **busca por texto** (muitos canais não ligam o vídeo ao título, então só a busca os encontra). Cada vídeo vira uma fonte (`Cinefy · <canal>`, com resolução e rótulo `[DUBLADO]`/`[DUAL]`/`[LEGENDADO]` quando o título do vídeo indica).
- **Catálogos por canal:** um por canal de `CINEFY_CHANNELS` (padrão `smart`), para navegar direto.
- **Reprodução:** a URL HLS assinada é pedida na hora de tocar (ela expira em poucas horas).
- Só escuta em `127.0.0.1`. Nada é hospedado.

## Instalar

Precisa do [Node.js](https://nodejs.org/) 20 ou mais novo.

- **Pela release:** baixe o `.zip` da última versão em *Releases*, extraia e rode `npm ci --omit=dev` dentro da pasta.
- **Pelo código:** clone o repositório e rode `npm ci`.

## Usar

1. `npm start` (o addon sobe em `http://127.0.0.1:7000`).
2. No Stremio: Addons → instalar por URL → `http://127.0.0.1:7000/manifest.json`.
3. Clique na **engrenagem** do addon: ela abre `http://127.0.0.1:7000/configure` no navegador. Entre com o seu e-mail e senha do Cinefy (e o código de 2 etapas, se a conta tiver). Os dados vão direto ao Cinefy.
4. Pronto: abra um filme ou episódio e escolha uma fonte `Cinefy · <canal>`.

O addon guarda **só o token** em `%APPDATA%\cinefy-addon\session.json`. A senha não é salva nem registrada em log. Para sair: `http://127.0.0.1:7000/logout`. Se a sessão expirar, a fonte "Cinefy" passa a mostrar "Entre na sua conta" e abre a página de login.

## Testes

```bash
npm test          # fluxo completo contra um Cinefy FALSO (login, 2 etapas, fontes, sessão expirada, proteções)
npm run smoke     # confere a sua conta real (depois de entrar em /login)
```

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `CINEFY_CHANNELS` | `smart` | slugs dos canais, separados por vírgula |
| `PORT` / `HOST` | `7000` / `127.0.0.1` | onde escuta |
| `CINEFY_PROXY_HEADERS` | desligado | `1` faz o Stremio usar o proxy dele com `Referer`/`Origin` (o CDN não exige) |
| `CINEFY_SEARCH_PAGES` | `4` | páginas da busca por texto por consulta (mais páginas = mais fontes, e mais lento) |
| `CINEFY_TOKEN` | (opcional) | usa este token em vez do login |
| `CINEFY_HOME` | `%APPDATA%\cinefy-addon` | onde guardar a sessão |

## Limites conhecidos

- **Séries:** no Cinefy os vídeos ficam ligados à série inteira, então a temporada e o episódio são lidos do **texto do título** de cada vídeo ("T3 - Ep. 16", "Temp 01 - EPISÓDIO 19", "3ª TEMPORADA - EP 16"). Funciona bem, mas é heurística: vídeos sem temporada no título só valem para a temporada 1 (comum em animes com numeração corrida), e títulos fora do padrão podem não ser reconhecidos. Lê no máximo 300 vídeos por série.
- O casamento IMDb → título do Cinefy é por nome e ano; pode errar em títulos com nomes muito diferentes.
- O Cinefy não informa o idioma do áudio; o rótulo é uma pista pelo texto do título do vídeo.
- O CDN não exige `Referer` (testado), então a fonte é o link HLS direto.
