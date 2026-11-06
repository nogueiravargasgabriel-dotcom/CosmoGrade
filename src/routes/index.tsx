import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, FileText, Users, ScanLine, CheckCircle2 } from "lucide-react";
import { useDb } from "@/lib/db";
import { fmtData } from "@/lib/grading";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { novaProva } from "@/lib/provas";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — CosmoGrade" },
      {
        name: "description",
        content: "Visão geral das provas, correções e ações recentes no CosmoGrade.",
      },
      { property: "og:title", content: "Painel — CosmoGrade" },
      {
        property: "og:description",
        content: "Visão geral das provas, correções e ações recentes no CosmoGrade.",
      },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { db } = useDb();
  const nav = useNavigate();
  const finalizados = db.cartoes.filter((c) => c.finalizado).length;
  const pendentes = db.cartoes.filter((c) => !c.finalizado).length;
  const stats = [
    { label: "Provas", v: db.provas.length, icon: FileText },
    { label: "Estudantes", v: db.estudantes.length, icon: Users },
    { label: "Cartões em revisão", v: pendentes, icon: ScanLine },
    { label: "Correções finalizadas", v: finalizados, icon: CheckCircle2 },
  ];
  const provas = [...db.provas].sort((a, b) => b.atualizadoEm - a.atualizadoEm).slice(0, 6);
  return (
    <>
      <PageHeader title="Painel" desc="Acompanhe suas provas e correções.">
        <Button onClick={() => nav({ to: "/provas/$id", params: { id: novaProva() } })}>
          <FilePlus2 className="h-4 w-4" /> Nova prova
        </Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <s.icon className="h-5 w-5 text-primary" />
            <div className="mt-2 font-display text-3xl font-bold">{s.v}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Provas recentes</h2>
          {provas.length === 0 ? (
            <Vazio>
              Nenhuma prova cadastrada ainda. Comece criando uma prova com questões, gabarito e
              habilidades.
            </Vazio>
          ) : (
            <div className="space-y-2">
              {provas.map((p) => {
                const cs = db.cartoes.filter((c) => c.provaId === p.id);
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{p.nome || "Prova sem nome"}</div>
                      <div className="text-sm text-muted-foreground">
                        {p.turma || "—"} · {p.disciplina || "—"} · {fmtData(p.data)} ·{" "}
                        {cs.filter((c) => c.finalizado).length}/{cs.length} cartões finalizados
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${p.status === "pronta" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"}`}
                    >
                      {p.status === "pronta" ? "Pronta" : "Rascunho"}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/provas/$id" params={{ id: p.id }}>
                        Editar
                      </Link>
                    </Button>
                    {p.status === "pronta" && (
                      <Button asChild size="sm">
                        <Link to="/provas/$id/correcao" params={{ id: p.id }}>
                          Corrigir
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Ações recentes</h2>
          {db.atividades.length === 0 ? (
            <Vazio>Sem atividades ainda.</Vazio>
          ) : (
            <ul className="space-y-2 rounded-xl border bg-card p-4 text-sm">
              {db.atividades.slice(0, 12).map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{a.texto}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(a.em).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
