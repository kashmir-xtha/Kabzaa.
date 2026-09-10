// Mirrors server/src/types/index.ts. Duplicated deliberately for Stage 1
// to keep client and server independently deployable; if this drifts in
// later stages, promote it to a shared workspace package.

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
  offer: TradeSide;
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
  turnOrder: string[];
  currentTurnIndex: number;
  turnPhase: TurnPhase;
  lastRoll: DiceRoll | null;
  log: LogEntry[];
  ownership: Record<number, string>;
  houses: Record<number, number>;
  pendingPostPurchasePhase: TurnPhase | null;
  trades: TradeOffer[];
  chatMessages: ChatMessage[];
  mortgaged: Record<number, boolean>;
  winnerId: string | null;
  winnerTeamId: TeamId | null;
  turnDeadline: number | null;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
