import { useEffect, useRef, useState, type ReactNode } from "react";
import { BOARD, GROUPS, type BoardTile } from "./data";
import { ownsWholeGroup } from "./economy";
import { gridPosition, edgeOf } from "./layout";
import Tile from "./Tile";
import { avatarColor, AvatarBadge } from "../avatars";
import type { Player, Room } from "../../types";

const HOUSE_RENT_MULTIPLIERS = [5, 15, 45, 80, 125];
const HOTEL_LEVEL = 5;
const TRANSIT_RENTS = [25, 50, 100, 200];

function ownedCountOfKind(ownership: Record<number, string>, ownerId: string, kind: BoardTile["kind"]): number {
  return BOARD.filter((t) => t.kind === kind && ownership[t.index] === ownerId).length;
}

function getEffectiveRent(
  tile: BoardTile,
  ownerId?: string,
  houses: number = 0,
  ownership?: Record<number, string>,
  room?: Room
): number | undefined {
  if (!ownerId || !ownership) return undefined;
  if (room && room.mortgaged && room.mortgaged[tile.index]) return 0;

  if (room && room.players) {
    const owner = room.players.find((p) => p.id === ownerId);
    if (owner && owner.inJail) return 0;
  }

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

  return undefined;
}

export default function Board({
  players,
  ownership,
  houses,
  bountyPool = 100,
  children,
}: {
  players: Player[];
  ownership: Record<number, string>;
  houses: Record<number, number>;
  bountyPool?: number;
  children: ReactNode;
}) {
  const prevCompletedGroupsRef = useRef<Record<string, string>>({});
  const isFirstRenderRef = useRef(true);
  const [flashingGroups, setFlashingGroups] = useState<Record<string, string>>({});

  useEffect(() => {
    const currentCompleted: Record<string, string> = {};

    for (const group of GROUPS) {
      const groupTiles = BOARD.filter((t) => t.group === group.id);
      if (groupTiles.length === 0) continue;

      const firstOwner = ownership[groupTiles[0].index];
      if (!firstOwner) continue;

      const allOwnedBySame = groupTiles.every((t) => ownership[t.index] === firstOwner);
      if (allOwnedBySame) {
        currentCompleted[group.id] = firstOwner;
      }
    }

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevCompletedGroupsRef.current = currentCompleted;
      return;
    }

    const newlyCompleted: Record<string, string> = {};
    for (const [groupId, ownerId] of Object.entries(currentCompleted)) {
      if (prevCompletedGroupsRef.current[groupId] !== ownerId) {
        const owner = players.find((p) => p.id === ownerId);
        if (owner) {
          newlyCompleted[groupId] = avatarColor(owner.avatar);
        }
      }
    }

    prevCompletedGroupsRef.current = currentCompleted;

    if (Object.keys(newlyCompleted).length > 0) {
      setFlashingGroups((prev) => ({ ...prev, ...newlyCompleted }));

      const timer = setTimeout(() => {
        setFlashingGroups((prev) => {
          const next = { ...prev };
          for (const groupId of Object.keys(newlyCompleted)) {
            delete next[groupId];
          }
          return next;
        });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [ownership, players]);

  const byPosition = new Map<number, Player[]>();
  players.forEach((p) => {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

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
        
        // Check if tile group is currently flashing
        const groupFlashColor = tile.group ? flashingGroups[tile.group] : undefined;

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
              bountyPool={tile.index === 20 ? bountyPool : undefined}
              groupFlashColor={groupFlashColor}
            />

            {/* Overlapping Stacked Token Layout */}
            {occupants.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="flex items-center justify-center -space-x-4">
                  {occupants.map((p, index) => (
                    <div
                      key={p.id}
                      className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0 shadow-md overflow-hidden pointer-events-auto transition-transform hover:scale-110 hover:z-30"
                      style={{
                        backgroundColor: avatarColor(p.avatar),
                        zIndex: index,
                      }}
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