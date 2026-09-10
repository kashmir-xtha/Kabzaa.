const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  const shown = value ?? 1;
  return (
    <div
      className={`w-14 h-14 rounded-lg bg-parchment border border-ink-border grid grid-cols-3 grid-rows-3 gap-1 p-2 shrink-0 ${
        rolling ? "animate-[spin_0.5s_ease-in-out]" : ""
      }`}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        const active = value !== null && PIP_LAYOUTS[shown]?.some(([pr, pc]) => pr === r && pc === c);
        return (
          <div key={i} className="flex items-center justify-center">
            {active && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
          </div>
        );
      })}
    </div>
  );
}

export default function Dice({
  die1,
  die2,
  rolling = false,
}: {
  die1: number | null;
  die2: number | null;
  rolling?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Die value={die1} rolling={rolling} />
      <Die value={die2} rolling={rolling} />
    </div>
  );
}
