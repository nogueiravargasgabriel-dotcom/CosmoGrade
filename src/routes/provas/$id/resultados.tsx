import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/lib/db";
import { corrigir, fmtNum, fmtPct, nivelHabilidade } from "@/lib/grading";
import { exportarExcel } from "@/lib/excel";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/provas/$id/resultados")({
  head: () => ({
    meta: [
      { title: "Resultados da turma — CosmoGrade" },
      { name: "description", content: "Notas, desempenho por habilidade e exportação para Excel." },
      { property: "og:title", content: "Resultados da turma — CosmoGrade" },
      {
        property: "og:description",
        content: "Notas, desempenho por habilidade e exportação para Excel.",
      },
    ],
  }),
  component: Resultados,
});

const corNivel = { reforco: "text-destructive", atencao: "text-warning", adequado: "text-success" };

function Resultados() {
  const { id } = Route.useParams();
  const { db } = useDb();
  const [exp, setExp] = useState(false);
  const prova = db.provas.find((p) => p.id === id);
  if (!prova) return <Vazio>Prova não encontrada.</Vazio>;
  const todos = db.cartoes.filter((c) => c.provaId === id);
  const linhas = todos
    .filter((c) => c.finalizado && c.respostas && c.estudanteId)
    .map((c) => ({
      c,
      e: db.estudantes.find((e) => e.id === c.estudanteId)!,
      r: corrigir(prova, c.respostas!),
    }))
    .filter((x) => x.e)
    .sort((a, b) => a.e.nome.localeCompare(b.e.nome, "pt-BR"));
  const pendentes = todos.length - linhas.length;

  const habTurma = prova.habilidades
    .map((h) => {
      let ac = 0,
        tot = 0;
      for (const l of linhas) {
        const hr = l.r.habilidades.find((x) => x.id === h.id);
        if (hr) {
          ac += hr.acertos;
          tot += hr.total;
        }
      }
      return { h, ac, tot, pct: tot ? ac / tot : 0 };
    })
    .filter((x) => x.tot > 0);
  const media = linhas.length ? linhas.reduce((s, l) => s + l.r.nota, 0) / linhas.length : 0;

  const excel = async () => {
    setExp(true);
    try {
      const n = await exportarExcel(prova, db.cartoes, db.estudantes);
      toast.success(`Planilha gerada com ${n} estudante(s).`);
    } catch (e) {
      toast.error(`Falha ao gerar planilha: ${(e as Error).message}`);
    } finally {
      setExp(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Resultados da turma"
        desc={`${prova.nome} · ${prova.turma} · ${prova.disciplina}`}
      >
        <Button asChild variant="outline">
          <Link to="/provas/$id/correcao" params={{ id }}>
            Correção
          </Link>
        </Button>
        <Button asChild variant="outline" disabled={!linhas.length}>
          <Link to="/provas/$id/relatorios" params={{ id }}>
            <FileImage className="h-4 w-4" /> Relatórios individuais
          </Link>
        </Button>
        <Button onClick={excel} disabled={!linhas.length || exp}>
          {exp ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}{" "}
          Exportar Excel
        </Button>
      </PageHeader>
      {pendentes > 0 && (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {pendentes} cartão(ões) ainda não finalizado(s) — não aparecem nos resultados nem na
          planilha.
        </p>
      )}
      {linhas.length === 0 ? (
        <Vazio>Nenhuma correção finalizada nesta prova ainda.</Vazio>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-sm text-muted-foreground">Estudantes corrigidos</div>
              <div className="font-display text-3xl font-bold">{linhas.length}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-sm text-muted-foreground">Média da turma</div>
              <div className="font-display text-3xl font-bold">
                {fmtNum(media)}{" "}
                <span className="text-base text-muted-foreground">
                  / {fmtNum(linhas[0].r.notaMax)}
                </span>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-sm text-muted-foreground">Habilidades avaliadas</div>
              <div className="font-display text-3xl font-bold">{habTurma.length}</div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Estudante</th>
                  <th className="p-3">Nota</th>
                  <th className="p-3">Aproveitamento</th>
                  <th className="p-3">Acertos</th>
                  <th className="p-3">Erros</th>
                  <th className="p-3">Em branco</th>
                  <th className="p-3">Múltiplas</th>
                  <th className="p-3">Habilidades para reforço</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, e, r }) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-3 font-semibold">{e.nome}</td>
                    <td className="p-3">
                      {fmtNum(r.nota)} / {fmtNum(r.notaMax)}
                    </td>
                    <td className="p-3">{fmtPct(r.pct)}</td>
                    <td className="p-3 text-success">{r.acertos}</td>
                    <td className="p-3 text-destructive">{r.erros}</td>
                    <td className="p-3">{r.brancos}</td>
                    <td className="p-3">{r.multiplas}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.habilidades
                        .filter((h) => h.nivel === "reforco")
                        .map((h) => `${h.nome} (${fmtPct(h.pct)})`)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="mb-3 mt-8 text-lg font-bold">Desempenho da turma por habilidade</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {habTurma.map(({ h, ac, tot, pct }) => {
              const nv = nivelHabilidade(pct);
              return (
                <div key={h.id} className="rounded-xl border bg-card p-4">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{h.nome}</span>
                    <span className={`font-bold ${corNivel[nv]}`}>{fmtPct(pct)}</span>
                  </div>
                  {h.descricao && <p className="text-xs text-muted-foreground">{h.descricao}</p>}
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ac} acertos em {tot} respostas da turma
                    {nv === "reforco"
                      ? " · merece atenção (abaixo de 50%)"
                      : nv === "atencao"
                        ? " · entre 50% e 70%"
                        : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
