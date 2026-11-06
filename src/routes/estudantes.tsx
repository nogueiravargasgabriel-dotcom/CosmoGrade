import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, Trash2, Upload, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useDb, updateDb, uid, excluirEstudante, type Estudante } from "@/lib/db";
import { PageHeader, Vazio } from "@/components/AppShell";
import { Confirmar } from "@/components/Confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/estudantes")({
  head: () => ({
    meta: [
      { title: "Estudantes — CosmoGrade" },
      { name: "description", content: "Cadastre, edite e importe estudantes por turma." },
      { property: "og:title", content: "Estudantes — CosmoGrade" },
      { property: "og:description", content: "Cadastre, edite e importe estudantes por turma." },
    ],
  }),
  component: Estudantes,
});

function Estudantes() {
  const { db } = useDb();
  const [nome, setNome] = useState("");
  const [turma, setTurma] = useState("");
  const [filtro, setFiltro] = useState("");
  const [edit, setEdit] = useState<Estudante | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const turmas = [...new Set(db.estudantes.map((e) => e.turma))].sort();
  const lista = db.estudantes
    .filter((e) => !filtro || e.turma === filtro)
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome, "pt-BR"));

  const add = () => {
    if (!nome.trim() || !turma.trim()) return toast.error("Informe nome e turma.");
    if (
      db.estudantes.some(
        (e) => e.nome.toLowerCase() === nome.trim().toLowerCase() && e.turma === turma.trim(),
      )
    )
      return toast.error("Já existe um estudante com esse nome nessa turma.");
    updateDb(
      (d) => ({
        ...d,
        estudantes: [
          ...d.estudantes,
          { id: uid(), nome: nome.trim(), turma: turma.trim(), criadoEm: Date.now() },
        ],
      }),
      `Estudante ${nome.trim()} cadastrado`,
    );
    setNome("");
    toast.success("Estudante cadastrado.");
  };

  const importarCsv = async (f: File | undefined) => {
    if (!f) return;
    const texto = await f.text();
    const novos: Estudante[] = [];
    let ignorados = 0;
    texto.split(/\r?\n/).forEach((linha, i) => {
      const [n, t] = linha.split(/[;,\t]/).map((s) => s?.trim().replace(/^"|"$/g, ""));
      if (!n || (i === 0 && /^nome$/i.test(n))) return;
      const tt = t || turma.trim();
      if (!tt) {
        ignorados++;
        return;
      }
      if (
        [...db.estudantes, ...novos].some(
          (e) => e.nome.toLowerCase() === n.toLowerCase() && e.turma === tt,
        )
      ) {
        ignorados++;
        return;
      }
      novos.push({ id: uid(), nome: n, turma: tt, criadoEm: Date.now() });
    });
    if (novos.length)
      updateDb(
        (d) => ({ ...d, estudantes: [...d.estudantes, ...novos] }),
        `${novos.length} estudantes importados por CSV`,
      );
    toast[novos.length ? "success" : "error"](
      `${novos.length} importado(s)${ignorados ? `, ${ignorados} ignorado(s) (duplicados ou sem turma)` : ""}.`,
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  const salvarEdit = () => {
    if (!edit || !edit.nome.trim() || !edit.turma.trim())
      return toast.error("Nome e turma são obrigatórios.");
    updateDb((d) => ({
      ...d,
      estudantes: d.estudantes.map((e) =>
        e.id === edit.id ? { ...edit, nome: edit.nome.trim(), turma: edit.turma.trim() } : e,
      ),
    }));
    setEdit(null);
    toast.success("Estudante atualizado.");
  };

  return (
    <>
      <PageHeader
        title="Estudantes"
        desc="Cadastro manual por turma. A importação CSV é opcional (colunas: nome;turma)."
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => importarCsv(e.target.files?.[0])}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Importar CSV
        </Button>
      </PageHeader>
      <div className="mb-6 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[2fr_1fr_auto]">
        <Input
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Input
          placeholder="Turma (ex.: 7º A)"
          value={turma}
          onChange={(e) => setTurma(e.target.value)}
          list="turmas"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <datalist id="turmas">
          {turmas.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Button onClick={add}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      {turmas.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {["", ...turmas].map((t) => (
            <button
              key={t || "todas"}
              onClick={() => setFiltro(t)}
              className={`rounded-full border px-3 py-1 text-xs ${filtro === t ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              {t || "Todas"}
            </button>
          ))}
        </div>
      )}
      {lista.length === 0 ? (
        <Vazio>Nenhum estudante cadastrado.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">Turma</th>
                <th className="p-3">Cartões</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const n = db.cartoes.filter((c) => c.estudanteId === e.id).length;
                const editando = edit?.id === e.id;
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="p-2">
                      {editando ? (
                        <Input
                          value={edit.nome}
                          onChange={(x) => setEdit({ ...edit, nome: x.target.value })}
                        />
                      ) : (
                        <span className="px-1">{e.nome}</span>
                      )}
                    </td>
                    <td className="p-2">
                      {editando ? (
                        <Input
                          value={edit.turma}
                          onChange={(x) => setEdit({ ...edit, turma: x.target.value })}
                        />
                      ) : (
                        <span className="px-1">{e.turma}</span>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">{n}</td>
                    <td className="p-2 text-right">
                      {editando ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={salvarEdit}
                            aria-label="Salvar"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEdit(null)}
                            aria-label="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEdit(e)}
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Confirmar
                            titulo="Excluir estudante?"
                            descricao={`${e.nome} será removido(a)${n ? ` junto com ${n} cartão(ões) e resultados associados` : ""}. Esta ação não pode ser desfeita.`}
                            onConfirm={async () => {
                              await excluirEstudante(e.id);
                              toast.success("Estudante excluído.");
                            }}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </Confirmar>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
