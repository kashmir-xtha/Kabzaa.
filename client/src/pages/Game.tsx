import { useEffect, useRef, useState } from "react";
import Wordmark from "../components/Wordmark";
import Dice from "../components/Dice";
import Board from "../game/board/Board";
import { AvatarBadge } from "../game/avatars";
import { BOARD, groupColor, groupHouseCost, tileAt, type BoardTile } from "../game/board/data";
import { checkCanBuildHouse, checkCanMortgage, checkCanSellHouse, checkCanUnmortgage, ownsWholeGroup } from "../game/board/economy";
import TradePanel from "../game/TradePanel";
import Chat from "../game/Chat";
import { useRoom } from "../game/RoomContext";
import type { Player, Room } from "../types";

// Speed of token stepping (in milliseconds per tile)
const STEP_MS = 120;

export default function Game() {
  const {
    room,
    me,
    playerId,
    rollDice,
    payBail,
    endTurn,
    buyProperty,
    passPurchase,
    buildHouse,
    sellHouse,
    mortgageProperty,
    unmortgageProperty,
    forfeitGame,
  } = useRoom();
  const [confirmingForfeit, setConfirmingForfeit] = useState(false);

  const [displayedRoom, setDisplayedRoom] = useState<Room | null>(room);
  const [rollKey, setRollKey] = useState(0);

  const prevRoomRef = useRef<Room | null>(null);
  const pendingRoomRef = useRef<Room | null>(room);
  const isRollingRef = useRef(false);

  useEffect(() => {
    if (!room) return;

    const prevRoom = prevRoomRef.current;
    pendingRoomRef.current = room;

    const isNewRoll =
      Boolean(room.lastRoll) &&
      prevRoom?.turnPhase === "rolling" &&
      room.lastRoll !== prevRoom?.lastRoll;

    prevRoomRef.current = room;

    if (isNewRoll) {
      isRollingRef.current = true;
      setRollKey((k) => k + 1);
    } else if (!isRollingRef.current) {
      setDisplayedRoom(room);
    }
  }, [room]);

  const handleRollComplete = () => {
    isRollingRef.current = false;
    const targetRoom = pendingRoomRef.current;
    if (!targetRoom || !displayedRoom) {
      if (targetRoom) setDisplayedRoom(targetRoom);
      return;
    }

    // Find the player whose position changed
    const movingPlayerNewState = targetRoom.players.find((p) => {
      const oldP = displayedRoom.players.find((old) => old.id === p.id);
      return oldP && oldP.position !== p.position;
    });

    if (!movingPlayerNewState) {
      setDisplayedRoom(targetRoom);
      return;
    }

    const moverId = movingPlayerNewState.id;
    const startPos = displayedRoom.players.find((p) => p.id === moverId)?.position ?? 0;
    const targetPos = movingPlayerNewState.position;
    const totalSteps = (targetPos - startPos + 40) % 40;

    if (totalSteps === 0) {
      setDisplayedRoom(targetRoom);
      return;
    }

    // Step tile-by-tile from startPos to targetPos
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      const nextPos = (startPos + currentStep) % 40;

      if (currentStep >= totalSteps) {
        clearInterval(interval);
        // Landed on final tile: show updated purchase prompt / log / state
        setDisplayedRoom(targetRoom);
      } else {
        // Intermediate step: move token position without opening action prompts yet
        setDisplayedRoom((prev) => {
          if (!prev) return targetRoom;
          return {
            ...prev,
            players: prev.players.map((p) =>
              p.id === moverId ? { ...p, position: nextPos } : p
            ),
          };
        });
      }
    }, STEP_MS);
  };

  if (!room || !me || !playerId) return null;

  const currentDisplayedRoom = displayedRoom ?? room;
  const displayedMe = currentDisplayedRoom.players.find((p) => p.id === me.id) ?? me;
  const currentTurnId = currentDisplayedRoom.turnOrder[currentDisplayedRoom.currentTurnIndex];
  const currentPlayer = currentDisplayedRoom.players.find((p) => p.id === currentTurnId) ?? null;
  const isMyTurn = currentTurnId === playerId;
  const gameOver = currentDisplayedRoom.status === "finished";

  return (
    <div className="h-dvh w-screen overflow-hidden p-3 bg-ink text-parchment font-sans">
      {gameOver && <GameOverBanner room={currentDisplayedRoom} />}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] xl:grid-cols-[300px_1fr_340px] h-full w-full gap-3 md:gap-4 min-h-0 overflow-hidden">
        {/* COLUMN 1 (LEFT): Brand + Chat */}
        <aside className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="notch border border-ink-border bg-ink-raised p-3 shrink-0 flex items-center justify-between">
            <Wordmark size="sm" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <Chat messages={currentDisplayedRoom.chatMessages} myPlayerId={displayedMe.id} />
          </div>
        </aside>

        {/* COLUMN 2 (MIDDLE): Full Board with Center Panel & Log */}
        <main className="h-full min-h-0 min-w-0 flex items-center justify-center relative overflow-hidden">
          <Board
            players={currentDisplayedRoom.players}
            ownership={currentDisplayedRoom.ownership}
            houses={currentDisplayedRoom.houses}
          >
            <CenterPanel
              room={currentDisplayedRoom}
              latestLastRoll={room.lastRoll}
              rollKey={rollKey}
              currentPlayer={currentPlayer}
              isMyTurn={isMyTurn && !gameOver}
              me={displayedMe}
              onRoll={rollDice}
              onPayBail={payBail}
              onEndTurn={endTurn}
              onBuy={buyProperty}
              onPass={passPurchase}
              onRollComplete={handleRollComplete}
            />
          </Board>
        </main>

        {/* COLUMN 3 (RIGHT): Room info, Players, Trades, Properties */}
        <aside className="h-full min-h-0 flex flex-col gap-3 pr-1 overflow-hidden">
          {/* Room Code & Forfeit Card */}
          <div className="border border-ink-border bg-ink-raised p-3 shrink-0 flex items-center justify-between">
            <span className="text-xs font-mono text-slate bg-ink/60 px-2 py-1 rounded border border-ink-border">
              Room {currentDisplayedRoom.code}
            </span>
            {!displayedMe.bankrupt && !gameOver && (
              confirmingForfeit ? (
                <div className="flex items-center gap-2 text-xs bg-ink/60 border border-signal/40 px-2 py-0.5 rounded">
                  <span className="text-slate">Give up?</span>
                  <button onClick={forfeitGame} className="cursor-pointer text-signal font-semibold hover:underline">
                    Yes
                  </button>
                  <button onClick={() => setConfirmingForfeit(false)} className="cursor-pointer text-slate hover:text-parchment">
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingForfeit(true)}
                  className="cursor-pointer text-xs text-slate hover:text-signal transition-colors px-1 font-medium"
                >
                  Forfeit
                </button>
              )
            )}
          </div>

          <PlayerHud room={currentDisplayedRoom} playerId={playerId} currentTurnId={currentTurnId} />
          <TradePanel room={currentDisplayedRoom} me={displayedMe} />
          <PropertiesPanel
            room={currentDisplayedRoom}
            me={displayedMe}
            onBuild={buildHouse}
            onSell={sellHouse}
            onMortgage={mortgageProperty}
            onUnmortgage={unmortgageProperty}
          />
        </aside>
      </div>
    </div>
  );
}

function netWorth(room: Room, player: Player): number {
  let total = player.money;
  BOARD.forEach((tile) => {
    if (room.ownership[tile.index] !== player.id) return;
    const mortgaged = Boolean(room.mortgaged[tile.index]);
    total += mortgaged ? Math.floor((tile.price ?? 0) / 2) : tile.price ?? 0;
    const houses = room.houses[tile.index] ?? 0;
    if (houses > 0 && tile.group) total += houses * groupHouseCost(tile.group);
  });
  return total;
}

function GameOverBanner({ room }: { room: Room }) {
  const winnerName =
    room.mode === "teams"
      ? room.teams.find((t) => t.id === room.winnerTeamId)?.name ?? "A team"
      : room.players.find((p) => p.id === room.winnerId)?.nickname ?? "Someone";

  const standings = [...room.players].sort((a, b) => netWorth(room, b) - netWorth(room, a));

  return (
    <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="notch border border-amber bg-ink-raised-2 p-6 w-full max-w-md shadow-2xl animate-fade-in">
        <div className="text-center mb-5">
          <p className="text-xs text-amber font-semibold uppercase tracking-widest mb-1">Game over</p>
          <p className="font-display text-3xl text-parchment">{winnerName} wins!</p>
        </div>
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {standings.map((p, i) => (
            <div key={p.id} className="notch-sm bg-ink/60 border border-ink-border px-3 py-2 flex items-center gap-3 text-sm">
              <span className="text-slate font-mono text-xs w-4 text-right">{i + 1}</span>
              <AvatarBadge id={p.avatar} size={28} />
              <span className={`flex-1 truncate ${p.bankrupt ? "text-slate line-through" : "text-parchment font-medium"}`}>
                {p.nickname}
              </span>
              <span className="tabular-nums font-mono text-amber">${netWorth(room, p).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TurnCountdown({ deadline }: { deadline: number }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 500);
    return () => window.clearInterval(id);
  }, [deadline]);

  const low = secondsLeft <= 10;
  return (
    <p className={`text-[11px] font-mono mt-0.5 tabular-nums ${low ? "text-signal font-bold animate-pulse" : "text-slate"}`}>
      {secondsLeft}s left
    </p>
  );
}

function CenterPanel({
  room,
  latestLastRoll,
  rollKey,
  currentPlayer,
  isMyTurn,
  me,
  onRoll,
  onPayBail,
  onEndTurn,
  onBuy,
  onPass,
  onRollComplete,
}: {
  room: Room;
  latestLastRoll: Room["lastRoll"];
  rollKey: number;
  currentPlayer: Player | null;
  isMyTurn: boolean;
  me: Player;
  onRoll: () => void;
  onPayBail: () => void;
  onEndTurn: () => void;
  onBuy: () => void;
  onPass: () => void;
  onRollComplete: () => void;
}) {
  const bonusRoll = room.turnPhase === "rolling" && room.lastRoll?.isDoubles;
  const tile = tileAt(me.position);

  if (room.status === "finished") {
    return (
      <div className="flex flex-col items-center gap-2 text-center max-w-65">
        <Wordmark size="sm" />
        <p className="text-xs text-slate">Thanks for playing.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between h-full w-full max-w-70 p-2 min-h-0 overflow-hidden">
      {/* 1. Now Playing / Turn Info */}
      <div className="text-center shrink-0 my-1">
        <p className="text-[10px] text-slate uppercase tracking-wider font-semibold">
          {isMyTurn ? "Your turn" : "Now playing"}
        </p>
        <p className="font-display text-lg text-parchment leading-tight mt-0.5">
          {isMyTurn ? "You" : currentPlayer?.nickname ?? "…"}
        </p>
        {room.settings.turnTimerEnabled && room.turnDeadline && <TurnCountdown deadline={room.turnDeadline} />}
      </div>

      {/* 2. Dice */}
      <div className="shrink-0">
        <Dice
          die1={latestLastRoll?.die1 ?? null}
          die2={latestLastRoll?.die2 ?? null}
          rollKey={rollKey}
          onRollComplete={onRollComplete}
        />
      </div>

      {/* 3. Turn Action Controls */}
      <div className="w-full shrink-0 h-22 my-2 flex flex-col justify-center">
        {me.bankrupt ? (
          <p className="text-xs text-slate text-center">You're out — spectating.</p>
        ) : isMyTurn ? (
          <div className="flex flex-col gap-1.5 w-full">
            {room.turnPhase === "awaiting-purchase" && (
              <div className="border border-amber bg-ink-raised-2 p-1.5 flex flex-col gap-1.5">
                <div className="text-center">
                  <p className="text-xs text-parchment font-semibold truncate">{tileAt(me.position).name}</p>
                  <p className="text-[11px] text-amber font-mono">Buy for ${tileAt(me.position).price}?</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onPass}
                    className="flex-1 border border-ink-border py-1 text-xs text-parchment hover:border-signal transition-colors cursor-pointer"
                  >
                    Pass
                  </button>
                  <button
                    onClick={onBuy}
                    disabled={me.money < (tile.price ?? 0)}
                    className="flex-1 cursor-pointer bg-amber text-ink font-semibold py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    Buy
                  </button>
                </div>
              </div>
            )}

            {me.inJail && room.turnPhase === "rolling" && (
              <p className="text-[10px] text-slate leading-tight text-center mb-1">
                In Holding ({me.jailTurns}/3). Roll doubles or pay $50.
              </p>
            )}

            {room.turnPhase === "rolling" && me.inJail && (
              <button
                onClick={onPayBail}
                disabled={me.money < 50}
                className="notch-sm border border-ink-border py-1 text-xs text-parchment hover:border-amber disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Pay $50 &amp; roll
              </button>
            )}

            {room.turnPhase === "rolling" && (
              <button
                onClick={onRoll}
                className="cursor-pointer bg-amber text-ink font-bold py-2 text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md"
              >
                {bonusRoll ? "Roll doubles!" : me.inJail ? "Try doubles" : "Roll dice"}
              </button>
            )}

            {room.turnPhase === "rolled" && (
              <button
                onClick={onEndTurn}
                className="cursor-pointer bg-teal text-ink font-bold py-2 text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md"
              >
                End turn
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate text-center">Waiting for {currentPlayer?.nickname ?? "player"}…</p>
        )}
      </div>

      {/* 4. Game Log */}
      <CenterEventLog log={room.log} />
    </div>
  );
}

function CenterEventLog({ log }: { log: Room["log"] }) {
  const reversedLog = [...log].reverse();

  return (
    <div className="w-full p-2.5 h-58 shrink-0 relative overflow-hidden">
      <div 
        className="h-full overflow-y-auto text-center flex flex-col gap-1.5 scrollbar-none [&::-webkit-scrollbar]:hidden mask-[linear-gradient(to_bottom,black_60%,transparent_100%)]"
      >
        {reversedLog.map((entry) => (
          <p key={entry.id} className="text-[10px] text-slate leading-tight shrink-0">
            {entry.message}
          </p>
        ))}
      </div>
    </div>
  );
}

function PlayerMoneyDisplay({ money }: { money: number }) {
  const [flash, setFlash] = useState<"gain" | "loss" | null>(null);
  const [delta, setDelta] = useState<{ text: string; type: "gain" | "loss"; id: number } | null>(null);
  const prevMoneyRef = useRef(money);

  useEffect(() => {
    const diff = money - prevMoneyRef.current;
    if (diff !== 0) {
      const type = diff > 0 ? "gain" : "loss";
      const text = `${diff > 0 ? "+" : "-"}$${Math.abs(diff).toLocaleString()}`;

      setFlash(type);
      setDelta({ text, type, id: Date.now() });

      prevMoneyRef.current = money;

      const timer = setTimeout(() => {
        setFlash(null);
        setDelta(null);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [money]);

  const mainColorClass =
    flash === "gain"
      ? "text-teal font-bold scale-105"
      : flash === "loss"
      ? "text-signal font-bold scale-105"
      : "text-parchment/90 font-medium";

  return (
    <span className="relative inline-block">
      <span className={`transition-all duration-300 font-mono inline-block ${mainColorClass}`}>
        ${money.toLocaleString()}
      </span>

      {delta && (
        <span
          key={delta.id}
          className={`absolute left-0 pointer-events-none font-mono font-bold text-xs whitespace-nowrap ${
            delta.type === "gain" ? "text-teal" : "text-signal"
          }`}
          style={{
            top: "-0.25rem",
            animation: "floatAndFade 1500ms cubic-bezier(0, 0, 0.2, 1) forwards",
          }}
        >
          {delta.text}
        </span>
      )}

      <style>{`
        @keyframes floatAndFade {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(-1rem);
            opacity: 0;
          }
        }
      `}</style>
    </span>
  );
}

function PlayerHud({ room, playerId, currentTurnId }: { room: Room; playerId: string; currentTurnId: string }) {
  const ownedCount = (pid: string) => Object.values(room.ownership).filter((id) => id === pid).length;

  return (
    <div className="notch border border-ink-border bg-ink-raised p-3 shrink-0">
      <p className="text-xs font-semibold text-slate uppercase tracking-wider mb-2">Players</p>
      <div className="flex flex-col gap-1.5">
        {room.players.map((p) => (
          <div
            key={p.id}
            className={`notch-sm flex items-center gap-2.5 px-2.5 py-1.5 border transition-colors ${
              p.id === currentTurnId ? "border-amber bg-ink-raised-2" : "border-ink-border/50 bg-ink/40"
            } ${p.bankrupt ? "opacity-40" : ""}`}
          >
            <AvatarBadge id={p.avatar} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-parchment truncate">{p.nickname}</p>
                {p.id === playerId && <span className="text-[10px] text-slate shrink-0">(you)</span>}
                {p.id === currentTurnId && !p.bankrupt && <span className="text-[10px] text-amber shrink-0">●</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate font-mono">
                {p.bankrupt ? (
                  <span className="text-signal">Bankrupt</span>
                ) : (
                  <>
                    <PlayerMoneyDisplay money={p.money} />
                    {ownedCount(p.id) > 0 && <span>{ownedCount(p.id)} owned</span>}
                    {p.inJail && <span className="text-signal font-sans">Holding</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PropertiesPanel({
  room,
  me,
  onBuild,
  onSell,
  onMortgage,
  onUnmortgage,
}: {
  room: Room;
  me: Player;
  onBuild: (tileIndex: number) => void;
  onSell: (tileIndex: number) => void;
  onMortgage: (tileIndex: number) => void;
  onUnmortgage: (tileIndex: number) => void;
}) {
  const owned = BOARD.filter((t) => room.ownership[t.index] === me.id);
  if (owned.length === 0) return null;

  const properties = owned.filter((t): t is BoardTile & { group: string } => t.kind === "property" && Boolean(t.group));

  return (
    <div className="notch border border-ink-border bg-ink-raised p-3 flex-1 min-h-0 flex flex-col">
      <p className="text-xs font-semibold text-slate uppercase tracking-wider mb-2 shrink-0">My properties</p>
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1">
        {owned.map((tile) => {
          const isProperty = tile.kind === "property";
          const houses = room.houses[tile.index] ?? 0;
          const mortgaged = Boolean(room.mortgaged[tile.index]);
          const buildCheck = isProperty ? checkCanBuildHouse(room, tile, me) : null;
          const sellCheck = isProperty ? checkCanSellHouse(room, tile, me) : null;
          const mortgageCheck = checkCanMortgage(room, tile, me);
          const unmortgageCheck = checkCanUnmortgage(room, tile, me);

          return (
            <div key={tile.index} className={`notch-sm border px-2.5 py-1.5 bg-ink/30 ${mortgaged ? "border-signal/50" : "border-ink-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {tile.group && (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: groupColor(tile.group) }} />
                  )}
                  <span className="text-xs text-parchment font-medium truncate">{tile.name}</span>
                </div>
                {mortgaged ? (
                  <span className="text-[10px] text-signal font-semibold shrink-0">Mortgaged</span>
                ) : (
                  houses > 0 && <span className="text-[10px] text-amber font-mono shrink-0">{houses >= 5 ? "Hotel" : `${houses}🏠`}</span>
                )}
              </div>

              {isProperty && !mortgaged && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    onClick={() => onSell(tile.index)}
                    disabled={!sellCheck?.ok}
                    title={sellCheck?.reason}
                    className="flex-1 notch-sm border border-ink-border py-0.5 text-[10px] text-parchment disabled:opacity-30 hover:border-signal transition-colors"
                  >
                    Sell {sellCheck?.cost !== undefined ? `+$${sellCheck.cost}` : ""}
                  </button>
                  <button
                    onClick={() => onBuild(tile.index)}
                    disabled={!buildCheck?.ok}
                    title={buildCheck?.reason}
                    className="flex-1 notch-sm bg-amber text-ink py-0.5 text-[10px] font-bold disabled:opacity-30 hover:opacity-90 transition-opacity"
                  >
                    Build ${groupHouseCost(tile.group)}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-1">
                {mortgaged ? (
                  <button
                    onClick={() => onUnmortgage(tile.index)}
                    disabled={!unmortgageCheck.ok}
                    title={unmortgageCheck.reason}
                    className="flex-1 notch-sm border border-teal text-teal py-0.5 text-[10px] font-semibold disabled:opacity-30 hover:bg-teal/10 transition-colors"
                  >
                    Unmortgage ${unmortgageCheck.amount ?? ""}
                  </button>
                ) : (
                  <button
                    onClick={() => onMortgage(tile.index)}
                    disabled={!mortgageCheck.ok}
                    title={mortgageCheck.reason}
                    className="flex-1 notch-sm border border-ink-border py-0.5 text-[10px] text-slate disabled:opacity-30 hover:border-amber hover:text-amber transition-colors"
                  >
                    Mortgage +${mortgageCheck.amount ?? ""}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {properties.length > 0 && !properties.some((t) => ownsWholeGroup(room, t, me.id)) && (
        <p className="text-[10px] text-slate mt-1.5 italic shrink-0">Own all tiles in a group to build houses.</p>
      )}
    </div>
  );
}