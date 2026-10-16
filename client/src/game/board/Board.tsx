import type { ReactNode } from "react";
import { BOARD, type BoardTile } from "./data";
import { ownsWholeGroup } from "./economy";
import { gridPosition, edgeOf } from "./layout";
import Tile from "./Tile";
import { avatarColor, AvatarBadge } from "../avatars";
import type { Player, Room } from "../../types";

// Constants matching your backend economy
const HOUSE_RENT_MULTIPLIERS = [5, 15, 45, 80, 125]; // Typical house multiplier schedule (adjust if your client board/data file has them exported)
const HOTEL_LEVEL = 5;
const TRANSIT_RENTS = [25, 50, 100, 200];
const UTILITY_RENT_MULTIPLIER_ONE = 4;
const UTILITY_RENT_MULTIPLIER_BOTH = 10;

function ownedCountOfKind(ownership: Record<number, string>, ownerId: string, kind: BoardTile["kind"]): number {
  return BOARD.filter((t) => t.kind === kind && ownership[t.index] === ownerId).length;
}

// Exact mirror of computeRent from backend economy.ts
function getEffectiveRent(
  tile: BoardTile,
  ownerId?: string,
  houses: number = 0,
  ownership?: Record<number, string>,
  room?: Room
): number | undefined {
  if (!ownerId || !ownership) return undefined;
  if (room && room.mortgaged && room.mortgaged[tile.index]) return 0;

  if (tile.kind === "property") {
    const base = tile.rent ?? 0;
    if (houses > 0) {
      const multiplier = HOUSE_RENT_MULTIPLIERS[Math.min(houses, HOTEL_LEVEL) - 1] ?? 5;
      return base * multiplier;
    }
    const hasWholeGroup = room ? ownsWholeGroup(room, tile, ownerId) : false;
    return hasWholeGroup ? base * 2 : base;
  }

  if (tile.kind === "transit") {
    const count = ownedCountOfKind(ownership, ownerId, "transit");
    return TRANSIT_RENTS[Math.min(Math.max(count - 1, 0), TRANSIT_RENTS.length - 1)] ?? 25;
  }

  if (tile.kind === "utility") {
    const count = ownedCountOfKind(ownership, ownerId, "utility");
    // Estimate using a default average dice roll (e.g., 7) for board display preview
    const estimatedDiceTotal = 7; 
    const multiplier = count >= 2 ? UTILITY_RENT_MULTIPLIER_BOTH : UTILITY_RENT_MULTIPLIER_ONE;
    return estimatedDiceTotal * multiplier;
  }

  return undefined;
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

// Mock partial room object to satisfy ownsWholeGroup helper without TS complaints
  const mockRoom = {
    players,
    ownership,
    houses,
    mortgaged: {},
    mode: "standard",
  } as unknown as Room;

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
        const currentRent = getEffectiveRent(tile, ownerId, tileHouses, ownership, mockRoom);

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