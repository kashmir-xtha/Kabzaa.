import type { ReactNode } from "react";
import { BOARD } from "./data";
import { gridPosition, edgeOf } from "./layout";
import Tile from "./Tile";
import { avatarColor, AvatarBadge } from "../avatars";
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
        const occupants = byPosition.get(tile.index) ?? [];

        return (
          <div key={tile.index} style={{ gridRow: pos.row, gridColumn: pos.col }} className="min-w-0 min-h-0 relative">
            <Tile
              tile={tile}
              edge={edgeOf(tile.index)}
              occupants={[]}
              isCorner={isCorner}
              ownerColor={owner ? avatarColor(owner.avatar) : undefined}
              ownerName={owner?.nickname}
              houses={houses[tile.index] ?? 0}
            />

            {/* Absolute Center Tokens with Avatar Geometry */}
            {occupants.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="flex items-center justify-center gap-1 p-1 bg-ink/85 backdrop-blur-xs rounded-full border border-ink-border/50 shadow-xl max-w-[90%] overflow-hidden">
                  {occupants.map((p) => (
                    <div
                      key={p.id}
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-md overflow-hidden"
                      style={{ backgroundColor: avatarColor(p.avatar) }}
                      title={p.nickname}
                    >
                      <AvatarBadge id={p.avatar} size={32} />
                    </div>
                  ))}
                </div>
              </div>
            )}
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