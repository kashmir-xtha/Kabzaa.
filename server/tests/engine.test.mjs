// Deterministic tests for the dice/movement/jail state machine.
// Run with: npx tsx tests/engine.test.mjs (from the server/ directory)
import { initializeGame, performRoll, payBailAndRoll, endTurn } from "../src/game/engine.js";
import { JAIL_POSITION } from "../src/game/board.js";

function mockDiceAsymmetric(d1, d2) {
  const orig = Math.random;
  let call = 0;
  Math.random = () => {
    call++;
    const want = call === 1 ? d1 : d2;
    return (want - 1) / 6 + 0.001;
  };
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

// Doubles onto a non-purchasable tile grants a bonus roll (same player, phase stays "rolling").
{
  const room = freshRoom();
  const restore = mockDiceAsymmetric(2, 2); // 4 steps -> tile 4, "Property Levy" (tax)
  performRoll(room);
  restore();
  assert(room.turnPhase === "rolling", "doubles onto a non-purchasable tile keeps phase 'rolling'");
  assert(room.players[0].position === 4, "player moved 4 spaces after rolling 2+2");
  assert(room.players[0].money === 1500 - 200, "landed on tax tile and paid it");
}

// Three doubles in a row sends the player to jail and ends the turn.
{
  const room = freshRoom();
  const restore = mockDiceAsymmetric(2, 2);
  performRoll(room); // pos 4 (tax)
  restore();
  const r2 = mockDiceAsymmetric(3, 3);
  performRoll(room); // pos 10 (jail tile, just visiting)
  r2();
  const r3 = mockDiceAsymmetric(4, 4);
  performRoll(room); // 3rd double -> jail regardless of position
  r3();
  assert(room.players[0].inJail === true, "three doubles in a row sends to jail");
  assert(room.players[0].position === JAIL_POSITION, "player position is jail tile after 3 doubles");
  assert(room.turnPhase === "rolled", "phase is 'rolled' after being jailed (turn ends)");
}

// Landing exactly on "Send-off" sends to jail even via doubles (no bonus roll).
{
  const room = freshRoom();
  room.players[0].position = 28; // 28 + 2 = 30 = Send-off
  const restore = mockDiceAsymmetric(1, 1);
  performRoll(room);
  restore();
  assert(room.players[0].inJail === true, "landing on Send-off sends to jail even via doubles");
  assert(room.players[0].position === JAIL_POSITION, "position moved to Holding, not Send-off");
}

// Jail: staying put (no doubles, fewer than 3 tries).
{
  const room = freshRoom();
  room.players[0].inJail = true;
  room.players[0].position = JAIL_POSITION;
  const restore = mockDiceAsymmetric(2, 5);
  performRoll(room);
  restore();
  assert(room.players[0].inJail === true, "stays in jail without doubles");
  assert(room.players[0].jailTurns === 1, "jailTurns incremented to 1");
}

// Jail: escaping via doubles never grants a bonus roll, even onto a purchasable tile.
{
  const room = freshRoom();
  room.players[0].inJail = true;
  room.players[0].position = JAIL_POSITION;
  const restore = mockDiceAsymmetric(4, 4);
  performRoll(room);
  restore();
  assert(room.players[0].inJail === false, "escapes jail on doubles");
  assert(room.players[0].position === JAIL_POSITION + 8, "moved 8 spaces after escaping");
  assert(room.turnPhase === "awaiting-purchase", "landed on a purchasable tile while escaping jail");
  assert(room.pendingPostPurchasePhase === "rolled", "no bonus roll pending after a jail-escape");
}

// Jail: forced bail after 3 failed tries.
{
  const room = freshRoom();
  room.players[0].inJail = true;
  room.players[0].jailTurns = 2;
  room.players[0].position = JAIL_POSITION;
  const restore = mockDiceAsymmetric(2, 3);
  performRoll(room);
  restore();
  assert(room.players[0].inJail === false, "forced out after 3rd try");
  assert(room.players[0].money === 1500 - 50, "paid $50 bail");
}

// Voluntary payBailAndRoll: doubles here DOES grant a bonus roll (it's a normal move, not an escape-via-doubles).
{
  const room = freshRoom();
  room.players[0].inJail = true;
  room.players[0].position = JAIL_POSITION;
  const restore = mockDiceAsymmetric(3, 3);
  payBailAndRoll(room);
  restore();
  assert(room.players[0].money === 1450, "payBail deducts $50");
  assert(room.pendingPostPurchasePhase === "rolling", "doubles after paying bail still grants a bonus roll");
}

// endTurn advances and wraps around the turn order.
{
  const room = freshRoom();
  room.turnPhase = "rolled";
  endTurn(room);
  assert(room.currentTurnIndex === 1, "turn advanced to index 1");
  room.turnPhase = "rolled";
  endTurn(room);
  assert(room.currentTurnIndex === 0, "turn wraps back to index 0");
}

// initializeGame resets everything for a fresh game.
{
  const room = freshRoom();
  room.ownership = { 3: "p2" };
  room.houses = { 3: 2 };
  initializeGame(room);
  assert(room.turnOrder.length === 2, "turnOrder has all players");
  assert(room.players.every((p) => p.money === 1500), "money reset to startingMoney");
  assert(Object.keys(room.ownership).length === 0, "ownership reset");
  assert(Object.keys(room.houses).length === 0, "houses reset");
}

console.log(process.exitCode ? "\nSOME ENGINE TESTS FAILED" : "\nALL ENGINE TESTS PASSED");
