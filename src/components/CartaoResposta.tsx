import type { Prova } from "@/lib/db";
import { MARKERS, MARKER_SIZE, ORIENT, GRID, bolha, colunas, PAGE } from "@/lib/cardLayout";
import { letra, fmtData } from "@/lib/grading";

// Cartão impresso: cores fixas em preto/cinza por necessidade da leitura óptica (não segue o tema).
export function CartaoResposta({ prova }: { prova: Prova }) {
  const n = prova.questoes.length;
  const cols = colunas(n);
  const perCol = Math.ceil(n / cols);
  const colW = GRID.w / cols;
  return (
    <svg
      viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
      width="210mm"
      height="297mm"
      style={{ background: "#ffffff", display: "block", maxWidth: "100%", height: "auto" }}
      fontFamily="Arial, Helvetica, sans-serif"
    >
      <rect width={PAGE.w} height={PAGE.h} fill="#ffffff" />
      {MARKERS.map(([x, y], i) => (
        <rect
          key={i}
          x={x - MARKER_SIZE / 2}
          y={y - MARKER_SIZE / 2}
          width={MARKER_SIZE}
          height={MARKER_SIZE}
          fill="#000"
        />
      ))}
      <rect x={ORIENT.x} y={ORIENT.y} width={ORIENT.w} height={ORIENT.h} fill="#000" />
      <text x={60} y={17} fontSize={5} fontWeight={700} fill="#000">
        CARTÃO-RESPOSTA
      </text>
      <text x={190} y={17} fontSize={2.6} fill="#555" textAnchor="end">
        CosmoGrade · Laboratório Cósmico
      </text>

      <text x={20} y={30} fontSize={4} fontWeight={700} fill="#000">
        {prova.nome || "Prova sem nome"}
      </text>
      <text x={20} y={36} fontSize={3} fill="#333">
        Turma: {prova.turma || "—"} · Disciplina: {prova.disciplina || "—"} · Data:{" "}
        {fmtData(prova.data)} · {n} questões
      </text>
      <text x={20} y={46} fontSize={3.2} fill="#000">
        Nome do(a) estudante:
      </text>
      <line x1={57} y1={46.5} x2={190} y2={46.5} stroke="#000" strokeWidth={0.3} />
      <rect
        x={20}
        y={52}
        width={170}
        height={16}
        fill="none"
        stroke="#999"
        strokeWidth={0.25}
        rx={1.5}
      />
      <text x={24} y={57.5} fontSize={2.7} fill="#333">
        Instruções: preencha totalmente UMA bolha por questão com caneta preta ou azul-escura.
      </text>
      <text x={24} y={61.5} fontSize={2.7} fill="#333">
        Não rasure, não dobre o cartão e não escreva sobre os quadrados pretos dos cantos.
      </text>
      <text x={24} y={65.5} fontSize={2.7} fill="#333">
        Exemplo de marcação correta:
      </text>
      <circle cx={70} cy={64.6} r={GRID.r} fill="#000" />
      <text x={190} y={65.5} fontSize={2.2} fill="#888" textAnchor="end">
        Código: {prova.id.slice(0, 8).toUpperCase()}
      </text>

      {Array.from({ length: cols }).map((_, c) => {
        const x0 = GRID.x + c * colW;
        return (
          <g key={c}>
            {Array.from({ length: prova.numAlternativas }).map((_, a) => (
              <text
                key={a}
                x={x0 + GRID.label + GRID.pitch / 2 + a * GRID.pitch}
                y={GRID.y - 5}
                fontSize={2.8}
                fontWeight={700}
                fill="#666"
                textAnchor="middle"
              >
                {letra(a)}
              </text>
            ))}
          </g>
        );
      })}
      {prova.questoes.map((_, q) => {
        const [bx, by] = bolha(q, 0, n);
        const c = Math.floor(q / perCol);
        return (
          <g key={q}>
            {(q % perCol) % 2 === 0 && (
              <rect
                x={GRID.x + c * colW}
                y={by - GRID.rowH / 2}
                width={GRID.label + prova.numAlternativas * GRID.pitch + 1}
                height={GRID.rowH}
                fill="#f3f3f3"
              />
            )}
            <text
              x={bx - GRID.pitch / 2 - 1.5}
              y={by + 1.1}
              fontSize={3.1}
              fontWeight={700}
              fill="#000"
              textAnchor="end"
            >
              {String(q + 1).padStart(2, "0")}
            </text>
            {Array.from({ length: prova.numAlternativas }).map((_, a) => {
              const [x, y] = bolha(q, a, n);
              return (
                <g key={a}>
                  <circle cx={x} cy={y} r={GRID.r} fill="#fff" stroke="#222" strokeWidth={0.3} />
                  <text x={x} y={y + 0.9} fontSize={2.4} fill="#bbb" textAnchor="middle">
                    {letra(a)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      <text x={105} y={274} fontSize={2.4} fill="#777" textAnchor="middle">
        Para a leitura automática, fotografe ou digitalize o cartão inteiro, de frente, com os 4
        quadrados visíveis.
      </text>
    </svg>
  );
}
