// Deterministic tests for property purchase and rent (transit/utility/monopoly).
// Run with: npx tsx tests/economy.test.mjs (from the server/ directory)
import { performRoll, buyCurrentTile, passCurrentPurchase } from "../src/game/engine.js";
import { computeRent } from "../src/game/economy.js";
import { BOARD } from "../src/game/board.js";

function mockDiceAsymmetric(d1, d2) {
  const orig = Math.random;
  let call = 0;
  Math.random = () => { call++; const want = call === 1 ? d1 : d2; return (want - 1) / 6 + 0.001; };
  return () => (Math.random = orig);
}

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

// Buying an unowned property deducts the price and records ownership.
{
  const room = freshRoom();
  const restore = mockDiceAsymmetric(1, 5); // -> tile 6, Cove Landing, $100
  performRoll(room);
  restore();
  buyCurrentTile(room);
  assert(room.players[0].money === 1400, "price deducted from buyer");
  assert(room.ownership[6] === "p1", "ownership recorded");
}

// Landing on someone else's property auto-charges base rent.
{
  const room = freshRoom();
  room.ownership[6] = "p2";
  const restore = mockDiceAsymmetric(1, 5);
  performRoll(room);
  restore();
  assert(room.players[0].money === 1500 - 6, "renter pays base rent");
  assert(room.players[1].money === 1500 + 6, "owner receives rent");
}

// Owning the whole color group doubles unimproved rent.
{
  const room = freshRoom();
  const coveGroup = BOARD.filter((t) => t.group === "cove").map((t) => t.index);
  coveGroup.forEach((i) => (room.ownership[i] = "p2"));
  assert(computeRent(room, BOARD[6], "p2") === 6 * 2, "monopoly doubles base rent");
}

// Transit rent scales 25/50/100/200 with how many stations the owner has.
{
  const room = freshRoom();
  const transitTile = BOARD.find((t) => t.kind === "transit");
  room.ownership[transitTile.index] = "p2";
  assert(computeRent(room, transitTile, "p2") === 25, "1 transit owned -> $25 rent");
  const secondTransit = BOARD.filter((t) => t.kind === "transit")[1];
  room.ownership[secondTransit.index] = "p2";
  assert(computeRent(room, transitTile, "p2") === 50, "2 transit owned -> $50 rent");
}

// Utility rent is dice-total based: 4x for one owned, 10x for both.
{
  const room = freshRoom();
  room.lastRoll = { die1: 3, die2: 4, isDoubles: false };
  const utilTile = BOARD.find((t) => t.kind === "utility");
  room.ownership[utilTile.index] = "p2";
  assert(computeRent(room, utilTile, "p2") === 7 * 4, "1 utility owned -> 4x dice total");
  const secondUtil = BOARD.filter((t) => t.kind === "utility")[1];
  room.ownership[secondUtil.index] = "p2";
  assert(computeRent(room, utilTile, "p2") === 7 * 10, "2 utilities owned -> 10x dice total");
}

// Landing on your own property charges nothing and isn't purchasable again.
{
  const room = freshRoom();
  room.ownership[6] = "p1";
  const restore = mockDiceAsymmetric(1, 5);
  performRoll(room);
  restore();
  assert(room.players[0].money === 1500, "no self-rent charged");
  assert(room.turnPhase === "rolled", "no purchase prompt for your own tile");
}

// Doubles onto an unowned tile still prompts a purchase decision, and the
// bonus roll is preserved behind it until the decision resolves.
{
  const room = freshRoom();
  const restore = mockDiceAsymmetric(3, 3);
  performRoll(room);
  restore();
  assert(room.turnPhase === "awaiting-purchase", "doubles onto unowned tile still prompts purchase");
  assert(room.pendingPostPurchasePhase === "rolling", "bonus roll preserved behind the purchase prompt");
  buyCurrentTile(room);
  assert(room.turnPhase === "rolling", "bonus roll granted after resolving the purchase");
}

console.log(process.exitCode ? "\nSOME ECONOMY TESTS FAILED" : "\nALL ECONOMY TESTS PASSED");
