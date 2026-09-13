import type { Server, Socket } from "socket.io";
import { GameError, RoomManager } from "../rooms/RoomManager.js";
import { isValidAvatar } from "../utils/avatars.js";
import type { GameMode, GameSettings, Room, TeamId } from "../types/index.js";

interface Ack<T = unknown> {
  (response: { ok: true; data: T } | { ok: false; error: string }): void;
}

const NICKNAME_MAX = 16;

function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError("Nickname is required.");
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) throw new GameError("Nickname can't be empty.");
  if (trimmed.length > NICKNAME_MAX) throw new GameError(`Nickname must be ${NICKNAME_MAX} characters or fewer.`);
  return trimmed;
}

function sanitizeAvatar(raw: unknown): string {
  if (!isValidAvatar(raw)) throw new GameError("Pick a valid avatar.");
  return raw;
}

function sanitizeRoomCode(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) throw new GameError("Room code is required.");
  return raw.trim().toUpperCase();
}

function sanitizeTradeSide(rawMoney: unknown, rawTiles: unknown): { money: number; tiles: number[] } {
  const money = Number(rawMoney ?? 0);
  if (!Number.isFinite(money) || money < 0) throw new GameError("Invalid trade amount.");
  if (!Array.isArray(rawTiles)) throw new GameError("Invalid tile list.");
  const tiles = rawTiles.map((t) => Number(t));
  if (tiles.some((t) => !Number.isInteger(t) || t < 0 || t > 39)) throw new GameError("Invalid tile in trade.");
  return { money: Math.floor(money), tiles: [...new Set(tiles)] };
}

export function registerSocketHandlers(io: Server, roomManager: RoomManager) {
  io.on("connection", (socket: Socket) => {
    const broadcastRoom = (room: Room) => {
      io.to(room.code).emit("room:state", room);
    };

    const handle = <T>(fn: () => Room, ack: Ack<Room>) => {
      const safeAck: Ack<Room> = typeof ack === "function" ? ack : () => {};
      try {
        const room = fn();
        safeAck({ ok: true, data: room });
        broadcastRoom(room);
      } catch (err) {
        safeAck({ ok: false, error: err instanceof GameError ? err.message : "Something went wrong." });
      }
    };

    socket.on("room:create", (payload: { nickname: unknown }, rawAck: Ack<{ room: Room; playerId: string }>) => {
      const ack: Ack<{ room: Room; playerId: string }> = typeof rawAck === "function" ? rawAck : () => {};
      try {
        const nickname = sanitizeNickname(payload?.nickname);
        const { room, player } = roomManager.createRoom(nickname, socket.id);
        socket.join(room.code);
        ack({ ok: true, data: { room, playerId: player.id } });
      } catch (err) {
        ack({ ok: false, error: err instanceof GameError ? err.message : "Couldn't create room." });
      }
    });

    socket.on(
      "room:join",
      (payload: { code: unknown; nickname: unknown }, rawAck: Ack<{ room: Room; playerId: string }>) => {
        const ack: Ack<{ room: Room; playerId: string }> = typeof rawAck === "function" ? rawAck : () => {};
        try {
          const code = sanitizeRoomCode(payload?.code);
          const nickname = sanitizeNickname(payload?.nickname);
          const { room, player } = roomManager.joinRoom(code, nickname, socket.id);
          socket.join(room.code);
          ack({ ok: true, data: { room, playerId: player.id } });
          broadcastRoom(room);
        } catch (err) {
          ack({ ok: false, error: err instanceof GameError ? err.message : "Couldn't join room." });
        }
      }
    );

    socket.on("room:rejoin", (payload: { code: unknown; playerId: unknown }, rawAck: Ack<{ room: Room; playerId: string }>) => {
      const ack: Ack<{ room: Room; playerId: string }> = typeof rawAck === "function" ? rawAck : () => {};
      try {
        const code = sanitizeRoomCode(payload?.code);
        if (typeof payload?.playerId !== "string") throw new GameError("Missing player id.");
        const { room, player } = roomManager.rejoinRoom(code, payload.playerId, socket.id);
        socket.join(room.code);
        ack({ ok: true, data: { room, playerId: player.id } });
        broadcastRoom(room);
      } catch (err) {
        ack({ ok: false, error: err instanceof GameError ? err.message : "Couldn't rejoin room." });
      }
    });

    socket.on("room:leave", (_payload: unknown, rawAck: Ack<null>) => {
      const ack: Ack<null> = typeof rawAck === "function" ? rawAck : () => {};
      const { room, code } = roomManager.leaveRoom(socket.id);
      if (code) socket.leave(code);
      ack({ ok: true, data: null });
      if (room) broadcastRoom(room);
    });

    socket.on("player:setReady", (payload: { ready: unknown }, ack: Ack<Room>) => {
      handle(() => roomManager.setReady(socket.id, Boolean(payload?.ready)), ack);
    });

    socket.on("room:selectMode", (payload: { mode: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const mode = payload?.mode;
        if (mode !== "casual" && mode !== "teams") throw new GameError("Invalid mode.");
        return roomManager.selectMode(socket.id, mode as GameMode);
      }, ack);
    });

    socket.on("player:selectTeam", (payload: { teamId: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const teamId = payload?.teamId;
        if (teamId !== "A" && teamId !== "B") throw new GameError("Invalid team.");
        return roomManager.selectTeam(socket.id, teamId as TeamId);
      }, ack);
    });

    socket.on("player:selectAvatar", (payload: { avatar: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const avatar = sanitizeAvatar(payload?.avatar);
        return roomManager.selectAvatar(socket.id, avatar);
      }, ack);
    });

    socket.on("room:changeSettings", (payload: Partial<GameSettings>, ack: Ack<Room>) => {
      handle(() => roomManager.changeSettings(socket.id, payload ?? {}), ack);
    });

    socket.on("room:start", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.startGame(socket.id), ack);
    });

    socket.on("game:roll", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.rollDice(socket.id), ack);
    });

    socket.on("game:payBail", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.payBail(socket.id), ack);
    });

    socket.on("game:endTurn", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.endPlayerTurn(socket.id), ack);
    });

    socket.on("game:buyProperty", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.buyProperty(socket.id), ack);
    });

    socket.on("game:passPurchase", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.passPurchase(socket.id), ack);
    });

    socket.on("game:buildHouse", (payload: { tileIndex: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const tileIndex = Number(payload?.tileIndex);
        if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 39) throw new GameError("Invalid tile.");
        return roomManager.buildHouseOn(socket.id, tileIndex);
      }, ack);
    });

    socket.on("game:sellHouse", (payload: { tileIndex: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const tileIndex = Number(payload?.tileIndex);
        if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 39) throw new GameError("Invalid tile.");
        return roomManager.sellHouseOn(socket.id, tileIndex);
      }, ack);
    });

    socket.on("game:mortgage", (payload: { tileIndex: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const tileIndex = Number(payload?.tileIndex);
        if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 39) throw new GameError("Invalid tile.");
        return roomManager.mortgageOn(socket.id, tileIndex);
      }, ack);
    });

    socket.on("game:unmortgage", (payload: { tileIndex: unknown }, ack: Ack<Room>) => {
      handle(() => {
        const tileIndex = Number(payload?.tileIndex);
        if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 39) throw new GameError("Invalid tile.");
        return roomManager.unmortgageOn(socket.id, tileIndex);
      }, ack);
    });

    socket.on("game:forfeit", (_payload: unknown, ack: Ack<Room>) => {
      handle(() => roomManager.forfeitGame(socket.id), ack);
    });

    socket.on("chat:send", (payload: { text: unknown }, ack: Ack<Room>) => {
      handle(() => {
        if (typeof payload?.text !== "string") throw new GameError("Message is required.");
        return roomManager.sendChat(socket.id, payload.text);
      }, ack);
    });

    socket.on(
      "trade:propose",
      (
        payload: { toId: unknown; offerMoney: unknown; offerTiles: unknown; requestMoney: unknown; requestTiles: unknown },
        ack: Ack<Room>
      ) => {
        handle(() => {
          if (typeof payload?.toId !== "string") throw new GameError("Missing trade recipient.");
          const offer = sanitizeTradeSide(payload?.offerMoney, payload?.offerTiles);
          const request = sanitizeTradeSide(payload?.requestMoney, payload?.requestTiles);
          return roomManager.proposeTrade(socket.id, payload.toId, offer, request);
        }, ack);
      }
    );

    socket.on("trade:respond", (payload: { tradeId: unknown; accept: unknown }, ack: Ack<Room>) => {
      handle(() => {
        if (typeof payload?.tradeId !== "string") throw new GameError("Missing trade id.");
        return roomManager.respondToTrade(socket.id, payload.tradeId, Boolean(payload?.accept));
      }, ack);
    });

    socket.on("trade:cancel", (payload: { tradeId: unknown }, ack: Ack<Room>) => {
      handle(() => {
        if (typeof payload?.tradeId !== "string") throw new GameError("Missing trade id.");
        return roomManager.cancelTradeOffer(socket.id, payload.tradeId);
      }, ack);
    });

    socket.on("disconnect", () => {
      const { room } = roomManager.handleDisconnect(socket.id);
      if (room) broadcastRoom(room);
    });
  });
}
