import type { Room } from "../types/index.js";
import {
  BOARD,
  HOUSE_RENT_MULTIPLIERS,
  HOTEL_LEVEL,
  MAX_HOUSES,
  TRANSIT_RENTS,
  UTILITY_RENT_MULTIPLIER_BOTH,
  UTILITY_RENT_MULTIPLIER_ONE,
  groupHouseCost,
  type BoardTile,
} from "./board.js";

export function isPurchasable(tile: BoardTile): boolean {
  return (tile.kind === "property" || tile.kind === "transit" || tile.kind === "utility") && tile.price !== undefined;
}

function ownedCountOfKind(room: Room, ownerId: string, kind: BoardTile["kind"]): number {
  return BOARD.filter((t) => t.kind === kind && room.ownership[t.index] === ownerId).length;
}

function groupTilesOf(tile: BoardTile): BoardTile[] {
  return BOARD.filter((t) => t.group === tile.group);
}

export function sameTeam(room: Room, aId: string, bId: string): boolean {
  if (room.mode !== "teams") return false;
  const a = room.players.find((p) => p.id === aId);
  const b = room.players.find((p) => p.id === bId);
  return Boolean(a && b && a.teamId && a.teamId === b.teamId);
}

/** In teams mode, a group counts as a monopoly if every tile is controlled
 * by ownerId or one of their teammates. Outside teams mode this is just
 * "does ownerId personally own every tile in the group". */
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

function isMortgaged(room: Room, tileIndex: number): boolean {
  return Boolean(room.mortgaged[tileIndex]);
}

/** Rent owed to `ownerId` for landing on `tile`, given the current room
 * state (group monopolies, houses/hotels, transit/utility counts, last
 * dice roll). Mortgaged tiles never collect rent. */
export function computeRent(room: Room, tile: BoardTile, ownerId: string): number {
  if (isMortgaged(room, tile.index)) return 0;

  if (tile.kind === "property") {
    const base = tile.rent ?? 0;
    const houses = housesOn(room, tile.index);
    if (houses > 0) {
      return base * HOUSE_RENT_MULTIPLIERS[Math.min(houses, HOTEL_LEVEL) - 1];
    }
    return ownsWholeGroup(room, tile, ownerId) ? base * 2 : base;
  }

  if (tile.kind === "transit") {
    const count = ownedCountOfKind(room, ownerId, "transit");
    return TRANSIT_RENTS[Math.min(Math.max(count - 1, 0), TRANSIT_RENTS.length - 1)] ?? 0;
  }

  if (tile.kind === "utility") {
    const count = ownedCountOfKind(room, ownerId, "utility");
    const diceTotal = (room.lastRoll?.die1 ?? 0) + (room.lastRoll?.die2 ?? 0);
    return diceTotal * (count >= 2 ? UTILITY_RENT_MULTIPLIER_BOTH : UTILITY_RENT_MULTIPLIER_ONE);
  }

  return 0;
}

export interface BuildCheck {
  ok: boolean;
  reason?: string;
  cost?: number;
}

export function checkCanBuildHouse(room: Room, tile: BoardTile, playerId: string): BuildCheck {
  if (tile.kind !== "property") return { ok: false, reason: "You can only build on properties." };
  if (room.ownership[tile.index] !== playerId) return { ok: false, reason: "You don't own that property." };
  if (!ownsWholeGroup(room, tile, playerId)) return { ok: false, reason: "You need the whole color group to build." };

  const groupTiles = groupTilesOf(tile);
  if (groupTiles.some((t) => isMortgaged(room, t.index))) {
    return { ok: false, reason: "Unmortgage every tile in the group first." };
  }

  const current = housesOn(room, tile.index);
  if (current >= HOTEL_LEVEL) return { ok: false, reason: "This property already has a hotel." };

  const groupHouses = groupTiles.map((t) => housesOn(room, t.index));
  if (current > Math.min(...groupHouses)) return { ok: false, reason: "Build evenly across the group first." };

  const cost = groupHouseCost(tile.group);
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.money < cost) return { ok: false, reason: "You can't afford that.", cost };

  return { ok: true, cost };
}

export function checkCanSellHouse(room: Room, tile: BoardTile, playerId: string): BuildCheck {
  if (room.ownership[tile.index] !== playerId) return { ok: false, reason: "You don't own that property." };
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

export function checkCanMortgage(room: Room, tile: BoardTile, playerId: string): MortgageCheck {
  if (!isPurchasable(tile)) return { ok: false, reason: "That can't be mortgaged." };
  if (room.ownership[tile.index] !== playerId) return { ok: false, reason: "You don't own that." };
  if (housesOn(room, tile.index) > 0) return { ok: false, reason: "Sell the houses on this property first." };
  if (isMortgaged(room, tile.index)) return { ok: false, reason: "Already mortgaged." };
  return { ok: true, amount: Math.floor((tile.price ?? 0) / 2) };
}

export function checkCanUnmortgage(room: Room, tile: BoardTile, playerId: string): MortgageCheck {
  if (room.ownership[tile.index] !== playerId) return { ok: false, reason: "You don't own that." };
  if (!isMortgaged(room, tile.index)) return { ok: false, reason: "That property isn't mortgaged." };
  const mortgageValue = Math.floor((tile.price ?? 0) / 2);
  const amount = Math.ceil((mortgageValue * 11) / 10); // 10% interest, integer math avoids float drift (e.g. 50*1.1 = 55.00000000000001)
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.money < amount) return { ok: false, reason: "You can't afford that.", amount };
  return { ok: true, amount };
}

export { MAX_HOUSES, HOTEL_LEVEL, groupHouseCost };
