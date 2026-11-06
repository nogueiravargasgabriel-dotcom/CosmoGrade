import type { Estudante, Prova } from "./db";
import { type Resultado, fmtData, fmtNum, fmtPct } from "./grading";

// Relatório para impressão: paleta clara fixa (papel), com acentos da identidade.
const C = {
  ink: "#14102a",
  muted: "#5a5670",
  line: "#d9d6e6",
  band: "#0A0616",
  cyan: "#2EE5FF",
  cyanDark: "#0b8fa3",
  red: "#c2410c",
  amber: "#b45309",
  green: "#15803d",
  soft: "#f4f3f9",
};
const W = 1654,
  H = 2339; // A4 a 200 dpi

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function desenharRelatorio(
  prova: Prova,
  est: Estudante,
  r: Resultado,
): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load("700 40px Orbitron"),
    document.fonts.load("400 30px 'Space Grotesk'"),
    document.fonts.load("700 30px 'Space Grotesk'"),
  ]).catch(() => undefined);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const sg = (w: number, s: number) => `${w} ${s}px 'Space Grotesk', Arial, sans-serif`;
  const orb = (s: number) => `700 ${s}px Orbitron, Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Cabeçalho
  ctx.fillStyle = C.band;
  ctx.fillRect(0, 0, W, 170);
  ctx.fillStyle = C.cyan;
  ctx.font = orb(52);
  ctx.fillText("CosmoGrade", 90, 105);
  ctx.fillStyle = "#cfd3ff";
  ctx.font = sg(400, 28);
  ctx.textAlign = "right";
  ctx.fillText("Relatório individual de desempenho", W - 90, 92);
  ctx.textAlign = "left";
  ctx.fillStyle = C.cyan;
  ctx.fillRect(0, 170, W, 6);

  // Identificação
  let y = 270;
  ctx.fillStyle = C.ink;
  ctx.font = sg(700, 56);
  ctx.fillText(est.nome, 90, y);
  y += 60;
  ctx.font = sg(400, 30);
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `Turma: ${est.turma || prova.turma}   ·   ${prova.disciplina}   ·   ${fmtData(prova.data)}`,
    90,
    y,
  );
  y += 46;
  ctx.fillStyle = C.ink;
  ctx.font = sg(700, 32);
  ctx.fillText(prova.nome, 90, y);

  // Nota
  y += 50;
  ctx.fillStyle = C.soft;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(90, y, W - 180, 260, 24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = sg(400, 28);
  ctx.fillText("NOTA FINAL", 140, y + 70);
  ctx.fillStyle = C.ink;
  ctx.font = sg(700, 110);
  ctx.fillText(fmtNum(r.nota), 140, y + 190);
  const nw = ctx.measureText(fmtNum(r.nota)).width;
  ctx.font = sg(400, 40);
  ctx.fillStyle = C.muted;
  ctx.fillText(` / ${fmtNum(r.notaMax)}  (${fmtPct(r.pct)})`, 150 + nw, y + 190);
  const stats: [string, number, string][] = [
    ["Acertos", r.acertos, C.green],
    ["Erros", r.erros, C.red],
    ["Em branco", r.brancos, C.muted],
    ["Marcação múltipla", r.multiplas, C.amber],
  ];
  stats.forEach(([lab, v, cor], i) => {
    const x = 860 + (i % 2) * 330,
      yy = y + 90 + Math.floor(i / 2) * 110;
    ctx.fillStyle = cor;
    ctx.font = sg(700, 52);
    ctx.fillText(String(v), x, yy + 20);
    ctx.fillStyle = C.muted;
    ctx.font = sg(400, 24);
    ctx.fillText(lab, x, yy + 56);
  });

  // Habilidades
  y += 340;
  ctx.fillStyle = C.ink;
  ctx.font = orb(34);
  ctx.fillText("Desempenho por habilidade", 90, y);
  y += 24;
  ctx.fillStyle = C.cyanDark;
  ctx.fillRect(90, y, 120, 5);
  y += 50;
  const barX = 760,
    barW = 620;
  const habs = r.habilidades.slice(0, 14);
  for (const h of habs) {
    ctx.fillStyle = C.ink;
    ctx.font = sg(700, 28);
    const nome = wrap(ctx, h.nome, 620)[0];
    ctx.fillText(nome, 90, y + 10);
    ctx.fillStyle = C.muted;
    ctx.font = sg(400, 22);
    ctx.fillText(
      `${h.acertos} de ${h.total} ${h.total === 1 ? "questão" : "questões"}`,
      90,
      y + 44,
    );
    ctx.fillStyle = "#ebe9f3";
    ctx.beginPath();
    ctx.roundRect(barX, y - 14, barW, 34, 17);
    ctx.fill();
    const cor = h.nivel === "reforco" ? C.red : h.nivel === "atencao" ? C.amber : C.green;
    if (h.pct > 0) {
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.roundRect(barX, y - 14, Math.max(34, barW * h.pct), 34, 17);
      ctx.fill();
    }
    ctx.fillStyle = C.ink;
    ctx.font = sg(700, 30);
    ctx.textAlign = "right";
    ctx.fillText(fmtPct(h.pct), W - 90, y + 12);
    ctx.textAlign = "left";
    y += 92;
  }
  if (r.habilidades.length > habs.length) {
    ctx.fillStyle = C.muted;
    ctx.font = sg(400, 22);
    ctx.fillText(
      `+ ${r.habilidades.length - habs.length} habilidade(s) na planilha da turma.`,
      90,
      y,
    );
    y += 40;
  }
  ctx.fillStyle = C.muted;
  ctx.font = sg(400, 20);
  ctx.fillText("Legenda: verde ≥ 70% · âmbar de 50% a 69,9% · vermelho abaixo de 50%", 90, y);
  y += 60;

  // Reforço e recomendações
  ctx.fillStyle = C.ink;
  ctx.font = orb(34);
  ctx.fillText("Pontos para reforço", 90, y);
  y += 24;
  ctx.fillStyle = C.cyanDark;
  ctx.fillRect(90, y, 120, 5);
  y += 56;
  ctx.font = sg(400, 28);
  const recs = r.recomendacoes.length
    ? r.recomendacoes
    : [
        "Nenhuma habilidade ficou abaixo de 70% nesta prova. Continue praticando para manter o bom desempenho.",
      ];
  for (const rec of recs) {
    if (y > H - 200) break;
    const lines = wrap(ctx, rec, W - 240);
    ctx.fillStyle = C.cyanDark;
    ctx.beginPath();
    ctx.arc(110, y - 9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    lines.forEach((l, i) => ctx.fillText(l, 140, y + i * 38));
    y += lines.length * 38 + 18;
  }

  // Rodapé
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(90, H - 120);
  ctx.lineTo(W - 90, H - 120);
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = sg(400, 20);
  ctx.fillText(
    "Recomendações geradas a partir das questões desta prova associadas a cada habilidade.",
    90,
    H - 80,
  );
  ctx.fillText(
    `Documento individual e confidencial · Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    90,
    H - 50,
  );
  return cv;
}

export const canvasParaBlob = (cv: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar JPEG"))), "image/jpeg", 0.92),
  );

export const nomeArquivo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
