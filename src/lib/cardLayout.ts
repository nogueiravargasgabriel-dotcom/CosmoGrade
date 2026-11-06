// Geometria do cartão-resposta em milímetros (A4 210 x 297).
export const PAGE = { w: 210, h: 297 };
export const MARKER_SIZE = 10;
/** Centros das marcas de referência: TL, TR, BL, BR */
export const MARKERS: [number, number][] = [
  [15, 15],
  [195, 15],
  [15, 282],
  [195, 282],
];
/** Barra de orientação (deve aparecer no canto superior esquerdo) */
export const ORIENT = { x: 26, y: 12, w: 30, h: 6 };
export const GRID = { x: 20, y: 82, w: 170, rowH: 7.5, maxRows: 24, label: 9, pitch: 6.5, r: 2.3 };

export function colunas(n: number) {
  return Math.max(1, Math.ceil(n / GRID.maxRows));
}
export function maxQuestoes(alts: number) {
  const cols = Math.floor(GRID.w / (GRID.label + 2 + alts * GRID.pitch));
  return cols * GRID.maxRows;
}
export function bolha(q: number, a: number, n: number): [number, number] {
  const cols = colunas(n);
  const perCol = Math.ceil(n / cols);
  const colW = GRID.w / cols;
  const c = Math.floor(q / perCol);
  const r = q % perCol;
  return [GRID.x + c * colW + GRID.label + GRID.pitch / 2 + a * GRID.pitch, GRID.y + r * GRID.rowH];
}

// ---------- Cartão legado (Colégio Marista, 25 questões A–E, sem marcas de referência) ----------
// Medido sobre a digitalização do modelo em branco (A4 retrato).
export const LEGACY = {
  questoes: 25,
  alternativas: 5,
  linhas: 13, // Q1–13 na coluna esquerda, Q14–25 na direita
  colX: [67.9, 119.1], // centro da bolha "A" de cada coluna (mm)
  pitchX: 7.43, // distância entre bolhas vizinhas (mm)
  y0: 151.0, // centro da linha 1 (mm)
  pitchY: 10.34, // distância entre linhas (mm)
  r: 1.6, // raio da bolha (mm)
};

export function bolhaLegacy(q: number, a: number): [number, number] {
  const col = q < LEGACY.linhas ? 0 : 1;
  const linha = q % LEGACY.linhas;
  return [LEGACY.colX[col] + a * LEGACY.pitchX, LEGACY.y0 + linha * LEGACY.pitchY];
}
