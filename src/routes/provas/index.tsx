import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, Trash2, Printer, ScanLine, BarChart3, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useDb, excluirProva } from "@/lib/db";
import { fmtData } from "@/lib/grading";
import { novaProva } from "@/lib/provas";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Confirmar } from "@/components/Confirmar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/provas/")({
  head: () => ({
    meta: [
      { title: "Provas — CosmoGrade" },
      {
        name: "description",
        content: "Lista de provas cadastradas, com cartões-resposta, correção e resultados.",
      },
      { property: "og:title", content: "Provas — CosmoGrade" },
      {
        property: "og:description",
        content: "Lista de provas cadastradas, com cartões-resposta, correção e resultados.",
      },
    ],
  }),
  component: Provas,
});

function Provas() {
  const { db } = useDb();
  const nav = useNavigate();
  const provas = [...db.provas].sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  return (
    <>
      <PageHeader title="Provas" desc="Cadastre provas, imprima cartões e corrija.">
        <Button onClick={() => nav({ to: "/provas/$id", params: { id: novaProva() } })}>
          <FilePlus2 className="h-4 w-4" /> Nova prova
        </Button>
      </PageHeader>
      {provas.length === 0 ? (
        <Vazio>Nenhuma prova cadastrada. Clique em “Nova prova” para começar.</Vazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {provas.map((p) => {
            const cs = db.cartoes.filter((c) => c.provaId === p.id);
            const pronta = p.status === "pronta";
            return (
              <div key={p.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-sans text-lg font-bold">{p.nome || "Prova sem nome"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {p.turma || "—"} · {p.disciplina || "—"} · {fmtData(p.data)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.questoes.length} questões · {p.numAlternativas} alternativas ·{" "}
                      {p.habilidades.length} habilidades · {cs.length} cartões
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${pronta ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"}`}
                  >
                    {pronta ? "Pronta" : "Rascunho"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/provas/$id" params={{ id: p.id }}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Link>
                  </Button>
                  {pronta ? (
                    <>
                      {p.modelo !== "marista25" && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/provas/$id/cartao" params={{ id: p.id }}>
                            <Printer className="h-4 w-4" /> Cartão
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm">
                        <Link to="/provas/$id/correcao" params={{ id: p.id }}>
                          <ScanLine className="h-4 w-4" /> Correção
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/provas/$id/resultados" params={{ id: p.id }}>
                          <BarChart3 className="h-4 w-4" /> Resultados
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <span className="self-center text-xs text-muted-foreground">
                      Finalize o cadastro para imprimir o cartão e corrigir.
                    </span>
                  )}
                  <Confirmar
                    titulo="Excluir prova?"
                    descricao={`A prova “${p.nome || "sem nome"}” e seus ${cs.length} cartões e resultados serão excluídos definitivamente.`}
                    onConfirm={async () => {
                      await excluirProva(p.id);
                      toast.success("Prova excluída.");
                    }}
                  >
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Confirmar>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
