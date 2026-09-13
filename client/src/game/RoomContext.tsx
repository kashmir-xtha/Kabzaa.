import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { socket } from "./socket";
import { loadSession, saveSession, clearSession, saveIdentity } from "./identity";
import { useToast } from "../components/Toast";
import type { Ack, GameMode, GameSettings, Room, TeamId } from "../types";

interface RoomContextValue {
  connected: boolean;
  connecting: boolean;
  room: Room | null;
  playerId: string | null;
  me: Room["players"][number] | null;
  isHost: boolean;
  createRoom: (nickname: string) => Promise<boolean>;
  joinRoom: (code: string, nickname: string) => Promise<boolean>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  selectMode: (mode: GameMode) => void;
  selectTeam: (teamId: TeamId) => void;
  selectAvatar: (avatar: string) => void;
  changeSettings: (partial: Partial<GameSettings>) => void;
  startGame: () => void;
  rollDice: () => void;
  payBail: () => void;
  endTurn: () => void;
  buyProperty: () => void;
  passPurchase: () => void;
  buildHouse: (tileIndex: number) => void;
  sellHouse: (tileIndex: number) => void;
  proposeTrade: (toId: string, offer: { money: number; tiles: number[] }, request: { money: number; tiles: number[] }) => Promise<boolean>;
  respondToTrade: (tradeId: string, accept: boolean) => void;
  cancelTrade: (tradeId: string) => void;
  mortgageProperty: (tileIndex: number) => void;
  unmortgageProperty: (tileIndex: number) => void;
  forfeitGame: () => void;
  sendChatMessage: (text: string) => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

function emitWithAck<TResponse>(event: string, payload: unknown): Promise<Ack<TResponse>> {
  return new Promise((resolve) => {
    socket.timeout(6000).emit(event, payload, (err: Error | null, response: Ack<TResponse>) => {
      if (err) {
        resolve({ ok: false, error: "The server didn't respond in time." });
        return;
      }
      resolve(response);
    });
  });
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [connecting, setConnecting] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const { push } = useToast();
  const hasAttemptedRejoin = useRef(false);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      const session = loadSession();
      if (session && !hasAttemptedRejoin.current) {
        hasAttemptedRejoin.current = true;
        emitWithAck<{ room: Room; playerId: string }>("room:rejoin", session).then((res) => {
          if (res.ok) {
            setRoom(res.data.room);
            setPlayerId(res.data.playerId);
          } else {
            clearSession();
          }
          setConnecting(false);
        });
      } else {
        setConnecting(false);
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onRoomState(next: Room) {
      setRoom(next);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
    };
  }, []);

  const createRoom = useCallback(async (nickname: string) => {
    const res = await emitWithAck<{ room: Room; playerId: string }>("room:create", { nickname });
    if (res.ok) {
      saveIdentity({ nickname });
      saveSession({ roomCode: res.data.room.code, playerId: res.data.playerId });
      setRoom(res.data.room);
      setPlayerId(res.data.playerId);
      return true;
    }
    push(res.error, "error");
    return false;
  }, [push]);

  const joinRoom = useCallback(async (code: string, nickname: string) => {
    const res = await emitWithAck<{ room: Room; playerId: string }>("room:join", { code, nickname });
    if (res.ok) {
      saveIdentity({ nickname });
      saveSession({ roomCode: res.data.room.code, playerId: res.data.playerId });
      setRoom(res.data.room);
      setPlayerId(res.data.playerId);
      return true;
    }
    push(res.error, "error");
    return false;
  }, [push]);

  const leaveRoom = useCallback(() => {
    socket.emit("room:leave", {}, () => {});
    clearSession();
    setRoom(null);
    setPlayerId(null);
  }, []);

  const fireAndReport = useCallback(
    async (event: string, payload: unknown) => {
      const res = await emitWithAck<Room>(event, payload);
      if (!res.ok) push(res.error, "error");
    },
    [push]
  );

  const setReady = useCallback((ready: boolean) => void fireAndReport("player:setReady", { ready }), [fireAndReport]);
  const selectMode = useCallback((mode: GameMode) => void fireAndReport("room:selectMode", { mode }), [fireAndReport]);
  const selectTeam = useCallback((teamId: TeamId) => void fireAndReport("player:selectTeam", { teamId }), [fireAndReport]);
  const selectAvatar = useCallback((avatar: string) => void fireAndReport("player:selectAvatar", { avatar }), [fireAndReport]);
  const changeSettings = useCallback(
    (partial: Partial<GameSettings>) => void fireAndReport("room:changeSettings", partial),
    [fireAndReport]
  );
  const startGame = useCallback(() => void fireAndReport("room:start", {}), [fireAndReport]);
  const rollDice = useCallback(() => void fireAndReport("game:roll", {}), [fireAndReport]);
  const payBail = useCallback(() => void fireAndReport("game:payBail", {}), [fireAndReport]);
  const endTurn = useCallback(() => void fireAndReport("game:endTurn", {}), [fireAndReport]);
  const buyProperty = useCallback(() => void fireAndReport("game:buyProperty", {}), [fireAndReport]);
  const passPurchase = useCallback(() => void fireAndReport("game:passPurchase", {}), [fireAndReport]);
  const buildHouse = useCallback(
    (tileIndex: number) => void fireAndReport("game:buildHouse", { tileIndex }),
    [fireAndReport]
  );
  const sellHouse = useCallback(
    (tileIndex: number) => void fireAndReport("game:sellHouse", { tileIndex }),
    [fireAndReport]
  );

  const proposeTrade = useCallback(
    async (toId: string, offer: { money: number; tiles: number[] }, request: { money: number; tiles: number[] }) => {
      const res = await emitWithAck<Room>("trade:propose", {
        toId,
        offerMoney: offer.money,
        offerTiles: offer.tiles,
        requestMoney: request.money,
        requestTiles: request.tiles,
      });
      if (!res.ok) {
        push(res.error, "error");
        return false;
      }
      return true;
    },
    [push]
  );
  const respondToTrade = useCallback(
    (tradeId: string, accept: boolean) => void fireAndReport("trade:respond", { tradeId, accept }),
    [fireAndReport]
  );
  const cancelTrade = useCallback((tradeId: string) => void fireAndReport("trade:cancel", { tradeId }), [fireAndReport]);
  const mortgageProperty = useCallback(
    (tileIndex: number) => void fireAndReport("game:mortgage", { tileIndex }),
    [fireAndReport]
  );
  const unmortgageProperty = useCallback(
    (tileIndex: number) => void fireAndReport("game:unmortgage", { tileIndex }),
    [fireAndReport]
  );
  const forfeitGame = useCallback(() => void fireAndReport("game:forfeit", {}), [fireAndReport]);
  const sendChatMessage = useCallback((text: string) => void fireAndReport("chat:send", { text }), [fireAndReport]);

  const me = room && playerId ? room.players.find((p) => p.id === playerId) ?? null : null;

  return (
    <RoomContext.Provider
      value={{
        connected,
        connecting,
        room,
        playerId,
        me,
        isHost: Boolean(me?.isHost),
        createRoom,
        joinRoom,
        leaveRoom,
        setReady,
        selectMode,
        selectTeam,
        selectAvatar,
        changeSettings,
        startGame,
        rollDice,
        payBail,
        endTurn,
        buyProperty,
        passPurchase,
        buildHouse,
        sellHouse,
        proposeTrade,
        respondToTrade,
        cancelTrade,
        mortgageProperty,
        unmortgageProperty,
        forfeitGame,
        sendChatMessage,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used inside a RoomProvider");
  return ctx;
}
