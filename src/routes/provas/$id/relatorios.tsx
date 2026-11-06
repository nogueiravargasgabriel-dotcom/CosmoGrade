import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/lib/db";
import { corrigir, fmtNum } from "@/lib/grading";
import { desenharRelatorio, canvasParaBlob, baixarBlob, nomeArquivo } from "@/lib/report";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/provas/$id/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios individuais — CosmoGrade" },
      {
        name: "description",
        content: "Visualize e baixe relatórios individuais em JPEG prontos para impressão.",
      },
      { property: "og:title", content: "Relatórios individuais — CosmoGrade" },
      {
        property: "og:description",
        content: "Visualize e baixe relatórios individuais em JPEG prontos para impressão.",
      },
    ],
  }),
  component: Relatorios,
});

function Relatorios() {
  const { id } = Route.useParams();
  const { db } = useDb();
  const prova = db.provas.find((p) => p.id === id);
  const linhas = prova
    ? db.cartoes
        .filter((c) => c.provaId === id && c.finalizado && c.respostas && c.estudanteId)
        .map((c) => ({
          c,
          e: db.estudantes.find((e) => e.id === c.estudanteId)!,
          r: corrigir(prova, c.respostas!),
        }))
        .filter((x) => x.e)
        .sort((a, b) => a.e.nome.localeCompare(b.e.nome, "pt-BR"))
    : [];
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [lote, setLote] = useState("");
  const atual = linhas.find((l) => l.c.id === sel) ?? linhas[0];

  useEffect(() => {
    if (!atual || !prova) return;
    let url = "",
      cancel = false;
    setPreview(null);
    desenharRelatorio(prova, atual.e, atual.r)
      .then(canvasParaBlob)
      .then((blob) => {
        if (cancel) return;
        url = URL.createObjectURL(blob);
        setPreview({ url, blob });
      })
      .catch((e) => toast.error(e.message));
    return () => {
      cancel = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.c.id, atual?.c.respostas, prova?.atualizadoEm]);

  if (!prova) return <Vazio>Prova não encontrada.</Vazio>;
  const arq = (nome: string) => `relatorio-${nomeArquivo(nome)}-${nomeArquivo(prova.nome)}.jpg`;

  const baixarTodos = async () => {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < linhas.length; i++) {
        setLote(`Gerando ${i + 1} de ${linhas.length}…`);
        const l = linhas[i];
        zip.file(
          `${String(i + 1).padStart(2, "0")}-${arq(l.e.nome)}`,
          await canvasParaBlob(await desenharRelatorio(prova, l.e, l.r)),
        );
      }
      setLote("Compactando…");
      baixarBlob(
        await zip.generateAsync({ type: "blob", compression: "STORE" }),
        `relatorios-${nomeArquivo(prova.nome)}.zip`,
      );
      toast.success(`${linhas.length} relatórios baixados.`);
    } catch (e) {
      toast.error(`Falha no lote: ${(e as Error).message}`);
    } finally {
      setLote("");
    }
  };

  return (
    <>
      <PageHeader
        title="Relatórios individuais"
        desc={`${prova.nome} · cada JPEG contém apenas os dados de um estudante.`}
      >
        <Button asChild variant="outline">
          <Link to="/provas/$id/resultados" params={{ id }}>
            Resultados
          </Link>
        </Button>
        <Button onClick={baixarTodos} disabled={!linhas.length || !!lote}>
          {lote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}{" "}
          {lote || "Baixar todos (ZIP)"}
        </Button>
      </PageHeader>
      {linhas.length === 0 ? (
        <Vazio>Nenhuma correção finalizada. Finalize as correções na tela de correção.</Vazio>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-2">
            {linhas.map((l) => (
              <button
                key={l.c.id}
                onClick={() => setSel(l.c.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm ${atual?.c.id === l.c.id ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}
              >
                <div className="font-semibold">{l.e.nome}</div>
                <div className="text-xs text-muted-foreground">
                  Nota {fmtNum(l.r.nota)} / {fmtNum(l.r.notaMax)}
                </div>
              </button>
            ))}
          </aside>
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-semibold">{atual?.e.nome}</span>
              <Button
                disabled={!preview}
                onClick={() => preview && atual && baixarBlob(preview.blob, arq(atual.e.nome))}
              >
                <Download className="h-4 w-4" /> Baixar JPEG
              </Button>
            </div>
            {preview ? (
              <img
                src={preview.url}
                alt={`Relatório de ${atual?.e.nome}`}
                className="mx-auto w-full max-w-[640px] rounded border"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 p-16 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando prévia…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
