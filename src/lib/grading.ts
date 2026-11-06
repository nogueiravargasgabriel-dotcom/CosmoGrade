import type { Prova } from "./db";

export const letra = (i: number) => String.fromCharCode(65 + i);
export const textoResposta = (r: number | undefined) =>
  r === undefined || r === -1 ? "Em branco" : r === -2 ? "Múltipla" : letra(r);

export type SituacaoQuestao = "certo" | "errado" | "branco" | "multipla";
export type ResultadoHabilidade = {
  id: string;
  nome: string;
  descricao: string;
  acertos: number;
  total: number;
  pct: number;
  nivel: "reforco" | "atencao" | "adequado";
};
export type Resultado = {
  itens: { resposta: number; gabarito: number | null; situacao: SituacaoQuestao; peso: number }[];
  acertos: number;
  erros: number;
  brancos: number;
  multiplas: number;
  nota: number;
  notaMax: number;
  pct: number;
  habilidades: ResultadoHabilidade[];
  recomendacoes: string[];
};

export const fmtPct = (p: number) =>
  `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Regras: <50% = reforço, 50% a <70% = atenção, >=70% = adequado */
export function nivelHabilidade(pct: number): ResultadoHabilidade["nivel"] {
  if (pct < 0.5) return "reforco";
  if (pct < 0.7) return "atencao";
  return "adequado";
}

export function corrigir(prova: Prova, respostas: number[]): Resultado {
  const itens = prova.questoes.map((q, i) => {
    const r = respostas[i] ?? -1;
    const situacao: SituacaoQuestao =
      r === -1 ? "branco" : r === -2 ? "multipla" : r === q.gabarito ? "certo" : "errado";
    return { resposta: r, gabarito: q.gabarito, situacao, peso: q.peso };
  });
  const acertos = itens.filter((i) => i.situacao === "certo").length;
  const erros = itens.filter((i) => i.situacao === "errado").length;
  const brancos = itens.filter((i) => i.situacao === "branco").length;
  const multiplas = itens.filter((i) => i.situacao === "multipla").length;
  const nota = itens.reduce((s, i) => s + (i.situacao === "certo" ? i.peso : 0), 0);
  const notaMax = itens.reduce((s, i) => s + i.peso, 0);

  const habilidades = prova.habilidades
    .map((h) => {
      const qs = prova.questoes
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.habilidades.includes(h.id));
      const ac = qs.filter(({ i }) => itens[i].situacao === "certo").length;
      const pct = qs.length ? ac / qs.length : 0;
      return {
        id: h.id,
        nome: h.nome,
        descricao: h.descricao,
        acertos: ac,
        total: qs.length,
        pct,
        nivel: nivelHabilidade(pct),
      };
    })
    .filter((h) => h.total > 0);

  const recomendacoes = habilidades
    .filter((h) => h.nivel !== "adequado")
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5)
    .map(
      (h) =>
        `${h.nivel === "reforco" ? "Revisar" : "Praticar mais"} ${h.nome}: ${h.acertos} acerto${h.acertos === 1 ? "" : "s"} em ${h.total} ${h.total === 1 ? "questão" : "questões"} (${fmtPct(h.pct)})${h.total === 1 ? " — baseado em uma única questão" : ""}.`,
    );

  return {
    itens,
    acertos,
    erros,
    brancos,
    multiplas,
    nota,
    notaMax,
    pct: notaMax ? nota / notaMax : 0,
    habilidades,
    recomendacoes,
  };
}

export function validarProva(p: Prova): string[] {
  const erros: string[] = [];
  if (!p.nome.trim()) erros.push("Informe o nome da prova.");
  if (!p.turma.trim()) erros.push("Informe a turma.");
  if (!p.disciplina.trim()) erros.push("Informe a disciplina.");
  if (!p.data) erros.push("Informe a data.");
  if (p.questoes.length === 0) erros.push("Adicione pelo menos uma questão.");
  if (p.habilidades.length === 0) erros.push("Cadastre pelo menos uma habilidade.");
  p.questoes.forEach((q, i) => {
    if (q.gabarito === null || q.gabarito >= p.numAlternativas)
      erros.push(`Questão ${i + 1}: sem resposta correta.`);
    if (q.habilidades.length === 0) erros.push(`Questão ${i + 1}: sem habilidade associada.`);
    if (!(q.peso > 0)) erros.push(`Questão ${i + 1}: o peso deve ser maior que zero.`);
  });
  return erros;
}

export const fmtData = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
