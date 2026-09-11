// Deterministic tests for building houses/hotels and even-building rules.
// Run with: npx tsx tests/buildings.test.mjs (from the server/ directory)
import { buildHouse, sellHouse } from "../src/game/engine.js";
import { computeRent } from "../src/game/economy.js";
import { BOARD } from "../src/game/board.js";

function freshRoom() {
  return {
    code: "TEST01", status: "in_progress", mode: "casual", hostId: "p1",
    players: [
      { id: "p1", nickname: "Ada", avatar: "fox", isHost: true, ready: true, connected: true, teamId: null, joinedAt: 1, money: 1500, position: 0, inJail: false, jailTurns: 0, doublesCount: 0, bankrupt: false },
      { id: "p2", nickname: "Bo", avatar: "owl", isHost: false, ready: true, connected: true, teamId: null, joinedAt: 2, money: 1500, position: 0, inJail: false, jailTurns: 0, doublesCount: 0, bankrupt: false },
    ],
    teams: [],
    settings: { startingMoney: 1500, maxPlayers: 6, doublesGiveExtraTurn: true, auctionEnabled: false, turnTimerEnabled: false, turnTimerSeconds: 60 },
    createdAt: Date.now(), turnOrder: ["p1", "p2"], currentTurnIndex: 0, turnPhase: "rolling",
    lastRoll: null, log: [], ownership: {}, houses: {}, trades: [], chatMessages: [],
    mortgaged: {}, winnerId: null, winnerTeamId: null, turnDeadline: null, pendingPostPurchasePhase: null,
  };
}

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("PASS:", msg); }
}
function throws(fn) { try { fn(); return false; } catch { return true; } }

const coveGroup = BOARD.filter((t) => t.group === "cove").map((t) => t.index); // [6, 8, 9]

// Can't build without owning the whole color group.
{
  const room = freshRoom();
  room.ownership[6] = "p1";
  room.ownership[8] = "p1";
  // p1 does not own tile 9 (Ferry Street)
  assert(throws(() => buildHouse(room, "p1", 6)), "can't build without full group ownership");
}

// Building deducts the group's house cost and increments the count.
{
  const room = freshRoom();
  coveGroup.forEach((i) => (room.ownership[i] = "p1"));
  buildHouse(room, "p1", 6);
  assert(room.houses[6] === 1, "first house built on tile 6");
  assert(room.players[0].money === 1500 - 50, "house cost ($50 for Cove group) deducted");
}

// Even-building: can't build a 2nd house on one tile while others in the group have 0.
{
  const room = freshRoom();
  coveGroup.forEach((i) => (room.ownership[i] = "p1"));
  buildHouse(room, "p1", 6);
  assert(throws(() => buildHouse(room, "p1", 6)), "even-building blocks 2nd house while others have 0");
  buildHouse(room, "p1", 8);
  buildHouse(room, "p1", 9);
  buildHouse(room, "p1", 6); // now allowed, all tiles caught up to 1 first
  assert(room.houses[6] === 2, "even building allows the next round once caught up");
}

// Building past 4 houses upgrades to a hotel (level 5); can't build further.
{
  const room = freshRoom();
  coveGroup.forEach((i) => (room.ownership[i] = "p1"));
  room.players[0].money = 10000;
  for (let round = 0; round < 5; round++) coveGroup.forEach((i) => buildHouse(room, "p1", i));
  coveGroup.forEach((i) => assert(room.houses[i] === 5, `tile ${i} reached hotel level`));
  assert(throws(() => buildHouse(room, "p1", 6)), "can't build past a hotel");
}

// Insufficient funds blocks building.
{
  const room = freshRoom();
  coveGroup.forEach((i) => (room.ownership[i] = "p1"));
  room.players[0].money = 10;
  assert(throws(() => buildHouse(room, "p1", 6)), "insufficient funds blocks building");
}

// Selling refunds half the house cost.
{
  const room = freshRoom();
  coveGroup.forEach((i) => (room.ownership[i] = "p1"));
  buildHouse(room, "p1", 6);
  buildHouse(room, "p1", 8);
  const before = room.players[0].money;
  assert(throws(() => sellHouse(room, "p1", 9)), "can't sell from a tile with 0 houses");
  sellHouse(room, "p1", 6);
  assert(room.houses[6] === 0, "house count decremented");
  assert(room.players[0].money === before + 25, "refund is half the $50 house cost");
}

// Even-selling: must sell from the tile with the most houses first.
{
  const room = freshRoom();
  coveGroup.forEach((i) => (room.ownership[i] = "p1"));
  coveGroup.forEach((i) => buildHouse(room, "p1", i));
  buildHouse(room, "p1", 6); // tile6 -> 2, others at 1
  assert(throws(() => sellHouse(room, "p1", 8)), "can't sell from a tile at 1 house while another has 2");
  sellHouse(room, "p1", 6);
  assert(room.houses[6] === 1, "even-selling allowed from the max tile");
}

// Rent scales with house count: 5x/15x/45x/80x/125x base rent.
{
  const room = freshRoom();
  room.ownership[6] = "p2"; // Cove Landing, base rent $6
  room.houses[6] = 1;
  assert(computeRent(room, BOARD[6], "p2") === 6 * 5, "1 house -> 5x base rent");
  room.houses[6] = 4;
  assert(computeRent(room, BOARD[6], "p2") === 6 * 80, "4 houses -> 80x base rent");
  room.houses[6] = 5;
  assert(computeRent(room, BOARD[6], "p2") === 6 * 125, "hotel -> 125x base rent");
}

console.log(process.exitCode ? "\nSOME BUILDINGS TESTS FAILED" : "\nALL BUILDINGS TESTS PASSED");
