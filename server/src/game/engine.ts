import { randomUUID } from "node:crypto";
import type { ChatMessage, Player, Room, TeamId, TradeOffer, TradeSide, TurnPhase } from "../types/index.js";
import { GameError } from "../utils/errors.js";
import { BOARD, JAIL_BAIL, JAIL_POSITION, PASS_GO_AMOUNT, LAND_START_AMOUNT, groupHouseCost, tileAt } from "./board.js";
import {
  checkCanBuildHouse,
  checkCanMortgage,
  checkCanSellHouse,
  checkCanUnmortgage,
  computeRent,
  isPurchasable,
  sameTeam,
} from "./economy.js";

const MAX_LOG_ENTRIES = 60;
const MAX_CHAT_ENTRIES = 200;
const MAX_CHAT_LENGTH = 300;

function randDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function addLog(room: Room, message: string) {
  room.log.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message, ts: Date.now() });
  if (room.log.length > MAX_LOG_ENTRIES) room.log.splice(0, room.log.length - MAX_LOG_ENTRIES);
}

interface MoveResult {
  goToJail: boolean;
  isWagerTile: boolean; // Added flag for Tile 10 wager
  isVacationTile: boolean;
  purchasable: boolean;
  creditorId?: string;
}

function handleTreasure(room: Room, player: Player) {
  const treasureEvents = [
    {
      action: (p: Player, r: Room) => {
        let totalGifted = 0;
        let message = "It's your Birthday!"
        // Filter out bankrupt players and the birthday player themselves
        r.players.forEach((other) => {
          if (other.id !== p.id && !other.bankrupt) {
            // Deduct $50 (or whatever balance they have if under $50)
            const giftAmount = Math.min(other.money, 50);
            other.money -= giftAmount;
            totalGifted += giftAmount;
            message += `\n${other.nickname} send you a $${giftAmount} gift.`
          }
        });
        p.money += totalGifted;
        return message;
      }
    },
    {
      action: (p: Player) => {
        p.money += 50;
        return "Recieved $50 Tihar bonus from work.";
      }
    },
    {
      action: (p: Player, r: Room) => {
        // Find other non-bankrupt players
        const others = r.players.filter((o) => o.id !== p.id && !o.bankrupt);
        if (others.length === 0) {
          p.money += 75;
          return "Found a lost tourist backpack with $75 inside!";
        }
        // Pick a random target player
        const target = others[Math.floor(Math.random() * others.length)];
        const amount = Math.min(target.money, 75);
        target.money -= amount;
        p.money += amount;
        return `You found ${target.nickname}'s wallet, collect $${amount}`;
      }
    },
    {
      action: (p: Player) => {
        p.money += 100;
        return "Received a generous blessing of $100 by elders during Dashain Festival."
      }
    },
    {
      action: (p: Player) => {
        p.money += 150;
        return "Your old investment in a local hotel finally paid off! Collect $150.";
      }
    },
    {
      action: (p: Player) => {
        p.money += 200;
        return "Received unexpected inheritance from a distant relative! Collect $200.";
      }
    },
    {
      action: (p: Player) => {
        p.money += 250;
        return "Found ancient artifacts near an ancient temple! Sold to a museum for $250.";
      }
    },
    {
      action: (p: Player) => {
        p.money += 300;
        return "A lucky lottery ticket turned out to be a winner! Gain $300.";
      }
    },
    {
      action: (p: Player) => {
        let cash = Math.floor(0.5 * room.bountyPool);
        p.money += cash;
        room.bountyPool = (room.bountyPool || 100) - cash;
        return `You community service earned you a government grant! Collect 50% ($${cash}) of Bounty Pool.`;
      }
    },
    {
      action: (p: Player) => {
        p.freePassCount = (p.freePassCount || 0) + 1;
        return "Found a Royal Amnesty Pardon! You earned a Free Pass to escape Holding for free.";
      }
    }
  ];

  // Pick a random treasure event
  const event = treasureEvents[Math.floor(Math.random() * treasureEvents.length)];
  const message = event.action(player, room);
  addLog(room, `🧭 [TREASURE]: ${message}`);
}

function handleTwist(room: Room, player: Player) {
  const twistEvents = [
    {
      action: (p: Player, r: Room) => {
        p.money -= 50;
        r.bountyPool = (r.bountyPool || 100) + 50;
        return "Parked motorcycle in 'NO PARKING'! Paid $50 fine.";
      }
    },
    {
      action: (p: Player, r: Room) => {
        // Find other non-bankrupt players
        const others = r.players.filter((o) => o.id !== p.id && !o.bankrupt);
        if (others.length === 0) {
          p.money -= 100;
          return "Lost a $100 bet!";
        }
        // Pick a random target player
        const target = others[Math.floor(Math.random() * others.length)];
        target.money += 100;
        p.money -= 100;
        return `Lost a $100 bet with ${target.nickname}!`;
      }
    },
    {
      action: (p: Player, r: Room) => {
        p.money -= 150;
        r.bountyPool = (r.bountyPool || 100) + 150;
        return "Donated $150 to the victims affected by the flood.";
      }
    },
    {
      action: (p: Player) => {
        const initialPos = p.position;
        room.animationWaypoint = initialPos; // Record Twist tile as waypoint
        const steps = Math.floor(Math.random() * 3) + 1;
        const nextPos = initialPos + steps;
        p.position = nextPos;
        const currentTile = tileAt(nextPos);
        return `Found a shortcut! Advance ${steps} tiles to ${currentTile.name}.`;
      }
    },
    {
      action: (p: Player) => {
        const initialPos = p.position;
        room.animationWaypoint = initialPos; // Record Twist tile as waypoint
        const steps = Math.floor(Math.random() * 5) + 1;
        const nextPos = initialPos - steps;
        p.position = nextPos;
        const currentTile = tileAt(nextPos);
        return `Took a wrong path! Move back ${steps} tiles to ${currentTile.name}.`;
      }
    },
    {
      action: (p: Player) => {
        const initialPos = p.position;
        room.animationWaypoint = initialPos;
        const nextPos = 30; // Position for Prison;
        p.position = nextPos;
        return "Caught giving corruption! Sentence to Prison!";
      }
    },
    {
      action: (p: Player) => {
        const initialPos = p.position;
        room.animationWaypoint = initialPos;
        const nextPos = 0; // Position for Start;
        p.position = nextPos;
        p.money += 500
        addLog(room, "Send to START!!");
        return `${p.nickname} landed on Start and collected $500.`;
      }
    },
    {
      action: (p: Player, r: Room) => {
        const initialPos = p.position;
        room.animationWaypoint = initialPos;
        const choice = Math.floor(Math.random() * 2) + 1; // choice between spain or UK area
        let nextPos = 0;
        if (choice === 1) {
          nextPos = 10 + (Math.floor(Math.random() * 5) + 1); // surprise visit to spain area
        }
        else {
          nextPos = 30 - (Math.floor(Math.random() * 4) + 1); // surprise visit to UK area
        }
        p.position = nextPos;
        const currentTile = tileAt(nextPos);
        return `Suprise visit to ${currentTile.name}`;
      }
    }
  ];

  // Pick a random twist event and execute it
  const event = twistEvents[Math.floor(Math.random() * twistEvents.length)];
  const message = event.action(player, room);
  addLog(room, `🌀 [TWIST]: ${message}`);
}

/** Moves a player forward `steps` tiles: handles passing Start, tax tiles,
 * and auto-charging rent on an owned tile (waived between teammates). */
function movePlayer(room: Room, player: Player, steps: number): MoveResult {
  room.animationWaypoint = undefined;

  const prev = player.position;
  const next = (prev + steps) % 40;

  if (next < prev) {
    if (next === 0) {
      player.money += LAND_START_AMOUNT;
      addLog(room, `${player.nickname} landed on Start and collected $${LAND_START_AMOUNT}.`);
    } else {
      player.money += PASS_GO_AMOUNT;
      addLog(room, `${player.nickname} passed Start and collected $${PASS_GO_AMOUNT}.`);
    }
  }

  player.position = next;
  const tile = tileAt(next);
  addLog(room, `${player.nickname} landed on ${tile.name}.`);

  if (tile.kind === "twist") {
    handleTwist(room, player);
  }

  const finalTile = tileAt(player.position);

  if (finalTile.kind === "tax" && tile.taxAmount) {
    player.money -= tile.taxAmount;
    room.bountyPool = (room.bountyPool || 0) + tile.taxAmount;
    addLog(room, `${player.nickname} paid $${tile.taxAmount} for ${tile.name}.`);
  }

  if (finalTile.index === 4) {
    const taxAmount = Math.floor(player.money * 0.05)
    player.money -= taxAmount;
    room.bountyPool = (room.bountyPool || 0) + taxAmount;
    addLog(room, `${player.nickname} paid a 5% Income Tax of $${taxAmount}`);
  }

  if (finalTile.index === 20) {
    const winnings = room.bountyPool;
    player.money += winnings;
    player.onVacation = true;
    addLog(room, `🎉 [BOUNTY JACKPOT] ${player.nickname} landed on Vacation and collected the $${winnings} Bounty Pool!`);
    room.bountyPool = 100; // reset back to the initial pool
  }

  if (finalTile.kind === "treasure") {
    handleTreasure(room, player);
  }

  let purchasable = false;
  let creditorId: string | undefined;
  if (isPurchasable(finalTile)) {
    const ownerId = room.ownership[finalTile.index];
    if (!ownerId) {
      purchasable = true;
    } else if (ownerId !== player.id) {
      const owner = room.players.find((p) => p.id === ownerId);

      // Check if the owner is locked up in Holding (Prison)
      if (owner && owner.inJail) {
        addLog(room, `${player.nickname} landed on ${owner.nickname}'s property, but since ${owner.nickname} is in Holding, no rent is due!`);
      } else if (sameTeam(room, player.id, ownerId)) {
        addLog(room, `${player.nickname} owes no rent — same team.`);
      } else {
        const rent = computeRent(room, finalTile, ownerId, player.id);
        if (owner && rent > 0) {
          player.money -= rent;
          owner.money += rent;
          creditorId = owner.id;

          if (finalTile.kind === "utility") {
            addLog(room, `${player.nickname} paid $${rent} utility bill to ${owner.nickname}. $20 for each house and $40 for each hotel, ${player.nickname} owned!`);
          }
          else {
            addLog(room, `${player.nickname} paid $${rent} rent to ${owner.nickname}.`);
          }
        }
      }
    }
  }

  const goToJail = finalTile.kind === "jail" || player.position === JAIL_POSITION;
  const isWagerTile = finalTile.kind === "wager";
  const isVacationTile = finalTile.index === 20;

  return { goToJail, isWagerTile, isVacationTile, purchasable, creditorId };
}

function sendToJail(room: Room, player: Player) {
  player.position = JAIL_POSITION;
  player.inJail = true;
  player.jailTurns = 0;
  player.doublesCount = 0;
  player.prisonCount = (player.prisonCount || 0) + 1; // Increment counter
  addLog(room, `${player.nickname} was sent to Prison.`);
}

function currentPlayer(room: Room): Player {
  const id = room.turnOrder[room.currentTurnIndex];
  const player = room.players.find((p) => p.id === id);
  if (!player) throw new Error("Current turn player not found — room state is corrupt.");
  return player;
}

/** Applies a move's outcome to room.turnPhase: bankruptcy first (which may
 * end the game or move the turn along on its own), then "go to jail", then
 * the normal purchase-prompt / bonus-roll logic. */
function handlePostMove(room: Room, player: Player, result: MoveResult, phaseIfNoDecision: TurnPhase) {
  if (player.money < 0) {
    resolveDebt(room, player);
    if (player.bankrupt) {
      if (room.status !== "finished" && room.turnOrder.length > 0) {
        room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
        room.turnPhase = "rolling";
        room.lastRoll = null;
        room.pendingPostPurchasePhase = null;
      }
      return;
    }
  }

  if (result.goToJail) {
    sendToJail(room, player);
    room.turnPhase = "rolled";
    room.pendingPostPurchasePhase = null;
    return;
  }

  if (result.isWagerTile) {
    room.turnPhase = "awaiting-wager" as TurnPhase; // Pause turn to prompt player to bet
    room.pendingPostPurchasePhase = phaseIfNoDecision;
    return;
  }

  if (result.isVacationTile) {
    room.turnPhase = "rolled";
    room.pendingPostPurchasePhase = null;
    return;
  }

  resolvePhaseAfterMove(room, result, phaseIfNoDecision);
}

/** Applies a move's purchase outcome to room.turnPhase, stashing the phase
 * that should apply once the buy/pass decision resolves (e.g. a pending
 * doubles bonus roll). `phaseIfNoDecision` is what would happen with no
 * purchase prompt (e.g. "rolling" for a bonus roll, or "rolled"). */
function resolvePhaseAfterMove(room: Room, result: MoveResult, phaseIfNoDecision: TurnPhase) {
  if (result.purchasable) {
    room.turnPhase = "awaiting-purchase";
    room.pendingPostPurchasePhase = phaseIfNoDecision;
  } else {
    room.turnPhase = phaseIfNoDecision;
    room.pendingPostPurchasePhase = null;
  }
}

export function initializeGame(room: Room) {
  const order = [...room.players.map((p) => p.id)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  room.turnOrder = order;
  room.currentTurnIndex = 0;
  room.bountyPool = 100;
  room.turnPhase = "rolling";
  room.lastRoll = null;
  room.log = [];
  room.ownership = {};
  room.houses = {};
  room.mortgaged = {};
  room.trades = [];
  room.pendingPostPurchasePhase = null;
  room.winnerId = null;
  room.winnerTeamId = null;
  room.turnDeadline = null;

  room.players.forEach((p) => {
    p.money = room.settings.startingMoney;
    p.position = 0;
    p.inJail = false;
    p.jailTurns = 0;
    p.doublesCount = 0;
    p.bankrupt = false;
    p.prisonCount = 0;
    p.onVacation = false;
    p.freePassCount = 0;
  });

  const first = room.players.find((p) => p.id === order[0]);
  addLog(room, "The game has started.");
  if (first) addLog(room, `${first.nickname} goes first.`);
}

export function performRoll(room: Room, forcedDie1?: number, forcedDie2?: number) {
  const player = currentPlayer(room);
  // Use forced values if provided (for testing), otherwise roll randomly
  const die1 = forcedDie1 !== undefined ? forcedDie1 : randDie();
  const die2 = forcedDie2 !== undefined ? forcedDie2 : randDie();
  const isDoubles = die1 === die2;
  room.lastRoll = { die1, die2, isDoubles };
  addLog(room, `${player.nickname} rolled ${die1} and ${die2}${isDoubles ? " — doubles!" : ""}.`);

  if (player.inJail) {
    player.jailTurns += 1;
    const currentBail = (player.prisonCount || 1) * JAIL_BAIL; // Scaled bail: 50, 100, 150...

    if (isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      addLog(room, `${player.nickname} rolled doubles and left Holding.`);
      const result = movePlayer(room, player, die1 + die2);
      handlePostMove(room, player, result, "rolled");
    } else if (player.jailTurns >= 3) {
      player.inJail = false;
      player.jailTurns = 0;
      addLog(room, `${player.nickname} left Holding after 3 unsuccesfull tries and rolled the dice.`);
      const result = movePlayer(room, player, die1 + die2);
      handlePostMove(room, player, result, "rolled");
    } else {
      addLog(room, `${player.nickname} stayed in Holding (${player.jailTurns}/3 tries used).`);
      room.turnPhase = "rolled";
      room.pendingPostPurchasePhase = null;
    }
    return;
  }

  if (isDoubles) {
    player.doublesCount += 1;
    if (player.doublesCount >= 3) {
      sendToJail(room, player);
      addLog(room, `${player.nickname} rolled doubles three times in a row.`);
      room.turnPhase = "rolled";
      room.pendingPostPurchasePhase = null;
      return;
    }
  } else {
    player.doublesCount = 0;
  }

  const result = movePlayer(room, player, die1 + die2);
  handlePostMove(room, player, result, isDoubles ? "rolling" : "rolled");
}

export function playWager(room: Room, playerId: string, betAmount: number) {
  const player = currentPlayer(room);
  if (player.id !== playerId) throw new GameError("Not your turn.");
  if (player.money < betAmount) throw new GameError("Insufficient funds for this bet.");

  // Roll 2 dice for the wager
  const die1 = randDie();
  const die2 = randDie();
  const sum = die1 + die2;
  const isDoubles = die1 === die2;

  // trigger the dice animation after entering bet
  room.lastRoll = { die1, die2, isDoubles }

  if (sum >= 8) {
    // Win: Double wager back (profit = betAmount)
    player.money += betAmount;
    addLog(room, `[WAGER WIN] ${player.nickname} rolled ${die1}+${die2}=${sum} (8-12) and won $${betAmount * 2}!`);
  } else {
    // Lose: Deduct bet
    player.money -= betAmount;
    room.bountyPool = (room.bountyPool || 0) + betAmount;
    addLog(room, `[WAGER LOSS] ${player.nickname} rolled ${die1}+${die2}=${sum} (1-7) and lost $${betAmount}.`);
  }

  // Resume normal post-landing flow
  room.turnPhase = room.pendingPostPurchasePhase ?? "rolled";
  room.pendingPostPurchasePhase = null;
}

export function skipWager(room: Room, playerId: string) {
  const player = currentPlayer(room);
  addLog(room, `${player.nickname} chose not to wager.`);
  room.turnPhase = room.pendingPostPurchasePhase ?? "rolled";
  room.pendingPostPurchasePhase = null;
}

export function payBailAndRoll(room: Room) {
  const player = currentPlayer(room);
  const currentBail = (player.prisonCount || 1) * JAIL_BAIL; // Scaled bail calculation

  player.money -= currentBail;
  room.bountyPool = (room.bountyPool || 0) + currentBail;
  player.inJail = false;
  player.jailTurns = 0;
  addLog(room, `${player.nickname} paid $${currentBail} to leave Holding early.`);

  const die1 = randDie();
  const die2 = randDie();
  const isDoubles = die1 === die2;
  room.lastRoll = { die1, die2, isDoubles };
  addLog(room, `${player.nickname} rolled ${die1} and ${die2}${isDoubles ? " — doubles!" : ""}.`);
  player.doublesCount = isDoubles ? 1 : 0;

  const result = movePlayer(room, player, die1 + die2);
  handlePostMove(room, player, result, isDoubles ? "rolling" : "rolled");
}

export function useFreePassAndRoll(room: Room) {
  const player = currentPlayer(room);

  player.freePassCount -= 1;
  player.inJail = false;
  player.jailTurns = 0;
  addLog(room, `${player.nickname} used a Royal Amnesty Free Pass to escape Holding without paying bail!`);

  const die1 = randDie();
  const die2 = randDie();
  const isDoubles = die1 === die2;
  room.lastRoll = { die1, die2, isDoubles };
  addLog(room, `${player.nickname} rolled ${die1} and ${die2}${isDoubles ? " — doubles!" : ""}.`);
  player.doublesCount = isDoubles ? 1 : 0;

  const result = movePlayer(room, player, die1 + die2);
  handlePostMove(room, player, result, isDoubles ? "rolling" : "rolled");
}

export function buyCurrentTile(room: Room) {
  const player = currentPlayer(room);
  const tile = tileAt(player.position);
  if (!isPurchasable(tile) || room.ownership[tile.index]) {
    throw new GameError("Nothing to buy here.");
  }
  const price = tile.price ?? 0;
  if (player.money < price) throw new GameError("You can't afford that.");

  player.money -= price;
  room.ownership[tile.index] = player.id;
  addLog(room, `${player.nickname} bought ${tile.name} for $${price}.`);
  room.turnPhase = room.pendingPostPurchasePhase ?? "rolled";
  room.pendingPostPurchasePhase = null;
}

export function passCurrentPurchase(room: Room) {
  const player = currentPlayer(room);
  const tile = tileAt(player.position);
  addLog(room, `${player.nickname} passed on buying ${tile.name}.`);
  room.turnPhase = room.pendingPostPurchasePhase ?? "rolled";
  room.pendingPostPurchasePhase = null;
}

export function buildHouse(room: Room, playerId: string, tileIndex: number) {
  const tile = tileAt(tileIndex);
  const check = checkCanBuildHouse(room, tile, playerId);
  if (!check.ok) throw new GameError(check.reason ?? "Can't build there.");

  const player = room.players.find((p) => p.id === playerId)!;
  const current = room.houses[tileIndex] ?? 0;
  player.money -= check.cost!;
  room.houses[tileIndex] = current + 1;
  addLog(room, `${player.nickname} built ${current + 1 === 5 ? "a hotel" : "a house"} on ${tile.name}.`);
}

export function sellHouse(room: Room, playerId: string, tileIndex: number) {
  const tile = tileAt(tileIndex);
  const check = checkCanSellHouse(room, tile, playerId);
  if (!check.ok) throw new GameError(check.reason ?? "Can't sell there.");

  const player = room.players.find((p) => p.id === playerId)!;
  const current = room.houses[tileIndex] ?? 0;
  player.money += check.cost!;
  room.houses[tileIndex] = current - 1;
  addLog(room, `${player.nickname} sold ${current === 5 ? "a hotel" : "a house"} on ${tile.name} for $${check.cost}.`);
}

export function mortgageTile(room: Room, playerId: string, tileIndex: number) {
  const tile = tileAt(tileIndex);
  const check = checkCanMortgage(room, tile, playerId);
  if (!check.ok) throw new GameError(check.reason ?? "Can't mortgage that.");

  const player = room.players.find((p) => p.id === playerId)!;
  room.mortgaged[tileIndex] = true;
  player.money += check.amount!;
  addLog(room, `${player.nickname} mortgaged ${tile.name} for $${check.amount}.`);
}

export function unmortgageTile(room: Room, playerId: string, tileIndex: number) {
  const tile = tileAt(tileIndex);
  const check = checkCanUnmortgage(room, tile, playerId);
  if (!check.ok) throw new GameError(check.reason ?? "Can't unmortgage that.");

  const player = room.players.find((p) => p.id === playerId)!;
  player.money -= check.amount!;
  room.mortgaged[tileIndex] = false;
  addLog(room, `${player.nickname} paid $${check.amount} to unmortgage ${tile.name}.`);
}

export function endTurn(room: Room) {
  const finishing = currentPlayer(room);
  finishing.doublesCount = 0;

  let loops = 0;
  while (loops < room.turnOrder.length) {
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    const nextPlayer = currentPlayer(room);
    if (nextPlayer.onVacation) {
      nextPlayer.onVacation = false; // Consume skip turn
      addLog(room, `${nextPlayer.nickname} is resting on Vacation and skips their turn.`);
      loops++;
      continue;
    }
    break;
  }

  room.turnPhase = "rolling";
  room.lastRoll = null;
  room.pendingPostPurchasePhase = null;
  const next = currentPlayer(room);
  addLog(room, `It's ${next.nickname}'s turn.`);
}

export function isCurrentTurn(room: Room, playerId: string): boolean {
  return room.turnOrder[room.currentTurnIndex] === playerId;
}

/** Forces the given player's turn to completion on their behalf (used by
 * the turn timer and the disconnected-player auto-skip). Rolls if needed
 * (repeatedly, to burn through any bonus doubles rolls), auto-passes any
 * purchase decision, then ends the turn. Stops early if the player is no
 * longer the current player (e.g. they went bankrupt mid-roll) or the game
 * ended, since a fresh timer/skip will apply to whoever is current now. */
export function forceCompleteTurn(room: Room, playerId: string) {
  let iterations = 0;
  while (iterations < 10 && room.status !== "finished" && room.turnOrder[room.currentTurnIndex] === playerId) {
    iterations++;
    if (room.turnPhase === "rolling") {
      performRoll(room);
    } else if (room.turnPhase === "awaiting-purchase") {
      passCurrentPurchase(room);
    } else if (room.turnPhase === "rolled") {
      endTurn(room);
      return;
    } else {
      return;
    }
  }
}

// --- Trading -----------------------------------------------------------

function validateTradeSide(room: Room, ownerId: string, side: TradeSide, label: string) {
  if (side.money < 0) throw new GameError(`${label} amount can't be negative.`);
  for (const tileIndex of side.tiles) {
    const tile = tileAt(tileIndex);
    if (room.ownership[tileIndex] !== ownerId) {
      throw new GameError(`${label === "Offer" ? "You don't" : "They don't"} own ${tile.name}.`);
    }
    if ((room.houses[tileIndex] ?? 0) > 0) {
      throw new GameError(`Sell the houses on ${tile.name} before trading it.`);
    }
    if (room.mortgaged[tileIndex]) {
      throw new GameError(`${tile.name} is mortgaged — unmortgage it before trading.`);
    }
  }
}

function pruneInvalidTrades(room: Room) {
  room.trades = room.trades.filter((trade) => {
    const fromPlayer = room.players.find((p) => p.id === trade.fromId);
    const toPlayer = room.players.find((p) => p.id === trade.toId);

    if (!fromPlayer || !toPlayer || fromPlayer.bankrupt || toPlayer.bankrupt) {
      return false;
    }

    if (fromPlayer.money < trade.offer.money || toPlayer.money < trade.request.money) {
      return false;
    }

    const fromStillOwnsAll = trade.offer.tiles.every(
      (tileIdx) => room.ownership[tileIdx] === fromPlayer.id && (room.houses[tileIdx] ?? 0) === 0 && !room.mortgaged[tileIdx]
    );

    const toStillOwnsAll = trade.request.tiles.every(
      (tileIdx) => room.ownership[tileIdx] === toPlayer.id && (room.houses[tileIdx] ?? 0) === 0 && !room.mortgaged[tileIdx]
    );

    if (!fromStillOwnsAll || !toStillOwnsAll) {
      addLog(room, `An active trade between ${fromPlayer.nickname} and ${toPlayer.nickname} automatically fell through (property no longer available).`);
      return false;
    }

    return true;
  });
}

export function createTrade(room: Room, fromId: string, toId: string, offer: TradeSide, request: TradeSide): TradeOffer {
  if (fromId === toId) throw new GameError("You can't trade with yourself.");
  const fromPlayer = room.players.find((p) => p.id === fromId);
  const toPlayer = room.players.find((p) => p.id === toId);
  if (!fromPlayer || !toPlayer) throw new GameError("Player not found.");

  validateTradeSide(room, fromId, offer, "Offer");
  validateTradeSide(room, toId, request, "Request");

  if (offer.money === 0 && request.money === 0 && offer.tiles.length === 0 && request.tiles.length === 0) {
    throw new GameError("That trade doesn't offer or request anything.");
  }

  const trade: TradeOffer = {
    id: randomUUID(),
    fromId,
    toId,
    offer: { money: offer.money, tiles: [...offer.tiles] },
    request: { money: request.money, tiles: [...request.tiles] },
    createdAt: Date.now(),
  };
  room.trades.push(trade);
  addLog(room, `${fromPlayer.nickname} proposed a trade with ${toPlayer.nickname}.`);
  return trade;
}

export function resolveTrade(room: Room, playerId: string, tradeId: string, accept: boolean) {
  const idx = room.trades.findIndex((t) => t.id === tradeId);
  if (idx === -1) throw new GameError("That trade no longer exists.");
  const trade = room.trades[idx];
  if (trade.toId !== playerId) throw new GameError("Only the recipient can respond to this trade.");

  const fromPlayer = room.players.find((p) => p.id === trade.fromId);
  const toPlayer = room.players.find((p) => p.id === trade.toId);

  if (!accept) {
    room.trades.splice(idx, 1);
    addLog(room, `${toPlayer?.nickname ?? "Player"} declined a trade from ${fromPlayer?.nickname ?? "player"}.`);
    return;
  }

  const tilesStillValid = (side: TradeSide, ownerId: string) =>
    side.tiles.every((t) => room.ownership[t] === ownerId && (room.houses[t] ?? 0) === 0 && !room.mortgaged[t]);

  const stillValid =
    Boolean(fromPlayer) &&
    Boolean(toPlayer) &&
    tilesStillValid(trade.offer, trade.fromId) &&
    tilesStillValid(trade.request, trade.toId) &&
    fromPlayer!.money >= trade.offer.money &&
    toPlayer!.money >= trade.request.money;

  room.trades.splice(idx, 1);

  if (!stillValid || !fromPlayer || !toPlayer) {
    addLog(room, `The trade between ${fromPlayer?.nickname ?? "a player"} and ${toPlayer?.nickname ?? "a player"} fell through.`);
    return;
  }

  fromPlayer.money = fromPlayer.money - trade.offer.money + trade.request.money;
  toPlayer.money = toPlayer.money - trade.request.money + trade.offer.money;
  trade.offer.tiles.forEach((t) => (room.ownership[t] = trade.toId));
  trade.request.tiles.forEach((t) => (room.ownership[t] = trade.fromId));
  addLog(room, `${fromPlayer.nickname} and ${toPlayer.nickname} completed a trade.`);

  // --- AUTOMATICALLY PRUNE ANY OTHER CONFLICTING TRADES ---
  pruneInvalidTrades(room);
}

export function withdrawTrade(room: Room, playerId: string, tradeId: string) {
  const idx = room.trades.findIndex((t) => t.id === tradeId);
  if (idx === -1) throw new GameError("That trade no longer exists.");
  const trade = room.trades[idx];
  if (trade.fromId !== playerId) throw new GameError("Only the proposer can cancel this trade.");
  room.trades.splice(idx, 1);
  const player = room.players.find((p) => p.id === playerId);
  addLog(room, `${player?.nickname ?? "Player"} cancelled a trade offer.`);
}

// --- Chat ----------------------------------------------------------------

export function postChatMessage(room: Room, player: Player, text: string) {
  // --- QUICK DEBUG COMMANDS FOR TESTING ---
  if (text.startsWith("/roll ")) {
    const parts = text.split(" ");
    const d1 = parseInt(parts[1], 10);
    const d2 = parseInt(parts[2], 10);
    if (!isNaN(d1) && !isNaN(d2)) {
      performRoll(room, d1, d2);
      return;
    }
  }
  // ----------------------------------------

  const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
  if (!trimmed) throw new GameError("Message can't be empty.");
  const message: ChatMessage = {
    id: randomUUID(),
    playerId: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    text: trimmed,
    ts: Date.now(),
  };
  room.chatMessages.push(message);
  if (room.chatMessages.length > MAX_CHAT_ENTRIES) {
    room.chatMessages.splice(0, room.chatMessages.length - MAX_CHAT_ENTRIES);
  }
}

// --- Bankruptcy & win conditions ------------------------------------------
function teamName(room: Room, teamId: TeamId | null): string {
  return room.teams.find((t) => t.id === teamId)?.name ?? "A team";
}

function checkWinCondition(room: Room) {
  const active = room.players.filter((p) => !p.bankrupt);

  if (room.mode === "teams") {
    const activeTeamIds = new Set(active.map((p) => p.teamId).filter((t): t is TeamId => t !== null));
    if (activeTeamIds.size <= 1) {
      room.status = "finished";
      room.winnerTeamId = [...activeTeamIds][0] ?? null;
      addLog(room, `Game over — ${teamName(room, room.winnerTeamId)} wins!`);
    }
    return;
  }

  if (active.length <= 1) {
    room.status = "finished";
    room.winnerId = active[0]?.id ?? null;
    addLog(room, `Game over — ${active[0]?.nickname ?? "someone"} wins!`);
  }
}

function executeBankruptcy(room: Room, player: Player, creditorId: string | null) {
  player.bankrupt = true;
  addLog(room, `${player.nickname} went bankrupt!`);

  const ownedTiles = BOARD.filter((t) => room.ownership[t.index] === player.id).map((t) => t.index);
  const creditor = creditorId ? room.players.find((p) => p.id === creditorId && !p.bankrupt) : undefined;

  if (creditor) {
    ownedTiles.forEach((i) => {
      room.ownership[i] = creditor.id;
      room.houses[i] = 0;
      room.mortgaged[i] = false;
    });
    addLog(room, `${creditor.nickname} received ${player.nickname}'s remaining properties.`);
  } else {
    ownedTiles.forEach((i) => {
      delete room.ownership[i];
      room.houses[i] = 0;
      room.mortgaged[i] = false;
    });
    if (ownedTiles.length > 0) addLog(room, `${player.nickname}'s properties returned to the bank.`);
  }

  player.money = 0;
  room.turnOrder = room.turnOrder.filter((id) => id !== player.id);

  checkWinCondition(room);
}

function resolveDebt(room: Room, player: Player) {
  if (player.money < 0) {
    addLog(room, `${player.nickname} is in debt ($${player.money})! Must clear balance or declare bankruptcy.`);
  }
}

export function declareBankruptcy(room: Room, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Player not found.");
  if (player.bankrupt) throw new GameError("You're already out of the game.");

  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  executeBankruptcy(room, player, null);

  if (room.status === "finished" || room.turnOrder.length === 0) return;

  if (currentPlayerId === playerId) {
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
    room.turnPhase = "rolling";
    room.lastRoll = null;
    room.pendingPostPurchasePhase = null;
  } else {
    const newIndex = room.turnOrder.indexOf(currentPlayerId);
    if (newIndex !== -1) room.currentTurnIndex = newIndex;
  }
}
