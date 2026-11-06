import { updateDb, uid, type Prova } from "./db";

export function novaProva(): string {
  const id = uid();
  const hoje = new Date();
  const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const p: Prova = {
    id,
    nome: "",
    turma: "",
    disciplina: "",
    data,
    numAlternativas: 5,
    questoes: Array.from({ length: 10 }, () => ({ peso: 1, gabarito: null, habilidades: [] })),
    habilidades: [],
    status: "rascunho",
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
  };
  updateDb((d) => ({ ...d, provas: [...d.provas, p] }), "Nova prova criada (rascunho)");
  return id;
}
