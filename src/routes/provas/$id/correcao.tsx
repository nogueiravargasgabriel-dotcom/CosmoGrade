import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Unlock,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDb,
  updateDb,
  uid,
  salvarImagem,
  obterImagem,
  excluirImagem,
  type Cartao,
  type Prova,
} from "@/lib/db";
import { lerCartao, lerCartaoLegacy, lerArquivo, aplicar } from "@/lib/omr";
import { paginasDoPdf } from "@/lib/pdf";
import { bolha, bolhaLegacy, GRID, LEGACY } from "@/lib/cardLayout";
import { letra, textoResposta, corrigir, fmtNum, fmtPct } from "@/lib/grading";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Confirmar } from "@/components/Confirmar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/provas/$id/correcao")({
  head: () => ({
    meta: [
      { title: "Correção — CosmoGrade" },
      {
        name: "description",
        content: "Importe cartões-resposta, revise a leitura óptica e finalize as notas.",
      },
      { property: "og:title", content: "Correção — CosmoGrade" },
      {
        property: "og:description",
        content: "Importe cartões-resposta, revise a leitura óptica e finalize as notas.",
      },
    ],
  }),
  component: Correcao,
});

const patchCartao = (
  id: string,
  patch: Partial<Cartao> | ((c: Cartao) => Partial<Cartao>),
  atividade?: string,
) =>
  updateDb(
    (d) => ({
      ...d,
      cartoes: d.cartoes.map((c) =>
        c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c,
      ),
    }),
    atividade,
  );

async function processar(c: { id: string }, prova: Prova, dataUrl: string) {
  const leitura =
    prova.modelo === "marista25"
      ? await lerCartaoLegacy(dataUrl)
      : await lerCartao(dataUrl, prova.questoes.length, prova.numAlternativas);
  patchCartao(c.id, {
    leitura,
    manual: false,
    alteracoes: [],
    finalizado: false,
    respostas: leitura.status === "erro" ? null : [...leitura.detectadas],
    confirmadas: leitura.revisar.map((r) => !r),
  });
  return leitura;
}

function Correcao() {
  const { id } = Route.useParams();
  const { db } = useDb();
  const prova = db.provas.find((p) => p.id === id);
  const cartoes = db.cartoes
    .filter((c) => c.provaId === id)
    .sort((a, b) => a.criadoEm - b.criadoEm);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  if (!prova) return <Vazio>Prova não encontrada.</Vazio>;
  if (prova.status !== "pronta")
    return (
      <Vazio>
        A prova ainda é um rascunho.{" "}
        <Link to="/provas/$id" params={{ id }} className="text-primary underline">
          Finalize o cadastro
        </Link>{" "}
        para corrigir.
      </Vazio>
    );
  const atual = cartoes.find((c) => c.id === sel) ?? cartoes[0];

  const adicionar = async (nome: string, dataUrl: string) => {
    const c: Cartao = {
      id: uid(),
      provaId: prova.id,
      estudanteId: null,
      nomeArquivo: nome,
      criadoEm: Date.now(),
      leitura: null,
      respostas: null,
      confirmadas: [],
      alteracoes: [],
      manual: false,
      finalizado: false,
    };
    await salvarImagem(c.id, dataUrl);
    updateDb((d) => ({ ...d, cartoes: [...d.cartoes, c] }));
    await processar(c, prova, dataUrl);
    setSel(c.id);
  };

  const importar = async (files: FileList | null) => {
    if (!files?.length) return;
    const lista = Array.from(files);
    let i = 0,
      total = 0;
    for (const f of lista) {
      i++;
      const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (!ehPdf && !/image\/(jpeg|png)/.test(f.type)) {
        toast.error(`${f.name}: formato não suportado (use PDF, JPG ou PNG).`);
        continue;
      }
      try {
        if (ehPdf) {
          setBusy(`Abrindo PDF ${i} de ${lista.length}: ${f.name}`);
          const paginas = await paginasDoPdf(f, (p, t) =>
            setBusy(`Convertendo ${f.name}: página ${p} de ${t}`),
          );
          for (let p = 0; p < paginas.length; p++) {
            setBusy(`Lendo ${f.name}: página ${p + 1} de ${paginas.length}`);
            await adicionar(paginas.length > 1 ? `${f.name} · pág. ${p + 1}` : f.name, paginas[p]);
            total++;
          }
        } else {
          setBusy(`Lendo ${i} de ${lista.length}: ${f.name}`);
          await adicionar(f.name, await lerArquivo(f));
          total++;
        }
      } catch (e) {
        toast.error(`${f.name}: não foi possível abrir o arquivo (${(e as Error).message}).`);
      }
    }
    if (total) {
      updateDb((d) => d, `${total} cartão(ões) importado(s) em “${prova.nome}”`);
      toast.success(`${total} cartão(ões) importado(s). Revise as leituras na fila.`);
    }
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const finalizados = cartoes.filter((c) => c.finalizado).length;
  return (
    <>
      <PageHeader
        title="Correção"
        desc={
          <>
            {prova.nome} · {prova.turma} · {finalizados}/{cartoes.length} cartões finalizados
          </>
        }
      >
        {prova.modelo !== "marista25" && (
          <Button asChild variant="outline">
            <Link to="/provas/$id/cartao" params={{ id }}>
              Cartão em branco
            </Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/provas/$id/resultados" params={{ id }}>
            Resultados
          </Link>
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf,image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => importar(e.target.files)}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
          <Upload className="h-4 w-4" /> Importar PDFs ou imagens
        </Button>
      </PageHeader>
      {busy && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> {busy}
        </div>
      )}
      {cartoes.length === 0 ? (
        <Vazio>
          {prova.modelo === "marista25" ? (
            <>
              Nenhum cartão importado. Importe as digitalizações dos cartões Marista em PDF (várias
              provas por arquivo, uma por página) ou fotos JPG/PNG.
              <br />
              Dica: fotografe de frente, com boa luz, com a folha inteira visível e em pé.
            </>
          ) : (
            <>
              Nenhum cartão importado. Imprima o cartão-resposta desta prova, aplique-o e importe
              as digitalizações em PDF (várias provas por arquivo, uma por página) ou fotos
              JPG/PNG.
              <br />
              Dica: fotografe de frente, com boa luz, mostrando os 4 quadrados pretos dos cantos.
            </>
          )}
        </Vazio>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground">Fila de cartões</h2>
            {cartoes.map((c) => {
              const est = db.estudantes.find((e) => e.id === c.estudanteId);
              return (
                <button
                  key={c.id}
                  onClick={() => setSel(c.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${atual?.id === c.id ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}
                >
                  <div className="truncate font-semibold">
                    {est?.nome ?? <span className="text-warning">Sem estudante</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{c.nomeArquivo}</div>
                  <StatusBadge c={c} />
                </button>
              );
            })}
          </aside>
          {atual && (
            <Revisao
              key={atual.id}
              c={atual}
              prova={prova}
              aoFinalizar={() => {
                const prox = cartoes.find((x) => x.id !== atual.id && !x.finalizado);
                if (prox) setSel(prox.id);
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

function StatusBadge({ c }: { c: Cartao }) {
  const pend = c.respostas ? c.confirmadas.filter((x) => !x).length : 0;
  const [cls, txt] = c.finalizado
    ? ["bg-success/15 text-success", "Finalizado"]
    : !c.leitura
      ? ["bg-muted text-muted-foreground", "Aguardando leitura"]
      : !c.respostas
        ? ["bg-destructive/15 text-destructive", "Erro na leitura"]
        : pend
          ? ["bg-warning/15 text-warning", `${pend} para revisar`]
          : ["bg-primary/15 text-primary", "Pronto para finalizar"];
  return <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${cls}`}>{txt}</span>;
}

function Revisao({
  c,
  prova,
  aoFinalizar,
}: {
  c: Cartao;
  prova: Prova;
  aoFinalizar?: () => void;
}) {
  const { db } = useDb();
  const [img, setImg] = useState<string | null>(null);
  const [dims, setDims] = useState<[number, number] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  useEffect(() => {
    obterImagem(c.id).then((v) => setImg(v ?? null));
  }, [c.id]);
  const L = c.leitura;
  const n = prova.questoes.length;
  const usados = new Set(
    db.cartoes
      .filter((x) => x.provaId === prova.id && x.id !== c.id && x.estudanteId)
      .map((x) => x.estudanteId),
  );
  const estudantes = [...db.estudantes].sort(
    (a, b) =>
      (a.turma === prova.turma ? 0 : 1) - (b.turma === prova.turma ? 0 : 1) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const pend = c.respostas ? c.confirmadas.filter((x) => !x).length : 0;

  const releer = async () => {
    if (!img) return;
    setLendo(true);
    const l = await processar(c, prova, img);
    setLendo(false);
    if (l.status === "erro") toast.error("Não foi possível ler este cartão.");
    else toast.success("Leitura refeita.");
  };
  const alterar = (q: number, v: number) => {
    if (c.finalizado || !c.respostas) return;
    patchCartao(c.id, (x) => {
      const de = x.respostas![q];
      const respostas = [...x.respostas!];
      respostas[q] = v;
      const confirmadas = [...x.confirmadas];
      confirmadas[q] = true;
      return {
        respostas,
        confirmadas,
        alteracoes:
          de === v ? x.alteracoes : [...x.alteracoes, { questao: q, de, para: v, em: Date.now() }],
      };
    });
  };
  const confirmarQ = (q: number) =>
    patchCartao(c.id, (x) => {
      const cf = [...x.confirmadas];
      cf[q] = true;
      return { confirmadas: cf };
    });
  const manual = () =>
    patchCartao(c.id, {
      manual: true,
      respostas: new Array(n).fill(-1),
      confirmadas: new Array(n).fill(false),
      alteracoes: [],
    });
  const finalizar = () => {
    if (!c.estudanteId) return toast.error("Associe um estudante antes de finalizar.");
    if (pend) return toast.error(`Ainda há ${pend} questão(ões) para revisar.`);
    const est = db.estudantes.find((e) => e.id === c.estudanteId);
    patchCartao(
      c.id,
      { finalizado: true, finalizadoEm: Date.now() },
      `Correção de ${est?.nome} finalizada (${prova.nome})`,
    );
    toast.success("Correção finalizada. Indo para o próximo cartão pendente.");
    aoFinalizar?.();
  };
  const cadastrarEAtribuir = () => {
    const nome = novoNome.trim();
    if (nome.length < 2) return toast.error("Digite o nome do estudante.");
    const existente = db.estudantes.find(
      (e) => e.nome.trim().toLowerCase() === nome.toLowerCase(),
    );
    if (existente) {
      if (usados.has(existente.id))
        return toast.error("Este estudante já tem um cartão nesta prova.");
      patchCartao(c.id, { estudanteId: existente.id });
      setNovoNome("");
      return;
    }
    const nid = uid();
    updateDb(
      (d) => ({
        ...d,
        estudantes: [
          ...d.estudantes,
          { id: nid, nome, turma: prova.turma, criadoEm: Date.now() },
        ],
      }),
      `Estudante “${nome}” cadastrado`,
    );
    patchCartao(c.id, { estudanteId: nid });
    setNovoNome("");
    toast.success(`“${nome}” cadastrado e atribuído a este cartão.`);
  };
  const excluir = async () => {
    await excluirImagem(c.id);
    updateDb((d) => ({ ...d, cartoes: d.cartoes.filter((x) => x.id !== c.id) }), "Cartão excluído");
  };
  const res = c.respostas ? corrigir(prova, c.respostas) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
        <label className="text-sm font-semibold">Estudante:</label>
        <select
          className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm"
          value={c.estudanteId ?? ""}
          disabled={c.finalizado}
          onChange={(e) => patchCartao(c.id, { estudanteId: e.target.value || null })}
        >
          <option value="">— Selecione —</option>
          {estudantes.map((e) => (
            <option key={e.id} value={e.id} disabled={usados.has(e.id)}>
              {e.nome} ({e.turma}){usados.has(e.id) ? " — já tem cartão" : ""}
            </option>
          ))}
        </select>
        {db.estudantes.length === 0 && (
          <Link to="/estudantes" className="text-sm text-primary underline">
            Cadastrar estudantes
          </Link>
        )}
        {!c.finalizado && (
          <span className="flex items-center gap-1">
            <input
              className="h-9 w-48 rounded-md border bg-background px-2 text-sm"
              placeholder="Ou digite o nome…"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && cadastrarEAtribuir()}
            />
            <Button size="sm" variant="outline" onClick={cadastrarEAtribuir}>
              Atribuir
            </Button>
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!c.finalizado && (
            <Button size="sm" variant="outline" onClick={releer} disabled={lendo || !img}>
              {lendo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}{" "}
              Ler novamente
            </Button>
          )}
          {c.finalizado ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => patchCartao(c.id, { finalizado: false })}
            >
              <Unlock className="h-4 w-4" /> Reabrir
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={finalizar}
              disabled={!c.respostas || pend > 0 || !c.estudanteId}
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar correção
            </Button>
          )}
          <Confirmar
            titulo="Excluir cartão?"
            descricao="A imagem e as respostas deste cartão serão excluídas."
            onConfirm={excluir}
          >
            <Button size="sm" variant="ghost" className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </Confirmar>
        </div>
      </div>

      {L && L.mensagens.length > 0 && (
        <div
          className={`rounded-xl border p-4 text-sm ${L.status === "erro" ? "border-destructive/50 bg-destructive/10" : "border-warning/40 bg-warning/10"}`}
        >
          <div className="mb-1 flex items-center gap-2 font-semibold">
            {L.status === "erro" ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            )}
            {L.status === "erro" ? "Leitura não realizada" : "Atenção na revisão"}
          </div>
          <ul className="list-inside list-disc">
            {L.mensagens.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {L.status === "erro" && !c.respostas && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="self-center text-muted-foreground">Importe uma nova imagem ou</span>
              <Button size="sm" variant="outline" onClick={manual}>
                <PenLine className="h-4 w-4" /> corrija manualmente
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold">Imagem do cartão</span>
            {L && L.status !== "erro" && (
              <span className="text-muted-foreground">
                Confiança geral: <b className="text-foreground">{fmtPct(L.confiancaGeral)}</b>
              </span>
            )}
          </div>
          {!img ? (
            <div className="p-10 text-center text-muted-foreground">Carregando imagem…</div>
          ) : (
            <div className="relative">
              <img
                src={img}
                alt={`Cartão ${c.nomeArquivo}`}
                className="w-full rounded"
                onLoad={(e) =>
                  setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])
                }
              />
              {dims && L?.homografia && c.respostas && (
                <svg
                  viewBox={`0 0 ${dims[0]} ${dims[1]}`}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  {prova.questoes.map((_, q) =>
                    Array.from({ length: prova.numAlternativas }).map((_, a) => {
                      const pos =
                        prova.modelo === "marista25" ? bolhaLegacy(q, a) : bolha(q, a, n);
                      const raio = prova.modelo === "marista25" ? LEGACY.r : GRID.r;
                      const [x, y] = aplicar(L.homografia!, pos);
                      const [x2] = aplicar(L.homografia!, [pos[0] + raio, pos[1]]);
                      const r = Math.abs(x2 - x) * 1.15;
                      const marcada = c.respostas![q] === a;
                      const det =
                        L.detectadas[q] === a ||
                        (L.detectadas[q] === -2 && L.preenchimento[q]?.[a] >= 0.45);
                      if (!marcada && !det) return null;
                      const cor = !c.confirmadas[q] ? "#facc15" : marcada ? "#2EE5FF" : "#f87171";
                      return (
                        <circle
                          key={`${q}-${a}`}
                          cx={x}
                          cy={y}
                          r={r}
                          fill="none"
                          stroke={cor}
                          strokeWidth={Math.max(2, r * 0.18)}
                        />
                      );
                    }),
                  )}
                </svg>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Ciano: resposta considerada · amarelo: precisa de revisão · vermelho: leitura original
            alterada.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">
              Respostas {c.manual ? "(correção manual)" : "detectadas"}
            </span>
            {res && (
              <span>
                Nota prévia: <b className="text-primary">{fmtNum(res.nota)}</b> /{" "}
                {fmtNum(res.notaMax)} · {res.acertos} acertos
              </span>
            )}
          </div>
          {!c.respostas ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sem respostas para revisar.
            </p>
          ) : (
            <div className="max-h-[70vh] space-y-1 overflow-auto pr-1">
              {prova.questoes.map((q, i) => {
                const r = c.respostas![i];
                const pendente = !c.confirmadas[i];
                const orig = c.manual ? undefined : L?.detectadas[i];
                return (
                  <div
                    key={i}
                    className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm ${pendente ? "border-warning/60 bg-warning/10" : ""}`}
                  >
                    <span className="w-7 font-display font-bold text-primary">{i + 1}</span>
                    <div className="flex gap-1">
                      {Array.from({ length: prova.numAlternativas }).map((_, a) => (
                        <button
                          key={a}
                          disabled={c.finalizado}
                          onClick={() => alterar(i, a)}
                          title={
                            L?.preenchimento[i]
                              ? `Preenchimento ${Math.round((L.preenchimento[i][a] ?? 0) * 100)}%`
                              : undefined
                          }
                          className={`h-7 w-7 rounded-full border text-xs font-bold ${r === a ? (a === q.gabarito ? "bg-success text-background" : "bg-destructive text-destructive-foreground") : "hover:bg-muted"} ${a === q.gabarito && r !== a ? "border-success" : ""}`}
                        >
                          {letra(a)}
                        </button>
                      ))}
                      <button
                        disabled={c.finalizado}
                        onClick={() => alterar(i, -1)}
                        className={`h-7 rounded-full border px-2 text-xs ${r === -1 ? "bg-muted-foreground text-background" : "hover:bg-muted"}`}
                      >
                        Branco
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {orig !== undefined && (
                        <>
                          Lido: {textoResposta(orig)}
                          {L && <> · conf. {Math.round(L.confianca[i] * 100)}%</>}
                        </>
                      )}
                      {r === -2 && <b className="text-warning"> · Múltipla marcação</b>}
                    </span>
                    {pendente && !c.finalizado && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7"
                        onClick={() => confirmarQ(i)}
                      >
                        Confirmar {textoResposta(r)}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {c.alteracoes.length > 0 && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Alterações manuais ({c.alteracoes.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {c.alteracoes.map((a, k) => (
                  <li key={k}>
                    Q{a.questao + 1}: {textoResposta(a.de)} → {textoResposta(a.para)} em{" "}
                    {new Date(a.em).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
