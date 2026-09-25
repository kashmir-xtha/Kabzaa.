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
  rollKey,
  onRollComplete,
}: {
  die1: number | null;
  die2: number | null;
  rolling?: boolean;
  rollKey?: number;
  onRollComplete?: () => void;
}) {
  const [displayDie1, setDisplayDie1] = useState<number | null>(die1 ?? 1);
  const [displayDie2, setDisplayDie2] = useState<number | null>(die2 ?? 1);
  const [animating, setAnimating] = useState(false);

  const prevRollKeyRef = useRef<number | undefined>(rollKey);
  const onRollCompleteRef = useRef(onRollComplete);

  useEffect(() => {
    onRollCompleteRef.current = onRollComplete;
  }, [onRollComplete]);

  useEffect(() => {
    // If rollKey hasn't changed, only update displayed numbers if valid values are passed.
    // Retains previous values when room.lastRoll resets to null on End Turn.
    if (rollKey === undefined || rollKey === prevRollKeyRef.current) {
      if (die1 != null) setDisplayDie1(die1);
      if (die2 != null) setDisplayDie2(die2);
      return;
    }

    prevRollKeyRef.current = rollKey;
    setAnimating(true);

    const interval = setInterval(() => {
      setDisplayDie1(Math.floor(Math.random() * 6) + 1);
      setDisplayDie2(Math.floor(Math.random() * 6) + 1);
    }, 75);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (die1 != null) setDisplayDie1(die1);
      if (die2 != null) setDisplayDie2(die2);
      setAnimating(false);
      onRollCompleteRef.current?.();
    }, 750);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [die1, die2, rollKey]);

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