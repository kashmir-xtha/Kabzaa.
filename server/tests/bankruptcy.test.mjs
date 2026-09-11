// Deterministic tests for bankruptcy/liquidation and win conditions.
// Run with: npx tsx tests/bankruptcy.test.mjs (from the server/ directory)
import { performRoll, declareBankruptcy, initializeGame } from "../src/game/engine.js";

function mockDiceAsymmetric(d1, d2) {
  const orig = Math.random;
  let call = 0;
  Math.random = () => { call++; const want = call === 1 ? d1 : d2; return (want - 1) / 6 + 0.001; };
  return () => (Math.random = orig);
}

function freshRoom(playerCount = 2) {
  const players = [];
  const names = ["Ada", "Bo", "Cy"];
  for (let i = 0; i < playerCount; i++) {
    players.push({
      id: `p${i + 1}`, nickname: names[i], avatar: "fox", isHost: i === 0, ready: true, connected: true,
      teamId: null, joinedAt: i + 1, money: 1500, position: 0, inJail: false, jailTurns: 0, doublesCount: 0, bankrupt: false,
    });
  }
  return {
    code: "TEST01", status: "in_progress", mode: "casual", hostId: "p1",
    players, teams: [],
    settings: { startingMoney: 1500, maxPlayers: 6, doublesGiveExtraTurn: true, auctionEnabled: false, turnTimerEnabled: false, turnTimerSeconds: 60 },
    createdAt: Date.now(), turnOrder: players.map((p) => p.id), currentTurnIndex: 0, turnPhase: "rolling",
    lastRoll: null, log: [], ownership: {}, houses: {}, trades: [], chatMessages: [],
    mortgaged: {}, winnerId: null, winnerTeamId: null, turnDeadline: null, pendingPostPurchasePhase: null,
  };
}

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("PASS:", msg); }
}

// Tax exceeding cash with no assets -> immediate bankruptcy to the bank,
// and the 2-player game ends right away.
{
  const room = freshRoom(2);
  room.players[0].money = 50;
  const restore = mockDiceAsymmetric(1, 3); // 4 steps -> Property Levy ($200 tax)
  performRoll(room);
  restore();
  assert(room.players[0].bankrupt === true, "no assets + insufficient cash -> bankrupt");
  assert(room.players[0].money === 0, "bankrupt player's money reset to 0");
  assert(room.turnOrder.length === 1, "bankrupt player removed from turn order");
  assert(room.status === "finished", "2-player game ends immediately");
  assert(room.winnerId === "p2", "the remaining player is declared winner");
}

// Liquidation (auto-mortgage) covers the debt when enough assets exist —
// the player survives (3-player game so it doesn't end things).
{
  const room = freshRoom(3);
  room.players[0].money = 10;
  [6, 8, 9, 11, 13].forEach((i) => (room.ownership[i] = "p1"));
  const restore = mockDiceAsymmetric(1, 3); // -> $200 tax
  performRoll(room);
  restore();
  assert(room.players[0].bankrupt === false, "sufficient liquidation avoids bankruptcy");
  assert(room.players[0].money >= 0, "money non-negative after liquidation");
  assert([6, 8, 9, 11, 13].some((i) => room.mortgaged[i]), "at least one property was mortgaged to cover the debt");
}

// Bankruptcy via rent transfers the loser's other assets to the creditor.
{
  const room = freshRoom(2);
  room.players[0].money = 5;
  room.ownership[6] = "p2"; // Bo owns Cove Landing
  room.houses[6] = 4; // rent = 6 * 80 = $480, far beyond Ada's means
  room.ownership[1] = "p1"; // Ada's other property — should transfer to Bo
  const restore = mockDiceAsymmetric(3, 3); // doubles: 6 steps -> lands on Bo's tile
  performRoll(room);
  restore();
  assert(room.players[0].bankrupt === true, "insufficient rent payment triggers bankruptcy");
  assert(room.ownership[1] === "p2", "bankrupt player's other property transferred to the creditor");
  assert(room.status === "finished" && room.winnerId === "p2", "creditor wins the 2-player game");
}

// Voluntary forfeit works and correctly checks the win condition.
{
  const room = freshRoom(2);
  room.ownership[1] = "p1";
  declareBankruptcy(room, "p1");
  assert(room.players[0].bankrupt === true, "voluntary forfeit marks bankrupt");
  assert(room.ownership[1] === undefined, "forfeited assets return to the bank");
  assert(room.status === "finished" && room.winnerId === "p2", "remaining player wins");
}

// Teams mode: the game ends only once every player on the opposing team(s) is bankrupt.
{
  const room = freshRoom(4);
  room.mode = "teams";
  room.teams = [
    { id: "A", name: "Team Amber", color: "#E8A33D", memberIds: ["p1", "p2"] },
    { id: "B", name: "Team Teal", color: "#3FC9A5", memberIds: ["p3", "p4"] },
  ];
  room.players[0].teamId = "A"; room.players[1].teamId = "A";
  room.players[2].teamId = "B"; room.players[3].teamId = "B";
  declareBankruptcy(room, "p3");
  assert(room.status !== "finished", "game continues while Team B still has an active player");
  declareBankruptcy(room, "p4");
  assert(room.status === "finished" && room.winnerTeamId === "A", "Team A wins once Team B is fully bankrupt");
}

// initializeGame resets bankruptcy/mortgage/winner state for a new game.
{
  const room = freshRoom(2);
  room.players[0].bankrupt = true;
  room.mortgaged[1] = true;
  room.winnerId = "p1";
  initializeGame(room);
  assert(room.players.every((p) => !p.bankrupt), "bankrupt flags reset");
  assert(Object.keys(room.mortgaged).length === 0, "mortgages reset");
  assert(room.winnerId === null, "winnerId reset");
}

console.log(process.exitCode ? "\nSOME BANKRUPTCY TESTS FAILED" : "\nALL BANKRUPTCY/WIN TESTS PASSED");
