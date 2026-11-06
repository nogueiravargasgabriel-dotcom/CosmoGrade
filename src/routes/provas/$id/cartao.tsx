import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useDb } from "@/lib/db";
import { PageHeader, Vazio } from "@/components/AppShell";
import { CartaoResposta } from "@/components/CartaoResposta";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/provas/$id/cartao")({
  head: () => ({
    meta: [
      { title: "Cartão-resposta — CosmoGrade" },
      {
        name: "description",
        content: "Cartão-resposta imprimível compatível com a leitura óptica do CosmoGrade.",
      },
      { property: "og:title", content: "Cartão-resposta — CosmoGrade" },
      {
        property: "og:description",
        content: "Cartão-resposta imprimível compatível com a leitura óptica do CosmoGrade.",
      },
    ],
  }),
  component: Cartao,
});

function Cartao() {
  const { id } = Route.useParams();
  const { db } = useDb();
  const prova = db.provas.find((p) => p.id === id);
  if (!prova) return <Vazio>Prova não encontrada.</Vazio>;
  if (prova.status !== "pronta")
    return (
      <Vazio>
        Finalize o cadastro da prova antes de gerar o cartão.{" "}
        <Link to="/provas/$id" params={{ id }} className="text-primary underline">
          Editar prova
        </Link>
      </Vazio>
    );
  return (
    <>
      <PageHeader
        title="Cartão-resposta"
        desc="Imprima em A4, sem ajustar à página (escala 100%). Uma cópia por estudante."
      >
        <Button asChild variant="outline">
          <Link to="/provas/$id/correcao" params={{ id }}>
            Ir para correção
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </PageHeader>
      <div className="mx-auto max-w-[800px] overflow-hidden rounded-lg border print:max-w-none print:rounded-none print:border-0">
        <CartaoResposta prova={prova} />
      </div>
    </>
  );
}
