import type { Cartao, Estudante, Prova } from "./db";
import { corrigir, fmtData, letra } from "./grading";
import { baixarBlob, nomeArquivo } from "./report";

const SIT: Record<string, string> = {
  certo: "Certo",
  errado: "Errado",
  branco: "Em branco",
  multipla: "Revisão manual",
};

export async function exportarExcel(prova: Prova, cartoes: Cartao[], estudantes: Estudante[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Resultados", { views: [{ state: "frozen", ySplit: 1 }] });
  const header = [
    "Nome",
    "Turma",
    "Prova",
    "Data",
    "Nota final",
    "Nota máxima",
    "Acertos",
    "Erros",
    "Em branco",
    "Marcação múltipla",
  ];
  prova.habilidades.forEach((h) => header.push(`${h.nome} (%)`));
  prova.questoes.forEach((_, i) => header.push(`Q${i + 1} resposta`, `Q${i + 1} situação`));
  ws.addRow(header);

  const linhas = cartoes
    .filter((c) => c.provaId === prova.id && c.finalizado && c.respostas && c.estudanteId)
    .map((c) => ({ c, e: estudantes.find((e) => e.id === c.estudanteId) }))
    .filter((x) => x.e)
    .sort((a, b) => a.e!.nome.localeCompare(b.e!.nome, "pt-BR"));

  for (const { c, e } of linhas) {
    const r = corrigir(prova, c.respostas!);
    const row: (string | number | null)[] = [
      e!.nome,
      e!.turma,
      prova.nome,
      fmtData(prova.data),
      r.nota,
      r.notaMax,
      r.acertos,
      r.erros,
      r.brancos,
      r.multiplas,
    ];
    prova.habilidades.forEach((h) => {
      const hr = r.habilidades.find((x) => x.id === h.id);
      row.push(hr ? hr.pct : null);
    });
    r.itens.forEach((it, i) => {
      const alterada = c.alteracoes.some((a) => a.questao === i);
      row.push(it.resposta === -1 ? "—" : it.resposta === -2 ? "Múltipla" : letra(it.resposta));
      row.push(SIT[it.situacao] + (alterada ? " (corrigida pelo professor)" : ""));
    });
    ws.addRow(row);
  }

  const hRow = ws.getRow(1);
  hRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141022" } };
  hRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  hRow.height = 32;
  ws.columns.forEach((col, i) => {
    col.width = i === 0 ? 32 : i < 4 ? 16 : 14;
    if (i >= 10 && i < 10 + prova.habilidades.length) col.numFmt = "0.0%";
    if (i === 4 || i === 5) col.numFmt = "0.##";
  });
  ws.eachRow((row, n) => {
    if (n > 1) row.font = { name: "Arial" };
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, linhas.length + 1), column: header.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `resultados-${nomeArquivo(prova.nome)}.xlsx`,
  );
  return linhas.length;
}
