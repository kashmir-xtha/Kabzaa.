import type { ReactNode } from "react";
import { BOARD, type BoardTile } from "./data";
import { ownsWholeGroup } from "./economy";
import { gridPosition, edgeOf } from "./layout";
import Tile from "./Tile";
import { avatarColor, AvatarBadge } from "../avatars";
import type { Player, Room } from "../../types";

// Helper to calculate or lookup the exact rent for a tile
function getEffectiveRent(
  tile: BoardTile,
  ownerId?: string,
  houses: number = 0,
  ownership?: Record<number, string>
): number | undefined {
  if (!ownerId || tile.kind !== "property") return undefined;

  // 1. If your tile definition has a rent property or rent array (e.g., base rent, house 1-4, hotel rent)
  // @ts-ignore - checking custom schema fields safely
  const rentData = tile.rent;
  if (Array.isArray(rentData)) {
    // Index 0: Base rent, Index 1-4: Houses 1-4, Index 5: Hotel
    const tier = houses > 0 ? houses : (ownership && tile.group && ownsWholeGroup({ ownership } as Room, tile, ownerId) ? 1 : 0);
    return rentData[Math.min(tier, rentData.length - 1)];
  }
  if (typeof rentData === "number") {
    // If base rent is a flat number, scale with houses or monopoly status
    let rent = rentData;
    if (houses > 0) {
      rent *= Math.pow(2.5, houses); // Standard house multiplier curve
    } else if (tile.group && ownership && ownsWholeGroup({ ownership } as Room, tile, ownerId)) {
    }
    return Math.floor(rent);
  }

  // 3. Fallback standard estimation if explicit rent fields aren't on the tile object
  const basePrice = tile.price ?? 60;
  const baseRent = Math.floor(basePrice * 0.1);
  if (houses > 0) return baseRent * (houses * 3);
  return baseRent;
}

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
        const tileHouses = houses[tile.index] ?? 0;
        const currentRent = getEffectiveRent(tile, ownerId, tileHouses, ownership);

        return (
          <div key={tile.index} style={{ gridRow: pos.row, gridColumn: pos.col }} className="min-w-0 min-h-0 relative">
            <Tile
              tile={tile}
              edge={edgeOf(tile.index)}
              occupants={[]}
              isCorner={isCorner}
              ownerColor={owner ? avatarColor(owner.avatar) : undefined}
              ownerName={owner?.nickname}
              houses={tileHouses}
              rent={currentRent}
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