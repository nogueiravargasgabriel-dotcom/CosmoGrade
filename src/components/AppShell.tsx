import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { LayoutDashboard, FileText, Users, Database, Orbit } from "lucide-react";
import { useDb, initSession } from "@/lib/db";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/provas", label: "Provas", icon: FileText },
  { to: "/estudantes", label: "Estudantes", icon: Users },
  { to: "/dados", label: "Dados e backup", icon: Database },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { loaded } = useDb();
  useEffect(() => {
    initSession();
  }, []);
  if (!loaded)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4 flex items-center gap-2">
            <Orbit className="h-6 w-6 text-primary" />
            <span className="font-display text-lg font-bold text-primary text-glow">
              CosmoGrade
            </span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                activeProps={{ className: "bg-muted text-primary" }}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 print:p-0">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
      {children}
    </div>
  );
}
