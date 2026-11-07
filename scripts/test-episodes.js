// Testa a leitura de temporada/episodio com titulos REAIS vistos no Cinefy.
import { parseSE, matchesEpisode, isNonEpisode } from "../src/episodes.js";

const casos = [
  ["Supernatural | T3 - Ep. 16", 3, [16]],
  ["Supernatural T1 EP 2", 1, [2]],
  ["SUPERNATURAL / Temp 01 - EPISÓDIO 19. Procedência", 1, [19]],
  ["3TEMPORADA de SUPERNATURAL-EP12", 3, [12]],
  ["HAIKYU!! - 2ª Temporada - Episódios 17 e 18 (Primeira Vez)", 2, [17, 18]],
  ["Amagami SS+ Plus - EP: 09-10", null, [9, 10]],
  ["BLACK CLOVER EP. 176 - MULTIVERSANDO", null, [176]],
  ["Serie Qualquer S02E05 dublado", 2, [5]],
  ["Serie Qualquer 2x05", 2, [5]],
  ["Serie Temporada 4 Episodio 7", 4, [7]],
  ["Supernatural (7.ª temporada) l EP 01 - 02", 7, [1, 2]],
  ["SUPERNATURAL 3ª TEMPORADA - EP 16 - FINAL", 3, [16]],
  ["Supernatural T1 EP. 02", 1, [2]],
  ["React com o Doninha - Mushoku Tensei - 06° Ep - 3°Temp.", 3, [6]],
  ["React com o Doninha - Mushoku Tensei - 24° Ep - 1°Temp.", 1, [24]],
  ["MUSHOKU TENSEI 2T EP 01", 2, [1]],
  ["Mushoku Tensei | 1° temporada EP 01", 1, [1]],
  ["Mushoku Tensei - EP: 1X01 (Legendado)", 1, [1]],
  ["MUSHOKU TENSEI / 1 TEMPORADA - EPISÓDIO 1", 1, [1]],
  ["Mushoku Tensei |  •Ep. 15", null, [15]],
  ["Mushoku Tensei T.2 Ep 1-2", 2, [1, 2]],
];
let fails = 0;
for (const [titulo, season, eps] of casos) {
  const p = parseSE(titulo);
  const ok = p && p.season === season && JSON.stringify(p.episodes) === JSON.stringify(eps);
  console.log(`${ok ? "  OK   " : "  FALHA"} ${titulo} -> ${JSON.stringify(p)}`);
  if (!ok) fails++;
}
// titulos que NAO sao um episodio especifico
for (const t of ["MATRIX (1999)", "Filme: Matrix", "JUNGLE CRUISE", "[1.5] Ele CAIU no Corpo de um Líder FRACASSADO"]) {
  const p = parseSE(t);
  const ok = p === null || t.startsWith("[1.5]"); // o ultimo e ambiguo e nao deve quebrar
  console.log(`${ok ? "  OK   " : "  FALHA"} sem episodio: ${t} -> ${JSON.stringify(p)}`);
  if (!ok) fails++;
}
const check = (nome, cond) => { console.log(`${cond ? "  OK   " : "  FALHA"} ${nome}`); if (!cond) fails++; };
check("novel/volume nao e episodio", isNonEpisode("Mushoku Tensei Novel - Volume 16, Cap. 01") && !isNonEpisode("Mushoku Tensei - ep 1"));
check("T3 Ep 16 casa com 3:16", matchesEpisode({ title: "Supernatural | T3 - Ep. 16" }, 3, 16));
check("T3 Ep 16 nao casa com 1:16", !matchesEpisode({ title: "Supernatural | T3 - Ep. 16" }, 1, 16));
check("episodio duplo 17 e 18 casa com 2:18", matchesEpisode({ title: "HAIKYU!! - 2ª Temporada - Episódios 17 e 18" }, 2, 18));
check("sem temporada vale como temporada 1", matchesEpisode({ title: "BLACK CLOVER EP. 176" }, 1, 176));
check("sem temporada NAO vale para a temporada 2", !matchesEpisode({ title: "BLACK CLOVER EP. 176" }, 2, 176));
console.log(fails ? `\n${fails} falha(s)` : "\nTodos os testes de episodio passaram");
process.exit(fails ? 1 : 0);
