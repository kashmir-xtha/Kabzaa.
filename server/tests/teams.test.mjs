// Deterministic tests for team-mode economy rules.
// Run with: npx tsx tests/teams.test.mjs (from the server/ directory)
import { performRoll } from "../src/game/engine.js";
import { computeRent, ownsWholeGroup } from "../src/game/economy.js";
import { BOARD } from "../src/game/board.js";

function mockDiceAsymmetric(d1, d2) {
  const orig = Math.random;
  let call = 0;
  Math.random = () => { call++; const want = call === 1 ? d1 : d2; return (want - 1) / 6 + 0.001; };
  return () => (Math.random = orig);
}

function freshRoom() {
  return {
    code: "TEST01", status: "in_progress", mode: "teams", hostId: "p1",
    players: [
      { id: "p1", nickname: "Ada", avatar: "fox", isHost: true, ready: true, connected: true, teamId: "A", joinedAt: 1, money: 1500, position: 0, inJail: false, jailTurns: 0, doublesCount: 0, bankrupt: false },
      { id: "p2", nickname: "Bo", avatar: "owl", isHost: false, ready: true, connected: true, teamId: "A", joinedAt: 2, money: 1500, position: 0, inJail: false, jailTurns: 0, doublesCount: 0, bankrupt: false },
      { id: "p3", nickname: "Cy", avatar: "otter", isHost: false, ready: true, connected: true, teamId: "B", joinedAt: 3, money: 1500, position: 0, inJail: false, jailTurns: 0, doublesCount: 0, bankrupt: false },
    ],
    teams: [
      { id: "A", name: "Team Amber", color: "#E8A33D", memberIds: ["p1", "p2"] },
      { id: "B", name: "Team Teal", color: "#3FC9A5", memberIds: ["p3"] },
    ],
    settings: { startingMoney: 1500, maxPlayers: 6, doublesGiveExtraTurn: true, auctionEnabled: false, turnTimerEnabled: false, turnTimerSeconds: 60 },
    createdAt: Date.now(), turnOrder: ["p1", "p2", "p3"], currentTurnIndex: 0, turnPhase: "rolling",
    lastRoll: null, log: [], ownership: {}, houses: {}, trades: [], chatMessages: [],
    mortgaged: {}, winnerId: null, winnerTeamId: null, turnDeadline: null, pendingPostPurchasePhase: null,
  };
}

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("PASS:", msg); }
}

// No rent charged when landing on a teammate's property.
{
  const room = freshRoom();
  room.ownership[6] = "p2"; // Bo (teammate of Ada) owns Cove Landing
  const restore = mockDiceAsymmetric(1, 5);
  performRoll(room);
  restore();
  assert(room.players[0].money === 1500, "no rent charged between teammates");
  assert(room.players[1].money === 1500, "teammate collects nothing");
}

// Rent IS charged when landing on an opposing team's property.
{
  const room = freshRoom();
  room.ownership[6] = "p3"; // Cy (Team B) owns Cove Landing
  const restore = mockDiceAsymmetric(1, 5);
  performRoll(room);
  restore();
  assert(room.players[0].money === 1500 - 6, "rent charged for an opposing team's property");
  assert(room.players[2].money === 1500 + 6, "opposing owner collects rent");
}

// A group split between teammates counts as a team monopoly (doubles rent).
{
  const room = freshRoom();
  const coveGroup = BOARD.filter((t) => t.group === "cove").map((t) => t.index); // [6, 8, 9]
  room.ownership[coveGroup[0]] = "p1";
  room.ownership[coveGroup[1]] = "p2";
  room.ownership[coveGroup[2]] = "p2";
  assert(ownsWholeGroup(room, BOARD[coveGroup[0]], "p1"), "team-shared group counts as owned for Ada");
  assert(computeRent(room, BOARD[coveGroup[0]], "p1") === 6 * 2, "team monopoly doubles rent");
}

// Outside teams mode, split ownership is never a monopoly.
{
  const room = freshRoom();
  room.mode = "casual";
  const coveGroup = BOARD.filter((t) => t.group === "cove").map((t) => t.index);
  room.ownership[coveGroup[0]] = "p1";
  room.ownership[coveGroup[1]] = "p2";
  room.ownership[coveGroup[2]] = "p2";
  assert(!ownsWholeGroup(room, BOARD[coveGroup[0]], "p1"), "split ownership is not a monopoly outside teams mode");
}

console.log(process.exitCode ? "\nSOME TEAM ECONOMY TESTS FAILED" : "\nALL TEAM ECONOMY TESTS PASSED");
