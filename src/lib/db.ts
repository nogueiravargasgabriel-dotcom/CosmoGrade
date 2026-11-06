import { useSyncExternalStore } from "react";
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from "idb-keyval";

export type Habilidade = { id: string; nome: string; descricao: string };
export type Questao = { peso: number; gabarito: number | null; habilidades: string[] };
export type Prova = {
  id: string;
  nome: string;
  turma: string;
  disciplina: string;
  data: string; // yyyy-mm-dd
  /** Modelo do cartão-resposta: gerado pelo app ou legado Marista (25 questões A–E) */
  modelo?: "cosmograde" | "marista25";
  numAlternativas: number;
  questoes: Questao[];
  habilidades: Habilidade[];
  status: "rascunho" | "pronta";
  criadoEm: number;
  atualizadoEm: number;
};
export type Estudante = { id: string; nome: string; turma: string; criadoEm: number };
/** Resposta: >=0 alternativa, -1 em branco, -2 marcação múltipla */
export type Alteracao = { questao: number; de: number; para: number; em: number };
export type Leitura = {
  status: "ok" | "revisar" | "erro";
  mensagens: string[];
  detectadas: number[];
  preenchimento: number[][];
  confianca: number[];
  revisar: boolean[];
  confiancaGeral: number;
  homografia?: number[];
  lidoEm: number;
};
export type Cartao = {
  id: string;
  provaId: string;
  estudanteId: string | null;
  nomeArquivo: string;
  criadoEm: number;
  leitura: Leitura | null;
  /** Respostas originalmente detectadas ficam em leitura.detectadas; aqui ficam as finais */
  respostas: number[] | null;
  confirmadas: boolean[];
  alteracoes: Alteracao[];
  manual: boolean;
  finalizado: boolean;
  finalizadoEm?: number;
};
export type Atividade = { em: number; texto: string };
export type Db = {
  provas: Prova[];
  estudantes: Estudante[];
  cartoes: Cartao[];
  atividades: Atividade[];
};

const emptyDb = (): Db => ({ provas: [], estudantes: [], cartoes: [], atividades: [] });

type Snapshot = { user: string | null; db: Db; loaded: boolean };
const SERVER: Snapshot = { user: null, db: emptyDb(), loaded: false };
let snapshot: Snapshot = SERVER;
const listeners = new Set<() => void>();

function emit(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function useDb() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => SERVER,
  );
}

const dbKey = (u: string) => `cosmograde:db:${u}`;
const USERS = "cosmograde:usuarios";
const SESSION = "cosmograde:sessao";

export const uid = () => crypto.randomUUID();

export function updateDb(fn: (d: Db) => Db, atividade?: string) {
  if (!snapshot.user) return;
  let next = fn(snapshot.db);
  if (atividade) {
    next = {
      ...next,
      atividades: [{ em: Date.now(), texto: atividade }, ...next.atividades].slice(0, 30),
    };
  }
  localStorage.setItem(dbKey(snapshot.user), JSON.stringify(next));
  emit({ db: next });
}

function loadUser(u: string | null) {
  if (!u) return emit({ user: null, db: emptyDb(), loaded: true });
  let db = emptyDb();
  try {
    const raw = localStorage.getItem(dbKey(u));
    if (raw) db = { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    /* dados corrompidos: começa vazio */
  }
  emit({ user: u, db, loaded: true });
}

const DEFAULT_USER = "professor";
export function initSession() {
  let u = localStorage.getItem(SESSION);
  if (!u) {
    u = DEFAULT_USER;
    localStorage.setItem(SESSION, u);
  }
  loadUser(u);
}

// ---------- Autenticação local ----------
type Usuario = { usuario: string; salt: string; hash: string };
async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function getUsers(): Usuario[] {
  try {
    return JSON.parse(localStorage.getItem(USERS) || "[]");
  } catch {
    return [];
  }
}
export const hasUsers = () => getUsers().length > 0;

export async function criarUsuario(usuario: string, senha: string) {
  const u = usuario.trim().toLowerCase();
  if (u.length < 3) throw new Error("O usuário precisa ter pelo menos 3 caracteres.");
  if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  const users = getUsers();
  if (users.some((x) => x.usuario === u)) throw new Error("Este usuário já existe.");
  const salt = uid();
  users.push({ usuario: u, salt, hash: await sha(salt + senha) });
  localStorage.setItem(USERS, JSON.stringify(users));
  localStorage.setItem(SESSION, u);
  loadUser(u);
}

export async function entrar(usuario: string, senha: string) {
  const u = usuario.trim().toLowerCase();
  const found = getUsers().find((x) => x.usuario === u);
  if (!found || (await sha(found.salt + senha)) !== found.hash)
    throw new Error("Usuário ou senha incorretos.");
  localStorage.setItem(SESSION, u);
  loadUser(u);
}

export function sair() {
  localStorage.removeItem(SESSION);
  loadUser(null);
}

// ---------- Imagens (IndexedDB) ----------
const imgKey = (id: string) => `cosmograde:img:${snapshot.user}:${id}`;
export const salvarImagem = (id: string, dataUrl: string) => idbSet(imgKey(id), dataUrl);
export const obterImagem = (id: string) => idbGet<string>(imgKey(id));
export const excluirImagem = (id: string) => idbDel(imgKey(id));

// ---------- Exclusões ----------
export async function excluirProva(id: string) {
  const prova = snapshot.db.provas.find((p) => p.id === id);
  const cartoes = snapshot.db.cartoes.filter((c) => c.provaId === id);
  await Promise.all(cartoes.map((c) => excluirImagem(c.id)));
  updateDb(
    (d) => ({
      ...d,
      provas: d.provas.filter((p) => p.id !== id),
      cartoes: d.cartoes.filter((c) => c.provaId !== id),
    }),
    `Prova “${prova?.nome ?? ""}” excluída`,
  );
}

export async function excluirEstudante(id: string) {
  const est = snapshot.db.estudantes.find((e) => e.id === id);
  const cartoes = snapshot.db.cartoes.filter((c) => c.estudanteId === id);
  await Promise.all(cartoes.map((c) => excluirImagem(c.id)));
  updateDb(
    (d) => ({
      ...d,
      estudantes: d.estudantes.filter((e) => e.id !== id),
      cartoes: d.cartoes.filter((c) => c.estudanteId !== id),
    }),
    `Estudante “${est?.nome ?? ""}” e seus resultados excluídos`,
  );
}

export async function excluirTudo() {
  const user = snapshot.user;
  if (!user) return;
  const ks = await idbKeys();
  await Promise.all(
    ks.filter((k) => String(k).startsWith(`cosmograde:img:${user}:`)).map((k) => idbDel(k)),
  );
  localStorage.removeItem(dbKey(user));
  emit({ db: emptyDb() });
}

// ---------- Backup ----------
export async function gerarBackup() {
  const imagens: Record<string, string> = {};
  for (const c of snapshot.db.cartoes) {
    const img = await obterImagem(c.id);
    if (img) imagens[c.id] = img;
  }
  return {
    app: "CosmoGrade",
    versao: 1,
    exportadoEm: new Date().toISOString(),
    db: snapshot.db,
    imagens,
  };
}

export async function restaurarBackup(json: unknown) {
  const b = json as { app?: string; db?: Db; imagens?: Record<string, string> };
  if (b?.app !== "CosmoGrade" || !b.db || !Array.isArray(b.db.provas))
    throw new Error("Arquivo de backup inválido.");
  await excluirTudo();
  for (const [id, img] of Object.entries(b.imagens ?? {})) await salvarImagem(id, img);
  updateDb(() => ({ ...emptyDb(), ...b.db! }), "Backup restaurado");
}
