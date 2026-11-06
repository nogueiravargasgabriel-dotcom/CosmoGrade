import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Upload, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDb, gerarBackup, restaurarBackup, excluirTudo } from "@/lib/db";
import { baixarBlob } from "@/lib/report";
import { PageHeader } from "@/components/AppShell";
import { Confirmar } from "@/components/Confirmar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dados")({
  head: () => ({
    meta: [
      { title: "Dados e backup — CosmoGrade" },
      {
        name: "description",
        content: "Faça backup, restaure ou exclua os dados salvos neste navegador.",
      },
      { property: "og:title", content: "Dados e backup — CosmoGrade" },
      {
        property: "og:description",
        content: "Faça backup, restaure ou exclua os dados salvos neste navegador.",
      },
    ],
  }),
  component: Dados,
});

function Dados() {
  const { db, user } = useDb();
  const [busy, setBusy] = useState(false);
  const [pendente, setPendente] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = async () => {
    setBusy(true);
    try {
      const b = await gerarBackup();
      baixarBlob(
        new Blob([JSON.stringify(b)], { type: "application/json" }),
        `cosmograde-backup-${user}-${new Date().toISOString().slice(0, 10)}.json`,
      );
      toast.success("Backup gerado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const escolher = async (f?: File) => {
    if (!f) return;
    try {
      setPendente(JSON.parse(await f.text()));
    } catch {
      toast.error("Arquivo inválido.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const restaurar = async () => {
    setBusy(true);
    try {
      await restaurarBackup(pendente);
      toast.success("Backup restaurado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setPendente(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Dados e backup"
        desc={`Usuário: ${user} · ${db.provas.length} provas · ${db.estudantes.length} estudantes · ${db.cartoes.length} cartões`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-bold">Backup</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Baixe um arquivo com provas, estudantes, cartões (incluindo imagens) e resultados.
            Guarde-o em local seguro: ele contém dados pessoais dos estudantes.
          </p>
          <Button className="mt-4" onClick={backup} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{" "}
            Baixar backup
          </Button>
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-bold">Restaurar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Substitui todos os dados atuais deste usuário pelos dados do arquivo.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Upload className="h-4 w-4" /> Escolher arquivo
          </Button>
          {pendente !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              Arquivo carregado. Os dados atuais serão substituídos.
              <Confirmar
                titulo="Restaurar backup?"
                descricao="Todos os dados atuais deste usuário serão substituídos pelo conteúdo do backup."
                acao="Restaurar"
                onConfirm={restaurar}
              >
                <Button size="sm">Restaurar agora</Button>
              </Confirmar>
              <Button size="sm" variant="ghost" onClick={() => setPendente(null)}>
                Cancelar
              </Button>
            </div>
          )}
        </section>
        <section className="rounded-xl border border-destructive/40 bg-card p-5">
          <h2 className="text-lg font-bold text-destructive">Excluir todos os dados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove definitivamente provas, estudantes, imagens e resultados deste usuário neste
            navegador.
          </p>
          <Confirmar
            titulo="Excluir todos os dados?"
            descricao="Esta ação é irreversível. Faça um backup antes, se necessário."
            acao="Excluir tudo"
            onConfirm={async () => {
              await excluirTudo();
              toast.success("Dados excluídos.");
            }}
          >
            <Button className="mt-4" variant="destructive">
              <Trash2 className="h-4 w-4" /> Excluir tudo
            </Button>
          </Confirmar>
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" /> Privacidade
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Nada é enviado para servidores: tudo fica salvo neste navegador.</li>
            <li>Cada usuário tem seus próprios dados, protegidos por senha.</li>
            <li>
              O login protege o uso do app, mas quem tem acesso ao computador pode ler o
              armazenamento do navegador. Use um computador pessoal e saia ao terminar.
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
