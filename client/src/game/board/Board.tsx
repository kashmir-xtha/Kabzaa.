import type { ReactNode } from "react";
import { BOARD } from "./data";
import { gridPosition, edgeOf } from "./layout";
import Tile from "./Tile";
import { avatarColor } from "../avatars";
import type { Player } from "../../types";

export default function Board({
  players,
  ownership,
  houses,
  children,
}: {
  players: Player[];
  ownership: Record<number, string>;
  houses: Record<number, number>;
  children: ReactNode;
}) {
  const byPosition = new Map<number, Player[]>();
  players.forEach((p) => {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  return (
    <div
      className="grid aspect-square h-full max-h-full max-w-full mx-auto bg-ink border border-ink-border rounded-lg p-1 shadow-2xl relative select-none shrink-0"
      style={{
        gridTemplateColumns: "1.3fr repeat(9, 1fr) 1.3fr",
        gridTemplateRows: "1.3fr repeat(9, 1fr) 1.3fr",
        gap: "2px",
      }}
    >
      {BOARD.map((tile) => {
        const pos = gridPosition(tile.index);
        const isCorner = tile.index % 10 === 0;
        const ownerId = ownership[tile.index];
        const owner = ownerId ? playerById.get(ownerId) : undefined;
        return (
          <div key={tile.index} style={{ gridRow: pos.row, gridColumn: pos.col }} className="min-w-0 min-h-0">
            <Tile
              tile={tile}
              edge={edgeOf(tile.index)}
              occupants={byPosition.get(tile.index) ?? []}
              isCorner={isCorner}
              ownerColor={owner ? avatarColor(owner.avatar) : undefined}
              ownerName={owner?.nickname}
              houses={houses[tile.index] ?? 0}
            />
          </div>
        );
      })}

      <div
        style={{ gridRow: "2 / 11", gridColumn: "2 / 11" }}
        className="flex items-center justify-center p-2 bg-ink/40 rounded border border-ink-border/30 overflow-hidden"
      >
        {children}
      </div>
    </div>
  );
}