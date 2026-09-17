import { randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  MIN_PLAYERS_TO_START,
  type GameMode,
  type GameSettings,
  type Player,
  type Room,
  type Team,
  type TeamId,
  type TradeSide,
} from "../types/index.js";
import { generateRoomCode } from "../utils/roomCode.js";
import { endTurn, initializeGame, payBailAndRoll, performRoll, buyCurrentTile, passCurrentPurchase, buildHouse, sellHouse, createTrade, resolveTrade, withdrawTrade, mortgageTile, unmortgageTile, declareBankruptcy, postChatMessage, forceCompleteTurn } from "../game/engine.js";
import { JAIL_BAIL } from "../game/board.js";
import { GameError } from "../utils/errors.js";
import { isValidAvatar, pickUnusedAvatar } from "../utils/avatars.js";

export { GameError };

const MAX_PLAYERS_PER_TEAM = 3;
// A disconnected player's seat is held for this long before the room is
// allowed to fully forget them (still counted against maxPlayers so they
// can reconnect, but eligible for host migration immediately).
const DISCONNECT_GRACE_MS = 2 * 60 * 1000;
// If it becomes a disconnected player's turn mid-game, how long to wait
// before playing it out for them automatically (independent of the
// optional, host-configurable turn timer).
const DISCONNECT_TURN_SKIP_MS = 20 * 1000;

interface Connection {
  roomCode: string;
  playerId: string;
}

/**
 * Owns all live rooms in memory. This is intentionally the single
 * authoritative source of room/lobby truth — socket handlers call into
 * this class, never mutate room objects directly.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToConnection = new Map<string, Connection>();
  private playerToSocket = new Map<string, string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  /** Per-room turn timer (only active once a game is in progress and the
   * host has turned it on). Tracks which player it was set for so we only
   * reschedule when the current turn actually changes. */
  private turnTimers = new Map<string, { timeout: NodeJS.Timeout; playerId: string }>();
  /** Per-room "auto-skip if the current player is disconnected" timer —
   * independent of the optional turn timer setting, this is a baseline
   * robustness measure so a dropped connection never stalls the game
   * forever. */
  private disconnectSkipTimers = new Map<string, NodeJS.Timeout>();

  /** Set by index.ts so timers (which fire outside of any socket request)
   * can still push the resulting room state to everyone. */
  onBroadcast?: (room: Room) => void;

  createRoom(nickname: string, socketId: string): { room: Room; player: Player } {
    const code = this.uniqueRoomCode();
    const player = this.buildPlayer(nickname, pickUnusedAvatar([]), true);

    const room: Room = {
      code,
      status: "lobby",
      mode: "casual",
      hostId: player.id,
      players: [player],
      teams: [],
      settings: { ...DEFAULT_SETTINGS },
      createdAt: Date.now(),
      turnOrder: [],
      currentTurnIndex: 0,
      turnPhase: "rolling",
      lastRoll: null,
      log: [],
      ownership: {},
      houses: {},
      trades: [],
      pendingPostPurchasePhase: null,
      chatMessages: [],
      mortgaged: {},
      winnerId: null,
      winnerTeamId: null,
      turnDeadline: null,
    };

    this.rooms.set(code, room);
    this.registerConnection(socketId, code, player.id);
    return { room, player };
  }

  joinRoom(codeInput: string, nickname: string, socketId: string): { room: Room; player: Player } {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new GameError("That room code doesn't exist.");
    if (room.status !== "lobby") throw new GameError("That game has already started.");
    if (room.players.length >= room.settings.maxPlayers) throw new GameError("That room is full.");

    const uniqueNickname = this.dedupeNickname(room, nickname);
    const avatar = pickUnusedAvatar(room.players.map((p) => p.avatar));
    const player = this.buildPlayer(uniqueNickname, avatar, false);
    room.players.push(player);

    this.registerConnection(socketId, code, player.id);
    return { room, player };
  }

  /** Restores a session after a page refresh, keyed by the identity localStorage kept client-side. */
  rejoinRoom(codeInput: string, playerId: string, socketId: string): { room: Room; player: Player } {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new GameError("That room no longer exists.");
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new GameError("You're not part of that room anymore.");

    player.connected = true;
    this.clearDisconnectTimer(player.id);
    this.clearDisconnectSkip(room.code);
    this.registerConnection(socketId, code, player.id);
    return { room, player };
  }

  leaveRoom(socketId: string): { room: Room | null; code: string | null } {
    const conn = this.socketToConnection.get(socketId);
    if (!conn) return { room: null, code: null };
    const room = this.rooms.get(conn.roomCode);
    this.forgetSocket(socketId);
    if (!room) return { room: null, code: null };

    if (room.status === "in_progress") {
      const player = room.players.find((p) => p.id === conn.playerId);
      if (player && !player.bankrupt) {
        try {
          declareBankruptcy(room, player.id);
        } catch {
          // Already handled/edge case — fall through to removal regardless.
        }
      }
    }

    room.players = room.players.filter((p) => p.id !== conn.playerId);
    this.reassignTeamsAfterLeave(room);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      this.clearTurnTimer(room.code);
      this.clearDisconnectSkip(room.code);
      return { room: null, code: conn.roomCode };
    }

    if (room.hostId === conn.playerId) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }

    this.scheduleTurnTimer(room);
    return { room, code: conn.roomCode };
  }

  /** Called on socket disconnect (tab close, refresh, network drop) — distinct from an explicit "leave". */
  handleDisconnect(socketId: string): { room: Room | null; code: string | null; playerId: string | null } {
    const conn = this.socketToConnection.get(socketId);
    if (!conn) return { room: null, code: null, playerId: null };
    const room = this.rooms.get(conn.roomCode);
    this.playerToSocket.delete(conn.playerId);
    this.socketToConnection.delete(socketId);
    if (!room) return { room: null, code: null, playerId: null };

    const player = room.players.find((p) => p.id === conn.playerId);
    if (player) player.connected = false;

    if (room.hostId === conn.playerId) {
      const nextHost = room.players.find((p) => p.connected && p.id !== conn.playerId);
      if (nextHost) {
        room.hostId = nextHost.id;
        room.players.forEach((p) => (p.isHost = p.id === nextHost.id));
      }
    }

    // Give the player a grace window to reconnect before we drop their seat
    // for good (only applies while still in the lobby).
    const timer = setTimeout(() => {
      const stillThere = this.rooms.get(conn.roomCode);
      if (!stillThere || stillThere.status !== "lobby") return;
      stillThere.players = stillThere.players.filter((p) => p.id !== conn.playerId || p.connected);
      this.reassignTeamsAfterLeave(stillThere);
      if (stillThere.players.length === 0) this.rooms.delete(conn.roomCode);
    }, DISCONNECT_GRACE_MS);
    this.disconnectTimers.set(conn.playerId, timer);

    if (room.status === "in_progress" && room.turnOrder[room.currentTurnIndex] === conn.playerId) {
      this.scheduleDisconnectSkip(room, conn.playerId);
    }

    return { room, code: conn.roomCode, playerId: conn.playerId };
  }

  setReady(socketId: string, ready: boolean): Room {
    const { room, player } = this.requirePlayer(socketId);
    player.ready = ready;
    return room;
  }

  selectMode(socketId: string, mode: GameMode): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireHost(room, player);
    room.mode = mode;
    room.teams = mode === "teams" ? this.buildEmptyTeams() : [];
    room.players.forEach((p) => (p.teamId = null));
    return room;
  }

  selectTeam(socketId: string, teamId: TeamId): Room {
    const { room, player } = this.requirePlayer(socketId);
    if (room.mode !== "teams") throw new GameError("Switch to Teams mode first.");
    const team = room.teams.find((t) => t.id === teamId);
    if (!team) throw new GameError("That team doesn't exist.");
    if (team.memberIds.length >= MAX_PLAYERS_PER_TEAM && !team.memberIds.includes(player.id)) {
      throw new GameError("That team is full.");
    }
    room.teams.forEach((t) => (t.memberIds = t.memberIds.filter((id) => id !== player.id)));
    team.memberIds.push(player.id);
    player.teamId = teamId;
    return room;
  }

  selectAvatar(socketId: string, avatar: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    if (room.status !== "lobby") throw new GameError("You can only change your avatar in the lobby.");
    if (!isValidAvatar(avatar)) throw new GameError("Pick a valid avatar.");
    const takenBySomeoneElse = room.players.some((p) => p.id !== player.id && p.avatar === avatar);
    if (takenBySomeoneElse) throw new GameError("Someone already has that avatar.");
    player.avatar = avatar;
    return room;
  }

  changeSettings(socketId: string, partial: Partial<GameSettings>): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireHost(room, player);

    if (partial.maxPlayers !== undefined) {
      const next = Math.max(2, Math.min(6, Math.floor(partial.maxPlayers)));
      if (next < room.players.length) {
        throw new GameError("Can't set max players below the number already in the room.");
      }
      room.settings.maxPlayers = next;
    }
    if (partial.startingMoney !== undefined) {
      room.settings.startingMoney = Math.max(500, Math.min(10000, Math.floor(partial.startingMoney)));
    }
    if (partial.doublesGiveExtraTurn !== undefined) {
      room.settings.doublesGiveExtraTurn = Boolean(partial.doublesGiveExtraTurn);
    }
    if (partial.auctionEnabled !== undefined) {
      room.settings.auctionEnabled = Boolean(partial.auctionEnabled);
    }
    if (partial.turnTimerEnabled !== undefined) {
      room.settings.turnTimerEnabled = Boolean(partial.turnTimerEnabled);
    }
    if (partial.turnTimerSeconds !== undefined) {
      room.settings.turnTimerSeconds = Math.max(15, Math.min(180, Math.floor(partial.turnTimerSeconds)));
    }
    return room;
  }

  startGame(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireHost(room, player);
    if (room.players.length < MIN_PLAYERS_TO_START) {
      throw new GameError(`You need at least ${MIN_PLAYERS_TO_START} players to start.`);
    }
    if (!room.players.every((p) => p.ready)) {
      throw new GameError("Everyone needs to be ready first.");
    }
    if (room.mode === "teams") {
      const unassigned = room.players.some((p) => p.teamId === null);
      if (unassigned) throw new GameError("Everyone needs to join a team first.");
      if (room.teams.some((t) => t.memberIds.length === 0)) {
        throw new GameError("Both teams need at least one player.");
      }
    }
    room.status = "in_progress";
    initializeGame(room);
    this.scheduleTurnTimer(room);
    return room;
  }

  rollDice(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    this.requireCurrentTurn(room, player);
    if (room.turnPhase !== "rolling") throw new GameError("You've already rolled — end your turn.");
    performRoll(room);
    this.scheduleTurnTimer(room);
    return room;
  }

  payBail(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    this.requireCurrentTurn(room, player);
    if (room.turnPhase !== "rolling") throw new GameError("You've already rolled this turn.");
    if (!player.inJail) throw new GameError("You're not in Holding.");
    if (player.money < JAIL_BAIL) throw new GameError("You can't afford the bail.");
    payBailAndRoll(room);
    this.scheduleTurnTimer(room);
    return room;
  }

  endPlayerTurn(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    this.requireCurrentTurn(room, player);
    if (room.turnPhase !== "rolled") throw new GameError("Roll the dice first.");
    endTurn(room);
    this.scheduleTurnTimer(room);
    return room;
  }

  buyProperty(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    this.requireCurrentTurn(room, player);
    if (room.turnPhase !== "awaiting-purchase") throw new GameError("There's nothing to buy right now.");
    buyCurrentTile(room);
    this.scheduleTurnTimer(room);
    return room;
  }

  passPurchase(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    this.requireCurrentTurn(room, player);
    if (room.turnPhase !== "awaiting-purchase") throw new GameError("There's nothing to decide right now.");
    passCurrentPurchase(room);
    this.scheduleTurnTimer(room);
    return room;
  }

  buildHouseOn(socketId: string, tileIndex: number): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    buildHouse(room, player.id, tileIndex);
    return room;
  }

  sellHouseOn(socketId: string, tileIndex: number): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    sellHouse(room, player.id, tileIndex);
    return room;
  }

  mortgageOn(socketId: string, tileIndex: number): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    mortgageTile(room, player.id, tileIndex);
    return room;
  }

  unmortgageOn(socketId: string, tileIndex: number): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    unmortgageTile(room, player.id, tileIndex);
    return room;
  }

  forfeitGame(socketId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    declareBankruptcy(room, player.id);
    this.scheduleTurnTimer(room);
    return room;
  }

  sendChat(socketId: string, text: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    postChatMessage(room, player, text);
    return room;
  }

  proposeTrade(socketId: string, toId: string, offer: TradeSide, request: TradeSide): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    createTrade(room, player.id, toId, offer, request);
    return room;
  }

  respondToTrade(socketId: string, tradeId: string, accept: boolean): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    resolveTrade(room, player.id, tradeId, accept);
    return room;
  }

  cancelTradeOffer(socketId: string, tradeId: string): Room {
    const { room, player } = this.requirePlayer(socketId);
    this.requireInProgress(room);
    withdrawTrade(room, player.id, tradeId);
    return room;
  }

  getRoomByCode(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  // --- internals -----------------------------------------------------

  private requirePlayer(socketId: string): { room: Room; player: Player } {
    const conn = this.socketToConnection.get(socketId);
    if (!conn) throw new GameError("You're not connected to a room.");
    const room = this.rooms.get(conn.roomCode);
    if (!room) throw new GameError("That room no longer exists.");
    const player = room.players.find((p) => p.id === conn.playerId);
    if (!player) throw new GameError("You're not part of that room anymore.");
    return { room, player };
  }

  private requireHost(room: Room, player: Player) {
    if (room.hostId !== player.id) throw new GameError("Only the host can do that.");
  }

  private requireInProgress(room: Room) {
    if (room.status !== "in_progress") throw new GameError("The game hasn't started yet.");
  }

  private requireCurrentTurn(room: Room, player: Player) {
    if (room.turnOrder[room.currentTurnIndex] !== player.id) throw new GameError("It's not your turn.");
  }

  private buildPlayer(nickname: string, avatar: string, isHost: boolean): Player {
    return {
      id: randomUUID(),
      nickname,
      avatar,
      isHost,
      ready: true,
      connected: true,
      teamId: null,
      joinedAt: Date.now(),
      money: 0,
      position: 0,
      inJail: false,
      jailTurns: 0,
      doublesCount: 0,
      bankrupt: false,
    };
  }

  private dedupeNickname(room: Room, requested: string): string {
    const taken = new Set(room.players.map((p) => p.nickname.toLowerCase()));
    let candidate = requested.trim().slice(0, 16) || "Player";
    if (!taken.has(candidate.toLowerCase())) return candidate;
    let suffix = 2;
    while (taken.has(`${candidate} ${suffix}`.toLowerCase())) suffix++;
    return `${candidate} ${suffix}`;
  }

  private uniqueRoomCode(): string {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    return code;
  }

  private buildEmptyTeams(): Team[] {
    return [
      { id: "A", name: "Team Amber", color: "#E8A33D", memberIds: [] },
      { id: "B", name: "Team Teal", color: "#3DDC97", memberIds: [] },
    ];
  }

  private reassignTeamsAfterLeave(room: Room) {
    const stillHere = new Set(room.players.map((p) => p.id));
    room.teams.forEach((t) => (t.memberIds = t.memberIds.filter((id) => stillHere.has(id))));
  }

  private registerConnection(socketId: string, roomCode: string, playerId: string) {
    this.socketToConnection.set(socketId, { roomCode, playerId });
    this.playerToSocket.set(playerId, socketId);
  }

  private forgetSocket(socketId: string) {
    const conn = this.socketToConnection.get(socketId);
    this.socketToConnection.delete(socketId);
    if (conn) this.playerToSocket.delete(conn.playerId);
  }

  private clearDisconnectTimer(playerId: string) {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  /** (Re)schedules the optional per-turn countdown. Idempotent: does
   * nothing if the current player hasn't changed since the last call, so
   * it's safe to call after every game-state-mutating action without
   * accidentally resetting an in-progress countdown. */
  private scheduleTurnTimer(room: Room) {
    const currentId = room.turnOrder[room.currentTurnIndex];
    const existing = this.turnTimers.get(room.code);

    if (room.status !== "in_progress" || !room.settings.turnTimerEnabled || !currentId) {
      if (existing) {
        clearTimeout(existing.timeout);
        this.turnTimers.delete(room.code);
      }
      room.turnDeadline = null;
      return;
    }

    if (existing && existing.playerId === currentId) return; // already ticking for this player

    if (existing) clearTimeout(existing.timeout);
    const ms = room.settings.turnTimerSeconds * 1000;
    room.turnDeadline = Date.now() + ms;
    const timeout = setTimeout(() => this.handleTurnTimeout(room.code), ms);
    this.turnTimers.set(room.code, { timeout, playerId: currentId });
  }

  private clearTurnTimer(code: string) {
    const existing = this.turnTimers.get(code);
    if (existing) {
      clearTimeout(existing.timeout);
      this.turnTimers.delete(code);
    }
  }

  private handleTurnTimeout(code: string) {
    this.turnTimers.delete(code);
    const room = this.rooms.get(code);
    if (!room || room.status !== "in_progress") return;
    const playerId = room.turnOrder[room.currentTurnIndex];
    if (!playerId) return;
    forceCompleteTurn(room, playerId);
    this.scheduleTurnTimer(room);
    this.onBroadcast?.(room);
  }

  /** Independent of the optional turn timer: if the current player is
   * disconnected, give them a short grace period before playing their
   * turn out for them so the game never stalls indefinitely. */
  private scheduleDisconnectSkip(room: Room, playerId: string) {
    this.clearDisconnectSkip(room.code);
    const timeout = setTimeout(() => this.handleDisconnectSkip(room.code, playerId), DISCONNECT_TURN_SKIP_MS);
    this.disconnectSkipTimers.set(room.code, timeout);
  }

  private clearDisconnectSkip(code: string) {
    const timer = this.disconnectSkipTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      this.disconnectSkipTimers.delete(code);
    }
  }

  private handleDisconnectSkip(code: string, playerId: string) {
    this.disconnectSkipTimers.delete(code);
    const room = this.rooms.get(code);
    if (!room || room.status !== "in_progress") return;
    if (room.turnOrder[room.currentTurnIndex] !== playerId) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.connected) return; // reconnected right at the boundary
    forceCompleteTurn(room, playerId);
    this.scheduleTurnTimer(room);
    // If it's now another disconnected player's turn, chain another skip.
    const nextId = room.turnOrder[room.currentTurnIndex];
    const nextPlayer = room.players.find((p) => p.id === nextId);
    if (nextPlayer && !nextPlayer.connected && room.status === "in_progress") {
      this.scheduleDisconnectSkip(room, nextId);
    }
    this.onBroadcast?.(room);
  }
}
