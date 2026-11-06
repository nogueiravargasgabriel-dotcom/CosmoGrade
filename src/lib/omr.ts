import type { Leitura } from "./db";
import { MARKERS, ORIENT, bolha, bolhaLegacy, GRID, LEGACY } from "./cardLayout";

type Pt = [number, number];

/** Calcula a homografia (8 parâmetros) que leva pontos src -> dst. */
export function homografia(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-12) throw new Error("Geometria degenerada");
    for (let k = c; k <= n; k++) A[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row) => row[n]);
}

export function aplicar(h: number[], [x, y]: Pt): Pt {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

function otsu(gray: Uint8Array) {
  const hist = new Array(256).fill(0);
  for (const g of gray) hist[g]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    best = 0,
    thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB,
      mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return { thr, hist };
}

function percentil(hist: number[], total: number, p: number) {
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * p) return i;
  }
  return 255;
}

type Blob2 = { cx: number; cy: number; w: number; h: number; area: number };

function componentes(
  dark: Uint8Array,
  W: number,
  H: number,
  minSide: number,
  maxSide: number,
): Blob2[] {
  const lbl = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const out: Blob2[] = [];
  let id = 0;
  for (let s = 0; s < W * H; s++) {
    if (!dark[s] || lbl[s]) continue;
    id++;
    let sp = 0;
    stack[sp++] = s;
    lbl[s] = id;
    let minX = W,
      maxX = 0,
      minY = H,
      maxY = 0,
      area = 0,
      sx = 0,
      sy = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % W,
        y = (p / W) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && dark[p - 1] && !lbl[p - 1]) {
        lbl[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < W - 1 && dark[p + 1] && !lbl[p + 1]) {
        lbl[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && dark[p - W] && !lbl[p - W]) {
        lbl[p - W] = id;
        stack[sp++] = p - W;
      }
      if (y < H - 1 && dark[p + W] && !lbl[p + W]) {
        lbl[p + W] = id;
        stack[sp++] = p + W;
      }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1;
    if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
    const ratio = w / h;
    if (ratio < 0.6 || ratio > 1.65) continue;
    if (area / (w * h) < 0.6) continue;
    out.push({ cx: sx / area, cy: sy / area, w, h, area });
  }
  return out;
}

function erro(msg: string[], n: number): Leitura {
  return {
    status: "erro",
    mensagens: msg,
    detectadas: new Array(n).fill(-1),
    preenchimento: [],
    confianca: new Array(n).fill(0),
    revisar: new Array(n).fill(true),
    confiancaGeral: 0,
    lidoEm: Date.now(),
  };
}

export const LIMIAR_MARCADA = 0.45;
export const LIMIAR_DUVIDA = 0.2;

export async function lerCartao(dataUrl: string, n: number, alts: number): Promise<Leitura> {
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    return erro(["Não foi possível abrir a imagem. Envie um arquivo JPG ou PNG válido."], n);
  }
  const W0 = img.naturalWidth,
    H0 = img.naturalHeight;
  if (Math.min(W0, H0) < 500)
    return erro(
      [
        `Resolução muito baixa (${W0}×${H0}px). Envie uma imagem com pelo menos 1000px no lado menor.`,
      ],
      n,
    );

  const scale = Math.min(1, 1600 / Math.max(W0, H0));
  const W = Math.round(W0 * scale),
    H = Math.round(H0 * scale);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const gray = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4)
    gray[i] = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) | 0;

  const { thr, hist } = otsu(gray);
  const papel = percentil(hist, gray.length, 0.9);
  const tinta = percentil(hist, gray.length, 0.02);
  if (papel - tinta < 60)
    return erro(
      [
        "Contraste muito baixo: a imagem está escura, desbotada ou desfocada. Fotografe com boa iluminação e sem sombras.",
      ],
      n,
    );

  const dark = new Uint8Array(W * H);
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] < thr ? 1 : 0;
  const maxDim = Math.max(W, H);
  const blobs = componentes(dark, W, H, maxDim * 0.012, maxDim * 0.09);

  const cantos: [number, number][] = [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ];
  const escolhidos: Blob2[] = [];
  for (const [kx, ky] of cantos) {
    let best: Blob2 | null = null,
      bd = Infinity;
    for (const b of blobs) {
      if (escolhidos.includes(b)) continue;
      const d = Math.abs(b.cx - kx) + Math.abs(b.cy - ky);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) break;
    escolhidos.push(best);
  }
  if (escolhidos.length < 4)
    return erro(
      [
        "Não encontrei as 4 marcas de referência (quadrados pretos nos cantos). A imagem pode estar cortada — fotografe o cartão inteiro.",
      ],
      n,
    );

  const [tl, tr, bl, br] = escolhidos;
  const top = Math.hypot(tr.cx - tl.cx, tr.cy - tl.cy),
    bot = Math.hypot(br.cx - bl.cx, br.cy - bl.cy);
  const left = Math.hypot(bl.cx - tl.cx, bl.cy - tl.cy),
    right = Math.hypot(br.cx - tr.cx, br.cy - tr.cy);
  const esperado = (MARKERS[2][1] - MARKERS[0][1]) / (MARKERS[1][0] - MARKERS[0][0]);
  const aspecto = (left + right) / (top + bot);
  const mensagens: string[] = [];
  if (
    top / bot < 0.75 ||
    top / bot > 1.33 ||
    left / right < 0.75 ||
    left / right > 1.33 ||
    Math.abs(aspecto / esperado - 1) > 0.25
  )
    return erro(
      [
        "O cartão está muito inclinado, cortado ou as marcas de referência não correspondem ao modelo. Fotografe de frente, com o cartão inteiro e plano.",
      ],
      n,
    );
  if (Math.abs(aspecto / esperado - 1) > 0.1 || top / bot < 0.9 || top / bot > 1.11)
    mensagens.push(
      "Imagem com perspectiva acentuada; a leitura foi corrigida, mas revise com atenção.",
    );

  const hOrig = homografia(
    MARKERS,
    escolhidos.map((b) => [b.cx / scale, b.cy / scale]),
  );
  const map = (p: Pt): Pt => {
    const [x, y] = aplicar(hOrig, p);
    return [x * scale, y * scale];
  };

  const pxmm = Math.hypot(...(map([106, 148]).map((v, i) => v - map([105, 148])[i]) as Pt));
  if (pxmm < 2.5)
    return erro(
      [
        `Resolução insuficiente para leitura confiável (${pxmm.toFixed(1)} px/mm). Aproxime a câmera ou digitalize com mais qualidade.`,
      ],
      n,
    );

  const corte = papel * 0.6;
  const amostra = (cx: number, cy: number, rx: number, ry: number) => {
    let tot = 0,
      esc = 0;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) {
          tot++;
          continue;
        }
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        tot++;
        if (gray[y * W + x] < corte) esc++;
      }
    return tot ? esc / tot : 0;
  };

  // Barra de orientação (confirma que é um cartão do CosmoGrade na posição correta)
  const [ox, oy] = map([ORIENT.x + ORIENT.w / 2, ORIENT.y + ORIENT.h / 2]);
  if (amostra(ox, oy, pxmm * ORIENT.w * 0.35, pxmm * ORIENT.h * 0.3) < 0.5)
    return erro(
      [
        "Não reconheci a barra de orientação do cartão. A imagem pode estar de cabeça para baixo ou não é um cartão gerado pelo CosmoGrade.",
      ],
      n,
    );

  const r = GRID.r * 0.65 * pxmm;
  const preenchimento: number[][] = [];
  const detectadas: number[] = [],
    confianca: number[] = [],
    revisar: boolean[] = [];
  for (let q = 0; q < n; q++) {
    const f: number[] = [];
    for (let a = 0; a < alts; a++) {
      const [x, y] = map(bolha(q, a, n));
      f.push(amostra(x, y, r, r));
    }
    preenchimento.push(f.map((v) => Math.round(v * 100) / 100));
    const ordem = f.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const marcadas = ordem.filter((o) => o.v >= LIMIAR_MARCADA);
    const duvidas = ordem.filter((o) => o.v >= LIMIAR_DUVIDA && o.v < LIMIAR_MARCADA);
    if (marcadas.length > 1) {
      detectadas.push(-2);
      confianca.push(Math.min(1, marcadas[1].v / 0.8));
      revisar.push(true);
    } else if (marcadas.length === 1) {
      detectadas.push(marcadas[0].i);
      const segundo = ordem[1]?.v ?? 0;
      const c = Math.max(0, Math.min(1, (marcadas[0].v - segundo) / 0.5));
      confianca.push(c);
      revisar.push(duvidas.length > 0 || c < 0.5);
    } else if (duvidas.length) {
      detectadas.push(duvidas[0].i);
      confianca.push(0.3);
      revisar.push(true);
    } else {
      detectadas.push(-1);
      confianca.push(Math.max(0, Math.min(1, 1 - (ordem[0]?.v ?? 0) / LIMIAR_DUVIDA)));
      revisar.push(true); // em branco sempre passa por revisão
    }
  }
  const nRev = revisar.filter(Boolean).length;
  if (nRev)
    mensagens.push(
      `${nRev} ${nRev === 1 ? "questão precisa" : "questões precisam"} de revisão (em branco, múltipla ou marcação pouco nítida).`,
    );
  return {
    status: nRev ? "revisar" : "ok",
    mensagens,
    detectadas,
    preenchimento,
    confianca,
    revisar,
    confiancaGeral: confianca.reduce((s, c) => s + c, 0) / Math.max(1, n),
    homografia: hOrig,
    lidoEm: Date.now(),
  };
}

export function lerArquivo(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

// ============= Cartão legado (Marista, 25 questões A–E, sem marcas de referência) =============

/** Componentes com formato de anel (contorno de bolha): preenchimento parcial da caixa. */
function componentesAneis(dark: Uint8Array, W: number, H: number, minSide: number, maxSide: number) {
  const lbl = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const out: Blob2[] = [];
  let id = 0;
  for (let s = 0; s < W * H; s++) {
    if (!dark[s] || lbl[s]) continue;
    id++;
    let sp = 0;
    stack[sp++] = s;
    lbl[s] = id;
    let minX = W,
      maxX = 0,
      minY = H,
      maxY = 0,
      area = 0,
      sx = 0,
      sy = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % W,
        y = (p / W) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && dark[p - 1] && !lbl[p - 1]) {
        lbl[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < W - 1 && dark[p + 1] && !lbl[p + 1]) {
        lbl[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && dark[p - W] && !lbl[p - W]) {
        lbl[p - W] = id;
        stack[sp++] = p - W;
      }
      if (y < H - 1 && dark[p + W] && !lbl[p + W]) {
        lbl[p + W] = id;
        stack[sp++] = p + W;
      }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1;
    if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
    const ratio = w / h;
    if (ratio < 0.65 || ratio > 1.5) continue;
    const fill = area / (w * h);
    if (fill < 0.15 || fill > 0.75) continue; // anel ou bolha parcialmente marcada
    out.push({ cx: sx / area, cy: sy / area, w, h, area });
  }
  return out;
}

function agrupar(vals: number[], gap: number): number[][] {
  const cls: number[][] = [];
  for (const v of [...vals].sort((a, b) => a - b)) {
    const ult = cls[cls.length - 1];
    if (ult && v - ult[ult.length - 1] <= gap) ult.push(v);
    else cls.push([v]);
  }
  return cls;
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Lê o cartão legado (25 questões, A–E, duas colunas) localizando a grade de bolhas
 * diretamente na imagem — o modelo não tem marcas de referência nos cantos.
 */
export async function lerCartaoLegacy(dataUrl: string): Promise<Leitura> {
  const n = LEGACY.questoes,
    alts = LEGACY.alternativas;
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    return erro(["Não foi possível abrir a imagem. Envie um arquivo JPG ou PNG válido."], n);
  }
  const W0 = img.naturalWidth,
    H0 = img.naturalHeight;
  if (Math.min(W0, H0) < 500)
    return erro(
      [
        `Resolução muito baixa (${W0}×${H0}px). Envie uma imagem com pelo menos 1000px no lado menor.`,
      ],
      n,
    );
  if (W0 > H0 * 1.1)
    return erro(
      ["A imagem está deitada (paisagem). Fotografe ou digitalize o cartão em pé (retrato)."],
      n,
    );

  const scale = Math.min(1, 1600 / Math.max(W0, H0));
  const W = Math.round(W0 * scale),
    H = Math.round(H0 * scale);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const gray = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4)
    gray[i] = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) | 0;

  const { thr, hist } = otsu(gray);
  const papel = percentil(hist, gray.length, 0.9);
  const tinta = percentil(hist, gray.length, 0.02);
  if (papel - tinta < 60)
    return erro(
      [
        "Contraste muito baixo: a imagem está escura, desbotada ou desfocada. Fotografe com boa iluminação e sem sombras.",
      ],
      n,
    );

  const dark = new Uint8Array(W * H);
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] < thr ? 1 : 0;
  const maxDim = Math.max(W, H);
  const aneis = componentesAneis(dark, W, H, maxDim * 0.006, maxDim * 0.025).filter(
    (b) => b.cy > H * 0.35, // a grade fica na metade inferior do cartão
  );

  const msgGrade = [
    "Não encontrei a grade de respostas do modelo Marista (25 questões, A–E). Verifique se o cartão está inteiro na imagem, em pé e sem cortes.",
  ];

  // Mantém só anéis com tamanho próximo da mediana (elimina letras do texto)
  const medW = mediana(aneis.map((b) => b.w));
  const bolhas = aneis.filter(
    (b) => b.w >= medW * 0.6 && b.w <= medW * 1.6 && b.h >= medW * 0.6 && b.h <= medW * 1.8,
  );

  // Linhas: escolhe a janela de 13 agrupamentos com o passo mais regular
  const linCands = agrupar(
    bolhas.map((b) => b.cy),
    medW * 1.6,
  )
    .map((c) => ({ centro: mediana(c), qtd: c.length }))
    .filter((c) => c.qtd >= 3)
    .sort((a, b) => a.centro - b.centro);
  let linGrid: number[] | null = null;
  let pitchYpx = 0;
  let melhorNota = -1;
  for (let s = 0; s + LEGACY.linhas <= linCands.length; s++) {
    const run = linCands.slice(s, s + LEGACY.linhas);
    const passos = run.slice(1).map((c, i) => c.centro - run[i].centro);
    const medP = mediana(passos);
    const bons = passos.filter((p) => Math.abs(p / medP - 1) < 0.18).length;
    const membros = run.reduce((t, c) => t + Math.min(c.qtd, 12), 0);
    const nota = bons * 100 + membros;
    if (bons >= 11 && nota > melhorNota) {
      melhorNota = nota;
      linGrid = run.map((c) => c.centro);
      pitchYpx = medP;
    }
  }
  if (!linGrid) return erro(msgGrade, n);

  // Colunas: o passo horizontal é fixo em relação ao vertical (geometria impressa do modelo)
  const pitchXpx = pitchYpx * (LEGACY.pitchX / LEGACY.pitchY);
  const offGrupo = pitchXpx * ((LEGACY.colX[1] - LEGACY.colX[0]) / LEGACY.pitchX);
  const yMin = linGrid[0] - pitchYpx * 0.6,
    yMax = linGrid[LEGACY.linhas - 1] + pitchYpx * 0.6;
  const naFaixa = bolhas.filter((b) => b.cy >= yMin && b.cy <= yMax);
  const xs = naFaixa.map((b) => b.cx);
  const xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  // Procura a origem da grade que maximiza a cobertura dos 130 pontos (13 linhas × 10 colunas).
  // Pontuar por ponto (e não por coluna) evita o deslocamento falso causado pelos números das
  // questões, cujos dígitos redondos ("0") imitam uma coluna de bolhas.
  let bestX0 = 0,
    bestOff = offGrupo,
    bestScore = -1;
  for (let x0 = xMin; x0 <= xMax - offGrupo - 4 * pitchXpx; x0 += pitchXpx / 10) {
    for (let f = 0.97; f <= 1.03; f += 0.015) {
      const off = offGrupo * f;
      let score = 0;
      const temAnel = (cx: number, ly: number) =>
        naFaixa.some(
          (b) => Math.abs(b.cx - cx) < pitchXpx * 0.3 && Math.abs(b.cy - ly) < pitchYpx * 0.3,
        );
      for (let g = 0; g < 2; g++)
        for (let k = 0; k < 5; k++) {
          const cx = x0 + k * pitchXpx + (g ? off : 0);
          for (const ly of linGrid) if (temAnel(cx, ly)) score++;
        }
      // Penaliza grades "deslocadas": a coluna falsa formada pelos números das questões
      // lê tinta (texto) em quase todas as linhas; uma coluna de bolhas de verdade só tem
      // marcações em algumas linhas.
      const fillLocal = (cx: number, ly: number) => {
        let esc = 0,
          tot = 0;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const px = Math.round(cx + dx),
              py = Math.round(ly + dy);
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            tot++;
            if (gray[py * W + px] < thr) esc++;
          }
        return tot ? esc / tot : 0;
      };
      for (let g = 0; g < 2; g++)
        for (let k = 0; k < 5; k++) {
          const cx = x0 + k * pitchXpx + (g ? off : 0);
          let altas = 0;
          for (const ly of linGrid) if (fillLocal(cx, ly) > 0.35) altas++;
          if (altas >= 10) score -= (altas - 9) * 3;
        }
      if (score > bestScore) {
        bestScore = score;
        bestX0 = x0;
        bestOff = off;
      }
    }
  }
  // Grade certa cobre ~105 dos 130 pontos (25 bolhas preenchidas não formam anel)
  if (bestScore < 70) return erro(msgGrade, n);
  // Refina cada coluna pela mediana dos anéis próximos
  const colGrid = [0, 1, 2, 3, 4]
    .map((k) => bestX0 + k * pitchXpx)
    .concat([0, 1, 2, 3, 4].map((k) => bestX0 + bestOff + k * pitchXpx))
    .map((cx) => {
      const perto = naFaixa.filter((b) => Math.abs(b.cx - cx) < pitchXpx * 0.3).map((b) => b.cx);
      return perto.length >= 3 ? mediana(perto) : cx;
    });
  // Confere cobertura: cada ponto da grade deve ter um anel próximo
  let cobertos = 0;
  for (const ly of linGrid)
    for (const cx of colGrid) {
      if (aneis.some((b) => Math.abs(b.cx - cx) < pitchXpx * 0.3 && Math.abs(b.cy - ly) < pitchYpx * 0.3))
        cobertos++;
    }

  // Mapa afim mm -> px a partir da grade ajustada (armazenado como homografia)
  const ptsMm: Pt[] = [];
  const ptsPx: Pt[] = [];
  for (let q = 0; q < n; q++)
    for (let a = 0; a < alts; a++) {
      ptsMm.push(bolhaLegacy(q, a));
      const col = q < LEGACY.linhas ? a : 5 + a;
      ptsPx.push([colGrid[col] / scale, linGrid[q % LEGACY.linhas] / scale]);
    }
  // Mínimos quadrados para x = a·X + b·Y + c ; y = d·X + e·Y + f
  const ajustarEixo = (get: (p: Pt) => number) => {
    let sx = 0,
      sy = 0,
      s1 = 0,
      sxx = 0,
      sxy = 0,
      syy = 0,
      su = 0,
      sxu = 0,
      syu = 0;
    for (let i = 0; i < ptsMm.length; i++) {
      const [x, y] = ptsMm[i];
      const u = get(ptsPx[i]);
      sx += x;
      sy += y;
      s1++;
      sxx += x * x;
      sxy += x * y;
      syy += y * y;
      su += u;
      sxu += x * u;
      syu += y * u;
    }
    const M = [
      [sxx, sxy, sx, sxu],
      [sxy, syy, sy, syu],
      [sx, sy, s1, su],
    ];
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c];
      for (let k = c; k <= 3; k++) M[c][k] /= d;
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = M[r][c];
        for (let k = c; k <= 3; k++) M[r][k] -= f * M[c][k];
      }
    }
    return [M[0][3], M[1][3], M[2][3]];
  };
  const [ax, bx, cx0] = ajustarEixo((p) => p[0]);
  const [ay, by, cy0] = ajustarEixo((p) => p[1]);
  const hAfim = [ax, bx, cx0, ay, by, cy0, 0, 0];
  const map = (p: Pt): Pt => {
    const [x, y] = aplicar(hAfim, p);
    return [x * scale, y * scale];
  };
  const pxmm = Math.hypot(...(map([106, 148]).map((v, i) => v - map([105, 148])[i]) as Pt));
  if (pxmm < 2)
    return erro(
      [
        `Resolução insuficiente para leitura confiável (${pxmm.toFixed(1)} px/mm). Aproxime a câmera ou digitalize com mais qualidade.`,
      ],
      n,
    );

  const corteTinta = papel * 0.6;
  const amostra = (ccx: number, ccy: number, rx: number, ry: number) => {
    let tot = 0,
      esc = 0;
    for (let y = Math.floor(ccy - ry); y <= ccy + ry; y++)
      for (let x = Math.floor(ccx - rx); x <= ccx + rx; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) {
          tot++;
          continue;
        }
        if (((x - ccx) / rx) ** 2 + ((y - ccy) / ry) ** 2 > 1) continue;
        tot++;
        if (gray[y * W + x] < corteTinta) esc++;
      }
    return tot ? esc / tot : 0;
  };

  // Métrica com subtração de anel e limiar local: o papel ao redor de cada bolha define o
  // corte de tinta, compensando sombras e iluminação irregular na foto.
  const R = LEGACY.r * pxmm;
  const fracEscura = (ccx: number, ccy: number, rIn: number, rOut: number, corte: number) => {
    let tot = 0,
      esc = 0;
    for (let y = Math.floor(ccy - rOut); y <= ccy + rOut; y++)
      for (let x = Math.floor(ccx - rOut); x <= ccx + rOut; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d2 = (x - ccx) ** 2 + (y - ccy) ** 2;
        if (d2 <= rIn * rIn || d2 > rOut * rOut) continue;
        tot++;
        if (gray[y * W + x] < corte) esc++;
      }
    return tot ? esc / tot : 0;
  };
  const metrica = (ccx: number, ccy: number) => {
    const papelVals: number[] = [];
    const anelVals: number[] = [];
    for (let y = Math.floor(ccy - R * 2.3); y <= ccy + R * 2.3; y++)
      for (let x = Math.floor(ccx - R * 2.3); x <= ccx + R * 2.3; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d2 = (x - ccx) ** 2 + (y - ccy) ** 2;
        const v = gray[y * W + x];
        if (d2 > R * R * 1.7 * 1.7 && d2 <= R * R * 2.3 * 2.3) papelVals.push(v);
        else if (d2 > R * R * 0.9 * 0.9 && d2 <= R * R * 1.4 * 1.4) anelVals.push(v);
      }
    const papelLoc = papelVals.length ? mediana(papelVals) : papel;
    // Tinta local: percentil baixo do contorno da bolha (sempre impresso)
    anelVals.sort((a, b) => a - b);
    const tintaLoc = anelVals.length
      ? anelVals[Math.floor(anelVals.length * 0.1)]
      : papelLoc * 0.4;
    // Corte adaptativo: meio caminho entre o papel e a tinta do contorno
    const corte = papelLoc - 0.45 * (papelLoc - tintaLoc);
    // Faixa entre a letra impressa (centro) e o contorno da bolha: em bolha vazia é papel,
    // em bolha preenchida a caneta cobre essa faixa.
    return fracEscura(ccx, ccy, R * 0.55, R * 0.85, corte);
  };
  const preenchimento: number[][] = [];
  const detectadas: number[] = [],
    confianca: number[] = [],
    revisar: boolean[] = [];
  for (let q = 0; q < n; q++) {
    const f: number[] = [];
    for (let a = 0; a < alts; a++) {
      const [x, y] = map(bolhaLegacy(q, a));
      f.push(metrica(x, y));
    }
    preenchimento.push(f.map((v) => Math.round(v * 100) / 100));
    const ordem = f.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const marcadas = ordem.filter((o) => o.v >= LIMIAR_MARCADA);
    const duvidas = ordem.filter((o) => o.v >= LIMIAR_DUVIDA && o.v < LIMIAR_MARCADA);
    if (marcadas.length > 1) {
      detectadas.push(-2);
      confianca.push(Math.min(1, marcadas[1].v / 0.8));
      revisar.push(true);
    } else if (marcadas.length === 1) {
      detectadas.push(marcadas[0].i);
      const segundo = ordem[1]?.v ?? 0;
      const c = Math.max(0, Math.min(1, (marcadas[0].v - segundo) / 0.5));
      confianca.push(c);
      revisar.push(duvidas.length > 0 || c < 0.5);
    } else if (duvidas.length) {
      detectadas.push(duvidas[0].i);
      confianca.push(0.3);
      revisar.push(true);
    } else {
      detectadas.push(-1);
      confianca.push(Math.max(0, Math.min(1, 1 - (ordem[0]?.v ?? 0) / LIMIAR_DUVIDA)));
      revisar.push(true);
    }
  }
  const mensagens: string[] = [
    "Cartão no modelo Marista lido pela grade de bolhas (sem marcas de referência). Confira a sobreposição na imagem antes de finalizar.",
  ];
  const nRev = revisar.filter(Boolean).length;
  if (nRev)
    mensagens.push(
      `${nRev} ${nRev === 1 ? "questão precisa" : "questões precisam"} de revisão (em branco, múltipla ou marcação pouco nítida).`,
    );
  return {
    status: nRev ? "revisar" : "ok",
    mensagens,
    detectadas,
    preenchimento,
    confianca,
    revisar,
    confiancaGeral: confianca.reduce((s, c) => s + c, 0) / Math.max(1, n),
    homografia: hAfim,
    lidoEm: Date.now(),
  };
}
