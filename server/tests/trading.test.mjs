// Deterministic tests for player-to-player trading.
// Run with: npx tsx tests/trading.test.mjs (from the server/ directory)
import { createTrade, resolveTrade, withdrawTrade } from "../src/game/engine.js";

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

// Can't trade with yourself, can't offer/request tiles you don't own, and
// can't trade a tile with houses on it.
{
  const room = freshRoom();
  assert(throws(() => createTrade(room, "p1", "p1", { money: 0, tiles: [] }, { money: 0, tiles: [] })), "can't trade with yourself");
  assert(throws(() => createTrade(room, "p1", "p2", { money: 0, tiles: [6] }, { money: 0, tiles: [] })), "can't offer a tile you don't own");
  room.ownership[6] = "p1";
  assert(throws(() => createTrade(room, "p1", "p2", { money: 100, tiles: [] }, { money: 0, tiles: [8] })), "can't request a tile they don't own");
  room.houses[6] = 2;
  assert(throws(() => createTrade(room, "p1", "p2", { money: 0, tiles: [6] }, { money: 0, tiles: [] })), "can't trade a tile with houses on it");
}

// An empty trade (nothing on either side) is rejected.
{
  const room = freshRoom();
  assert(throws(() => createTrade(room, "p1", "p2", { money: 0, tiles: [] }, { money: 0, tiles: [] })), "empty trade is rejected");
}

// Accepting a trade swaps money and tiles both ways and removes it from the pending list.
{
  const room = freshRoom();
  room.ownership[6] = "p1";
  room.ownership[8] = "p2";
  const trade = createTrade(room, "p1", "p2", { money: 100, tiles: [6] }, { money: 50, tiles: [8] });
  resolveTrade(room, "p2", trade.id, true);
  assert(room.ownership[6] === "p2", "tile 6 transferred to p2");
  assert(room.ownership[8] === "p1", "tile 8 transferred to p1");
  assert(room.players[0].money === 1500 - 100 + 50, "p1 money adjusted correctly");
  assert(room.players[1].money === 1500 - 50 + 100, "p2 money adjusted correctly");
  assert(room.trades.length === 0, "trade removed from the pending list");
}

// Declining removes the trade without moving anything.
{
  const room = freshRoom();
  room.ownership[6] = "p1";
  const trade = createTrade(room, "p1", "p2", { money: 0, tiles: [6] }, { money: 0, tiles: [] });
  resolveTrade(room, "p2", trade.id, false);
  assert(room.trades.length === 0, "trade removed after decline");
  assert(room.ownership[6] === "p1", "ownership unchanged after decline");
}

// Only the recipient can accept/decline; only the proposer can cancel.
{
  const room = freshRoom();
  room.ownership[6] = "p1";
  const trade = createTrade(room, "p1", "p2", { money: 0, tiles: [6] }, { money: 0, tiles: [] });
  assert(throws(() => resolveTrade(room, "p1", trade.id, true)), "proposer cannot respond to their own trade");
  assert(throws(() => withdrawTrade(room, "p2", trade.id)), "recipient cannot cancel the proposer's trade");
  withdrawTrade(room, "p1", trade.id);
  assert(room.trades.length === 0, "proposer can cancel their own trade");
}

// A trade that's gone stale by the time it's accepted (tile sold/traded
// elsewhere, or funds spent) fizzles gracefully rather than throwing or
// executing a bad transfer.
{
  const room = freshRoom();
  room.ownership[6] = "p1";
  const trade = createTrade(room, "p1", "p2", { money: 0, tiles: [6] }, { money: 0, tiles: [] });
  room.ownership[6] = "p2"; // p1 no longer owns it by the time p2 responds
  resolveTrade(room, "p2", trade.id, true); // must not throw
  assert(room.trades.length === 0, "stale trade removed on accept attempt");
  assert(room.ownership[6] === "p2", "ownership reflects the prior change, not a bad transfer");
}

console.log(process.exitCode ? "\nSOME TRADING TESTS FAILED" : "\nALL TRADING TESTS PASSED");
