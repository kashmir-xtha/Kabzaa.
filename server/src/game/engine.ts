import { randomUUID } from "node:crypto";
import type { ChatMessage, Player, Room, TeamId, TradeOffer, TradeSide, TurnPhase } from "../types/index.js";
import { GameError } from "../utils/errors.js";
import { BOARD, JAIL_BAIL, JAIL_POSITION, PASS_GO_AMOUNT, groupHouseCost, tileAt } from "./board.js";
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
  purchasable: boolean;
  /** Player who rent was paid to, if any — used to hand assets to the right
   * creditor if this move ends up bankrupting the mover. */
  creditorId?: string;
}

/** Moves a player forward `steps` tiles: handles passing Start, tax tiles,
 * and auto-charging rent on an owned tile (waived between teammates). */
function movePlayer(room: Room, player: Player, steps: number): MoveResult {
  const prev = player.position;
  const next = (prev + steps) % 40;

  if (next < prev) {
    player.money += PASS_GO_AMOUNT;
    addLog(room, `${player.nickname} passed Start and collected $${PASS_GO_AMOUNT}.`);
  }

  player.position = next;
  const tile = tileAt(next);
  addLog(room, `${player.nickname} landed on ${tile.name}.`);

  if (tile.kind === "tax" && tile.taxAmount) {
    player.money -= tile.taxAmount;
    addLog(room, `${player.nickname} paid $${tile.taxAmount} for ${tile.name}.`);
  }

  let purchasable = false;
  let creditorId: string | undefined;
  if (isPurchasable(tile)) {
    const ownerId = room.ownership[tile.index];
    if (!ownerId) {
      purchasable = true;
    } else if (ownerId !== player.id) {
      if (sameTeam(room, player.id, ownerId)) {
        addLog(room, `${player.nickname} owes no rent — same team.`);
      } else {
        const owner = room.players.find((p) => p.id === ownerId);
        const rent = computeRent(room, tile, ownerId);
        if (owner && rent > 0) {
          player.money -= rent;
          owner.money += rent;
          creditorId = owner.id;
          addLog(room, `${player.nickname} paid $${rent} rent to ${owner.nickname}.`);
        }
      }
    }
  }

  return { goToJail: tile.kind === "goToJail", purchasable, creditorId };
}

function sendToJail(room: Room, player: Player) {
  player.position = JAIL_POSITION;
  player.inJail = true;
  player.jailTurns = 0;
  player.doublesCount = 0;
  addLog(room, `${player.nickname} was sent to Holding.`);
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
    resolveDebt(room, player, result.creditorId ?? null);
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
  });

  const first = room.players.find((p) => p.id === order[0]);
  addLog(room, "The game has started.");
  if (first) addLog(room, `${first.nickname} goes first.`);
}

export function performRoll(room: Room) {
  const player = currentPlayer(room);
  const die1 = randDie();
  const die2 = randDie();
  const isDoubles = die1 === die2;
  room.lastRoll = { die1, die2, isDoubles };
  addLog(room, `${player.nickname} rolled ${die1} and ${die2}${isDoubles ? " — doubles!" : ""}.`);

  if (player.inJail) {
    player.jailTurns += 1;
    if (isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      addLog(room, `${player.nickname} rolled doubles and left Holding.`);
      const result = movePlayer(room, player, die1 + die2);
      handlePostMove(room, player, result, "rolled");
    } else if (player.jailTurns >= 3) {
      player.money -= JAIL_BAIL;
      player.inJail = false;
      player.jailTurns = 0;
      addLog(room, `${player.nickname} paid $${JAIL_BAIL} bail after 3 tries and left Holding.`);
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

export function payBailAndRoll(room: Room) {
  const player = currentPlayer(room);
  player.money -= JAIL_BAIL;
  player.inJail = false;
  player.jailTurns = 0;
  addLog(room, `${player.nickname} paid $${JAIL_BAIL} to leave Holding early.`);

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
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
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

/** Sells houses (highest tile first) and mortgages properties (highest
 * price first) until the player's balance is non-negative or they're out
 * of assets. Bypasses the normal even-building UI rules since this is a
 * forced survival sale, not a voluntary player action. */
function liquidateAssets(room: Room, player: Player) {
  while (player.money < 0) {
    const candidates = BOARD.filter(
      (t) => t.kind === "property" && room.ownership[t.index] === player.id && (room.houses[t.index] ?? 0) > 0
    );
    if (candidates.length === 0) break;
    candidates.sort((a, b) => (room.houses[b.index] ?? 0) - (room.houses[a.index] ?? 0));
    const tile = candidates[0];
    const cost = groupHouseCost(tile.group);
    const refund = Math.floor(cost / 2);
    room.houses[tile.index] = (room.houses[tile.index] ?? 0) - 1;
    player.money += refund;
    addLog(room, `${player.nickname} sold a house on ${tile.name} for $${refund} to cover debt.`);
  }

  while (player.money < 0) {
    const candidates = BOARD.filter(
      (t) => isPurchasable(t) && room.ownership[t.index] === player.id && !room.mortgaged[t.index] && (room.houses[t.index] ?? 0) === 0
    );
    if (candidates.length === 0) break;
    candidates.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    const tile = candidates[0];
    const amount = Math.floor((tile.price ?? 0) / 2);
    room.mortgaged[tile.index] = true;
    player.money += amount;
    addLog(room, `${player.nickname} mortgaged ${tile.name} for $${amount} to cover debt.`);
  }
}

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

function resolveDebt(room: Room, player: Player, creditorId: string | null) {
  if (player.money >= 0) return;
  liquidateAssets(room, player);
  if (player.money < 0) executeBankruptcy(room, player, creditorId);
}

export function declareBankruptcy(room: Room, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Player not found.");
  if (player.bankrupt) throw new GameError("You're already out of the game.");

  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  executeBankruptcy(room, player, null);

  if (room.status === "finished" || room.turnOrder.length === 0) return;

  if (currentPlayerId === playerId) {
    // The current player forfeited — whoever slid into their old array slot
    // (or index 0 if they were last) becomes current for a fresh turn.
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
    room.turnPhase = "rolling";
    room.lastRoll = null;
    room.pendingPostPurchasePhase = null;
  } else {
    // Someone else forfeited off-turn — keep pointing at the same current
    // player, just re-find their index since the array may have shifted.
    const newIndex = room.turnOrder.indexOf(currentPlayerId);
    if (newIndex !== -1) room.currentTurnIndex = newIndex;
  }
}
