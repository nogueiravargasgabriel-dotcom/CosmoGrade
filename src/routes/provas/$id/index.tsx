import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Save, CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import { toast } from "sonner";
import { useDb, updateDb, uid, type Prova } from "@/lib/db";
import { letra, validarProva } from "@/lib/grading";
import { maxQuestoes } from "@/lib/cardLayout";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/provas/$id/")({
  head: () => ({
    meta: [
      { title: "Editar prova — CosmoGrade" },
      { name: "description", content: "Defina questões, gabarito, pesos e habilidades avaliadas." },
      { property: "og:title", content: "Editar prova — CosmoGrade" },
      {
        property: "og:description",
        content: "Defina questões, gabarito, pesos e habilidades avaliadas.",
      },
    ],
  }),
  component: EditorWrapper,
});

function EditorWrapper() {
  const { id } = Route.useParams();
  const { db } = useDb();
  const prova = db.provas.find((p) => p.id === id);
  if (!prova)
    return (
      <Vazio>
        Prova não encontrada.{" "}
        <Link to="/provas" className="text-primary underline">
          Voltar
        </Link>
      </Vazio>
    );
  return <Editor key={id} inicial={prova} temCartoes={db.cartoes.some((c) => c.provaId === id)} />;
}

function Editor({ inicial, temCartoes }: { inicial: Prova; temCartoes: boolean }) {
  const [p, setP] = useState<Prova>(inicial);
  const [nh, setNh] = useState({ nome: "", descricao: "" });
  const [tentou, setTentou] = useState(false);
  const erros = validarProva(p);
  const max = maxQuestoes(p.numAlternativas);
  const set = (patch: Partial<Prova>) => setP((x) => ({ ...x, ...patch }));
  const setQ = (i: number, patch: Partial<Prova["questoes"][number]>) =>
    setP((x) => ({ ...x, questoes: x.questoes.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));

  const setNum = (n: number) => {
    n = Math.max(1, Math.min(max, n || 1));
    setP((x) => ({
      ...x,
      questoes:
        n > x.questoes.length
          ? [
              ...x.questoes,
              ...Array.from({ length: n - x.questoes.length }, () => ({
                peso: 1,
                gabarito: null,
                habilidades: [],
              })),
            ]
          : x.questoes.slice(0, n),
    }));
  };
  const setAlts = (a: number) =>
    setP((x) => ({
      ...x,
      numAlternativas: a,
      questoes: x.questoes.slice(0, maxQuestoes(a)).map((q) => ({
        ...q,
        gabarito: q.gabarito !== null && q.gabarito >= a ? null : q.gabarito,
      })),
    }));

  const legado = p.modelo === "marista25";
  const setModelo = (m: "cosmograde" | "marista25") =>
    setP((x) => {
      if (m === "marista25") {
        const qs =
          x.questoes.length >= 25
            ? x.questoes.slice(0, 25)
            : [
                ...x.questoes,
                ...Array.from({ length: 25 - x.questoes.length }, () => ({
                  peso: 1,
                  gabarito: null,
                  habilidades: [],
                })),
              ];
        return {
          ...x,
          modelo: m,
          numAlternativas: 5,
          questoes: qs.map((q) => ({
            ...q,
            gabarito: q.gabarito !== null && q.gabarito >= 5 ? null : q.gabarito,
          })),
        };
      }
      return { ...x, modelo: m };
    });

  const salvar = (status: Prova["status"]) => {
    if (status === "pronta" && erros.length) {
      setTentou(true);
      toast.error("Corrija as pendências antes de marcar como pronta.");
      return;
    }
    const final = { ...p, status, atualizadoEm: Date.now() };
    updateDb(
      (d) => ({ ...d, provas: d.provas.map((x) => (x.id === p.id ? final : x)) }),
      `Prova “${p.nome || "sem nome"}” salva como ${status === "pronta" ? "pronta" : "rascunho"}`,
    );
    setP(final);
    toast.success(
      status === "pronta"
        ? "Prova pronta! Já é possível imprimir o cartão e corrigir."
        : "Rascunho salvo.",
    );
  };

  const addHab = () => {
    if (!nh.nome.trim()) return toast.error("Informe o nome da habilidade.");
    set({
      habilidades: [
        ...p.habilidades,
        { id: uid(), nome: nh.nome.trim(), descricao: nh.descricao.trim() },
      ],
    });
    setNh({ nome: "", descricao: "" });
  };

  return (
    <>
      <PageHeader
        title={p.nome || "Nova prova"}
        desc={
          p.status === "pronta"
            ? "Prova pronta para correção."
            : "Rascunho — salve quando quiser e continue depois."
        }
      >
        <Button variant="outline" onClick={() => salvar("rascunho")}>
          <Save className="h-4 w-4" /> Salvar rascunho
        </Button>
        <Button onClick={() => salvar("pronta")}>
          <CheckCircle2 className="h-4 w-4" /> Salvar e marcar como pronta
        </Button>
        {inicial.status === "pronta" && !legado && (
          <Button asChild variant="outline">
            <Link to="/provas/$id/cartao" params={{ id: p.id }}>
              <Printer className="h-4 w-4" /> Cartão
            </Link>
          </Button>
        )}
      </PageHeader>

      {tentou && erros.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" /> Pendências ({erros.length})
          </div>
          <ul className="list-inside list-disc text-foreground/90">
            {erros.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {erros.length > 12 && <li>… e mais {erros.length - 12}</li>}
          </ul>
        </div>
      )}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-lg font-bold">Dados da prova</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-3">
            <Label>Nome da prova</Label>
            <Input
              value={p.nome}
              onChange={(e) => set({ nome: e.target.value })}
              placeholder="Ex.: Avaliação bimestral de Matemática"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Turma</Label>
            <Input
              value={p.turma}
              onChange={(e) => set({ turma: e.target.value })}
              placeholder="Ex.: 7º A"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Disciplina</Label>
            <Input value={p.disciplina} onChange={(e) => set({ disciplina: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={p.data} onChange={(e) => set({ data: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label>Modelo do cartão-resposta</Label>
            <select
              disabled={temCartoes}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={p.modelo ?? "cosmograde"}
              onChange={(e) => setModelo(e.target.value as "cosmograde" | "marista25")}
            >
              <option value="cosmograde">Cartão CosmoGrade (impresso pelo app)</option>
              <option value="marista25">
                Cartão Marista já impresso (25 questões, A–E, duas colunas)
              </option>
            </select>
            {legado && (
              <p className="text-xs text-muted-foreground">
                O modelo Marista tem 25 questões e 5 alternativas fixas. Importe as digitalizações
                na tela de correção — não é preciso imprimir cartão novo.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Número de questões {legado ? "(fixo: 25)" : `(máx. ${max})`}</Label>
            <Input
              type="number"
              min={1}
              max={max}
              value={p.questoes.length}
              disabled={temCartoes || legado}
              onChange={(e) => setNum(parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Alternativas por questão {legado ? "(fixo: A–E)" : ""}</Label>
            <select
              disabled={temCartoes || legado}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={p.numAlternativas}
              onChange={(e) => setAlts(parseInt(e.target.value))}
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} ({Array.from({ length: n }, (_, i) => letra(i)).join(", ")})
                </option>
              ))}
            </select>
          </div>
          {temCartoes && (
            <p className="self-end text-xs text-warning md:col-span-1">
              Já existem cartões importados: modelo, número de questões e alternativas estão
              bloqueados.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-lg font-bold">Habilidades avaliadas</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <Input
            placeholder="Nome (ex.: Frações)"
            value={nh.nome}
            onChange={(e) => setNh({ ...nh, nome: e.target.value })}
          />
          <Input
            placeholder="Descrição (ex.: Comparar e operar frações)"
            value={nh.descricao}
            onChange={(e) => setNh({ ...nh, descricao: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addHab()}
          />
          <Button onClick={addHab}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        {p.habilidades.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma habilidade cadastrada.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {p.habilidades.map((h) => (
              <div key={h.id} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                <Input
                  value={h.nome}
                  onChange={(e) =>
                    set({
                      habilidades: p.habilidades.map((x) =>
                        x.id === h.id ? { ...x, nome: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Textarea
                  rows={1}
                  value={h.descricao}
                  onChange={(e) =>
                    set({
                      habilidades: p.habilidades.map((x) =>
                        x.id === h.id ? { ...x, descricao: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  className="text-destructive"
                  title="Remover habilidade"
                  onClick={() =>
                    set({
                      habilidades: p.habilidades.filter((x) => x.id !== h.id),
                      questoes: p.questoes.map((q) => ({
                        ...q,
                        habilidades: q.habilidades.filter((x) => x !== h.id),
                      })),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Questões e gabarito</h2>
          <span className="text-sm text-muted-foreground">
            Total de pontos:{" "}
            {p.questoes.reduce((s, q) => s + (q.peso || 0), 0).toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="space-y-2">
          {p.questoes.map((q, i) => {
            const semGab = q.gabarito === null,
              semHab = q.habilidades.length === 0;
            return (
              <div
                key={i}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${tentou && (semGab || semHab) ? "border-warning/60 bg-warning/5" : "bg-background/40"}`}
              >
                <span className="w-10 font-display font-bold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className="flex gap-1"
                  role="radiogroup"
                  aria-label={`Gabarito da questão ${i + 1}`}
                >
                  {Array.from({ length: p.numAlternativas }).map((_, a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={q.gabarito === a}
                      onClick={() => setQ(i, { gabarito: a })}
                      className={`h-8 w-8 rounded-full border text-sm font-bold ${q.gabarito === a ? "bg-primary text-primary-foreground glow" : "hover:bg-muted"}`}
                    >
                      {letra(a)}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-sm text-muted-foreground">
                  Peso
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    className="h-8 w-20"
                    value={q.peso}
                    onChange={(e) => setQ(i, { peso: parseFloat(e.target.value) })}
                  />
                </label>
                <div className="flex flex-1 flex-wrap gap-1">
                  {p.habilidades.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Cadastre habilidades acima
                    </span>
                  )}
                  {p.habilidades.map((h) => {
                    const on = q.habilidades.includes(h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() =>
                          setQ(i, {
                            habilidades: on
                              ? q.habilidades.filter((x) => x !== h.id)
                              : [...q.habilidades, h.id],
                          })
                        }
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        {h.nome || "(sem nome)"}
                      </button>
                    );
                  })}
                </div>
                {tentou && (semGab || semHab) && (
                  <span className="text-xs text-warning">
                    {semGab ? "Sem gabarito" : ""}
                    {semGab && semHab ? " · " : ""}
                    {semHab ? "Sem habilidade" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => salvar("rascunho")}>
            <Save className="h-4 w-4" /> Salvar rascunho
          </Button>
          <Button onClick={() => salvar("pronta")}>
            <CheckCircle2 className="h-4 w-4" /> Salvar e marcar como pronta
          </Button>
        </div>
      </section>
    </>
  );
}
