import { BOARD, groupHouseCost, HOTEL_LEVEL, type BoardTile } from "./data";
import type { Player, Room } from "../../types";

function groupTilesOf(tile: BoardTile): BoardTile[] {
  return BOARD.filter((t) => t.group === tile.group);
}

export function sameTeam(room: Room, aId: string, bId: string): boolean {
  if (room.mode !== "teams") return false;
  const a = room.players.find((p) => p.id === aId);
  const b = room.players.find((p) => p.id === bId);
  return Boolean(a && b && a.teamId && a.teamId === b.teamId);
}

export function ownsWholeGroup(room: Room, tile: BoardTile, ownerId: string): boolean {
  const groupTiles = groupTilesOf(tile);
  if (groupTiles.length === 0) return false;
  return groupTiles.every((t) => {
    const owner = room.ownership[t.index];
    if (!owner) return false;
    if (owner === ownerId) return true;
    return sameTeam(room, owner, ownerId);
  });
}

function housesOn(room: Room, tileIndex: number): number {
  return room.houses[tileIndex] ?? 0;
}

export interface BuildCheck {
  ok: boolean;
  reason?: string;
  cost?: number;
}

export function checkCanBuildHouse(room: Room, tile: BoardTile, player: Player): BuildCheck {
  if (tile.kind !== "property") return { ok: false, reason: "You can only build on properties." };
  if (room.ownership[tile.index] !== player.id) return { ok: false, reason: "You don't own that property." };
  if (!ownsWholeGroup(room, tile, player.id)) return { ok: false, reason: "You need the whole color group to build." };

  const groupTiles = groupTilesOf(tile);
  if (groupTiles.some((t) => room.mortgaged[t.index])) {
    return { ok: false, reason: "Unmortgage every tile in the group first." };
  }

  const current = housesOn(room, tile.index);
  if (current >= HOTEL_LEVEL) return { ok: false, reason: "This property already has a hotel." };

  const groupHouses = groupTiles.map((t) => housesOn(room, t.index));
  if (current > Math.min(...groupHouses)) return { ok: false, reason: "Build evenly across the group first." };

  const cost = groupHouseCost(tile.group);
  if (player.money < cost) return { ok: false, reason: "You can't afford that.", cost };

  return { ok: true, cost };
}

export function checkCanSellHouse(room: Room, tile: BoardTile, player: Player): BuildCheck {
  if (room.ownership[tile.index] !== player.id) return { ok: false, reason: "You don't own that property." };
  const current = housesOn(room, tile.index);
  if (current <= 0) return { ok: false, reason: "Nothing to sell here." };

  const groupHouses = groupTilesOf(tile).map((t) => housesOn(room, t.index));
  if (current < Math.max(...groupHouses)) return { ok: false, reason: "Sell evenly across the group first." };

  const cost = groupHouseCost(tile.group);
  return { ok: true, cost: Math.floor(cost / 2) };
}

export interface MortgageCheck {
  ok: boolean;
  reason?: string;
  amount?: number;
}

export function checkCanMortgage(room: Room, tile: BoardTile, player: Player): MortgageCheck {
  if (room.ownership[tile.index] !== player.id) return { ok: false, reason: "You don't own that." };
  if (housesOn(room, tile.index) > 0) return { ok: false, reason: "Sell the houses on this property first." };
  if (room.mortgaged[tile.index]) return { ok: false, reason: "Already mortgaged." };
  return { ok: true, amount: Math.floor((tile.price ?? 0) / 2) };
}

export function checkCanUnmortgage(room: Room, tile: BoardTile, player: Player): MortgageCheck {
  if (room.ownership[tile.index] !== player.id) return { ok: false, reason: "You don't own that." };
  if (!room.mortgaged[tile.index]) return { ok: false, reason: "That property isn't mortgaged." };
  const mortgageValue = Math.floor((tile.price ?? 0) / 2);
  const amount = Math.ceil((mortgageValue * 11) / 10);
  if (player.money < amount) return { ok: false, reason: "You can't afford that.", amount };
  return { ok: true, amount };
}
