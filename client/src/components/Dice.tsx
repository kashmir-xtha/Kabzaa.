import { useEffect, useState, useRef } from "react";

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Die({ value, isRolling }: { value: number | null; isRolling: boolean }) {
  const shown = value ?? 1;

  return (
    <div
      className={`relative w-14 h-14 rounded-lg bg-parchment border border-ink-border grid grid-cols-3 grid-rows-3 gap-1 p-2 shrink-0 select-none transition-transform ${
        isRolling ? "animate-dice-shake-2d" : ""
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
  const [displayDie1, setDisplayDie1] = useState<number | null>(die1);
  const [displayDie2, setDisplayDie2] = useState<number | null>(die2);
  const [animating, setAnimating] = useState(false);

  const prevDiceRef = useRef<{ die1: number | null; die2: number | null }>({ die1, die2 });
  const isInitialMount = useRef(true);

  useEffect(() => {
    const prev = prevDiceRef.current;
    const valuesChanged =
      prev.die1 !== null &&
      prev.die2 !== null &&
      (prev.die1 !== die1 || prev.die2 !== die2);

    prevDiceRef.current = { die1, die2 };

    // Skip animation on initial mount, on initial data hydration, or if values haven't changed and rolling is false
    if (isInitialMount.current || (!valuesChanged && !rolling)) {
      isInitialMount.current = false;
      setDisplayDie1(die1);
      setDisplayDie2(die2);
      return;
    }

    setAnimating(true);

    // Rapidly switch die faces in place during the roll
    const interval = setInterval(() => {
      setDisplayDie1(Math.floor(Math.random() * 6) + 1);
      setDisplayDie2(Math.floor(Math.random() * 6) + 1);
    }, 75);

    // Settle on the actual rolled values after 500ms
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayDie1(die1);
      setDisplayDie2(die2);
      setAnimating(false);
    }, 750);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [die1, die2, rolling]);

  return (
    <div className="flex items-center gap-3">
      <Die value={displayDie1} isRolling={animating || rolling} />
      <Die value={displayDie2} isRolling={animating || rolling} />

      <style>{`
        @keyframes diceShake2D {
          0% { transform: rotate(0deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(10deg); }
          60% { transform: rotate(-6deg); }
          80% { transform: rotate(4deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-dice-shake-2d {
          animation: diceShake2D 750ms ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}