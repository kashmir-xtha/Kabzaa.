// Core domain types for CLAIM. Kept intentionally small for Stage 1
// (room + lobby only). Board/property/economy types are added in later
// stages without needing to touch this file's existing shape.

export type GameMode = "casual" | "teams";

export type RoomStatus = "lobby" | "in_progress" | "finished";

export type TeamId = "A" | "B";

export interface Team {
  id: TeamId;
  name: string;
  color: string;
  memberIds: string[];
}

export interface GameSettings {
  startingMoney: number;
  maxPlayers: number;
  doublesGiveExtraTurn: boolean;
  auctionEnabled: boolean;
  turnTimerEnabled: boolean;
  turnTimerSeconds: number;
}

export interface Player {
  id: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  teamId: TeamId | null;
  joinedAt: number;
  // Game state (meaningful once status !== "lobby")
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  doublesCount: number;
  bankrupt: boolean;
}

export interface DiceRoll {
  die1: number;
  die2: number;
  isDoubles: boolean;
}

export type TurnPhase = "rolling" | "awaiting-purchase" | "rolled";

export interface LogEntry {
  id: string;
  message: string;
  ts: number;
}

export interface TradeSide {
  money: number;
  tiles: number[];
}

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  /** What fromId gives. */
  offer: TradeSide;
  /** What fromId wants from toId. */
  request: TradeSide;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  avatar: string;
  text: string;
  ts: number;
}

export interface Room {
  code: string;
  status: RoomStatus;
  mode: GameMode;
  hostId: string;
  players: Player[];
  teams: Team[];
  settings: GameSettings;
  createdAt: number;
  // Game state (meaningful once status !== "lobby")
  turnOrder: string[];
  currentTurnIndex: number;
  turnPhase: TurnPhase;
  lastRoll: DiceRoll | null;
  log: LogEntry[];
  /** Tile index -> owning player id. Only present for owned tiles. */
  ownership: Record<number, string>;
  /** Tile index -> house count (1-4) or 5 for a hotel. Absent = none. */
  houses: Record<number, number>;
  /** Phase to restore once an "awaiting-purchase" decision resolves (carries
   * a pending doubles bonus roll across the purchase prompt). */
  pendingPostPurchasePhase: TurnPhase | null;
  trades: TradeOffer[];
  chatMessages: ChatMessage[];
  mortgaged: Record<number, boolean>;
  winnerId: string | null;
  winnerTeamId: TeamId | null;
  /** Epoch ms when the current turn's timer expires, or null if disabled. */
  turnDeadline: number | null;
}

export const DEFAULT_SETTINGS: GameSettings = {
  startingMoney: 1500,
  maxPlayers: 6,
  doublesGiveExtraTurn: true,
  auctionEnabled: false,
  turnTimerEnabled: false,
  turnTimerSeconds: 60,
};

export const MIN_PLAYERS_TO_START = 2;

// Serialized room shape sent to clients. Identical to Room for now, but
// kept as a distinct alias so we can redact fields later (e.g. per-player
// hidden info) without changing every call site.
export type RoomStateDTO = Room;
