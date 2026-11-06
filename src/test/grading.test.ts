import { describe, expect, it } from "vitest";
import { corrigir, validarProva, nivelHabilidade } from "@/lib/grading";
import { homografia, aplicar } from "@/lib/omr";
import type { Prova } from "@/lib/db";

const prova: Prova = {
  id: "p",
  nome: "T",
  turma: "7A",
  disciplina: "Mat",
  data: "2026-11-05",
  numAlternativas: 4,
  status: "pronta",
  criadoEm: 0,
  atualizadoEm: 0,
  habilidades: [
    { id: "f", nome: "Frações", descricao: "" },
    { id: "g", nome: "Geometria", descricao: "" },
  ],
  questoes: [
    { peso: 2, gabarito: 0, habilidades: ["f"] },
    { peso: 1, gabarito: 1, habilidades: ["f", "g"] },
    { peso: 1, gabarito: 2, habilidades: ["g"] },
    { peso: 1, gabarito: 3, habilidades: ["f"] },
  ],
};

describe("correção", () => {
  it("soma pesos só das questões certas; múltipla e branco valem zero", () => {
    const r = corrigir(prova, [0, -2, -1, 0]);
    expect(r.nota).toBe(2);
    expect(r.notaMax).toBe(5);
    expect([r.acertos, r.erros, r.brancos, r.multiplas]).toEqual([1, 1, 1, 1]);
  });
  it("calcula habilidade por questões associadas e recomenda as fracas", () => {
    const r = corrigir(prova, [0, -2, -1, 0]);
    const f = r.habilidades.find((h) => h.id === "f")!;
    expect([f.acertos, f.total]).toEqual([1, 3]);
    expect(r.recomendacoes[0]).toContain("Geometria: 0 acertos em 2 questões");
  });
  it("níveis: <50% reforço, <70% atenção", () => {
    expect(nivelHabilidade(0.49)).toBe("reforco");
    expect(nivelHabilidade(0.69)).toBe("atencao");
    expect(nivelHabilidade(0.7)).toBe("adequado");
  });
  it("valida questão sem gabarito ou sem habilidade", () => {
    const e = validarProva({ ...prova, questoes: [{ peso: 1, gabarito: null, habilidades: [] }] });
    expect(e).toContain("Questão 1: sem resposta correta.");
    expect(e).toContain("Questão 1: sem habilidade associada.");
  });
  it("homografia mapeia os cantos corretamente", () => {
    const h = homografia(
      [
        [0, 0],
        [10, 0],
        [0, 10],
        [10, 10],
      ],
      [
        [5, 5],
        [25, 7],
        [3, 30],
        [27, 33],
      ],
    );
    const [x, y] = aplicar(h, [10, 10]);
    expect(x).toBeCloseTo(27);
    expect(y).toBeCloseTo(33);
  });
});
