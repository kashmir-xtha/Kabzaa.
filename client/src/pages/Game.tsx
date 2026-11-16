import { useEffect, useRef, useState } from "react";
import Wordmark from "../components/Wordmark";
import Dice from "../components/Dice";
import Board from "../game/board/Board";
import { AvatarBadge } from "../game/avatars";
import { BOARD, groupHouseCost, tileAt, type BoardTile } from "../game/board/data";
import { checkCanBuildHouse, checkCanMortgage, checkCanSellHouse, checkCanUnmortgage } from "../game/board/economy";
import TradePanel from "../game/TradePanel";
import Chat from "../game/Chat";
import { useRoom } from "../game/RoomContext";
import { useToast } from "../components/Toast";
import type { Player, Room } from "../types";

export default function Game() {
  const {
    room,
    me,
    playerId,
    rollDice,
    payBail,
    usePass,
    endTurn,
    buyProperty,
    passPurchase,
    buildHouse,
    sellHouse,
    mortgageProperty,
    unmortgageProperty,
    forfeitGame,
    playWager,
    skipWager,
  } = useRoom();
  const [confirmingForfeit, setConfirmingForfeit] = useState(false);

  const [displayedRoom, setDisplayedRoom] = useState<Room | null>(room);
  const [rollKey, setRollKey] = useState(0);

  const prevRollSignatureRef = useRef<string | null>(null);
  const pendingRoomRef = useRef<Room | null>(room);
  const animationStateRef = useRef<"idle" | "rolling" | "walking">("idle");

  useEffect(() => {
    if (!room) return;
    pendingRoomRef.current = room;

    const currentRollSignature = room.lastRoll
      ? `${room.lastRoll.die1}-${room.lastRoll.die2}-${room.currentTurnIndex}`
      : null;

    const isNewRoll =
      Boolean(room.lastRoll) &&
      currentRollSignature !== prevRollSignatureRef.current;

    if (isNewRoll) {
      prevRollSignatureRef.current = currentRollSignature;
      animationStateRef.current = "rolling";
      setRollKey((k) => k + 1);

      // Ultimate safety fallback: force full sync after 4 seconds if anything hangs
      const safetyTimer = setTimeout(() => {
        if (animationStateRef.current !== "idle") {
          animationStateRef.current = "idle";
          if (pendingRoomRef.current) {
            setDisplayedRoom(pendingRoomRef.current);
          }
        }
      }, 4000);

      return () => clearTimeout(safetyTimer);
    } else if (animationStateRef.current === "idle") {
      setDisplayedRoom(room);
    }
  }, [room]);

  const handleRollComplete = () => {
    if (!pendingRoomRef.current) return;
    const targetRoom = pendingRoomRef.current;
    const turnPlayerId = targetRoom.turnOrder[targetRoom.currentTurnIndex];

    const oldPlayer = displayedRoom?.players.find((p) => p.id === turnPlayerId);
    const newPlayer = targetRoom.players.find((p) => p.id === turnPlayerId);

    if (!oldPlayer || !newPlayer) {
      animationStateRef.current = "idle";
      setDisplayedRoom(targetRoom);
      return;
    }

    const waypoint = targetRoom.animationWaypoint;
    const totalTiles = BOARD.length;

    // --- TWO-STAGE ANIMATION FOR TWIST WAYPOINTS ---
    if (waypoint !== undefined && waypoint !== oldPlayer.position) {
      animationStateRef.current = "walking";
      let currentPos = oldPlayer.position;
      const stepsToWaypoint = (waypoint - currentPos + totalTiles) % totalTiles;
      const stage1IntervalMs = Math.max(20, Math.floor(300 / (stepsToWaypoint || 1)));

      const runStage2 = () => {
        let pos = waypoint;
        const diff = (newPlayer.position - waypoint + totalTiles) % totalTiles;
        const isBackward = diff > 20;
        const stepsToTarget = isBackward ? (waypoint - newPlayer.position + totalTiles) % totalTiles : diff;

        const effectiveSteps = (waypoint === newPlayer.position) ? 0 : stepsToTarget;
        const stage2IntervalMs = Math.max(20, Math.floor(300 / (effectiveSteps || 1)));

        if (effectiveSteps === 0) {
          // If start and final destination are both the Twist tile itself
          animationStateRef.current = "idle";
          if (pendingRoomRef.current) setDisplayedRoom(pendingRoomRef.current);
          return;
        }

        const step2Interval = setInterval(() => {
          if (pos === newPlayer.position || animationStateRef.current !== "walking") {
            clearInterval(step2Interval);
            animationStateRef.current = "idle";
            if (pendingRoomRef.current) {
              setDisplayedRoom(pendingRoomRef.current);
            }
            return;
          }

          if (isBackward) {
            pos = (pos - 1 + totalTiles) % totalTiles;
          } else {
            pos = (pos + 1) % totalTiles;
          }

          setDisplayedRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              players: prev.players.map((p) =>
                p.id === turnPlayerId ? { ...p, position: pos } : p
              ),
            };
          });
        }, stage2IntervalMs);
      };

      const step1Interval = setInterval(() => {
        if (currentPos === waypoint || animationStateRef.current !== "walking") {
          clearInterval(step1Interval);
          if (currentPos === waypoint) {
            setTimeout(runStage2, 50); // Pause
          } else {
            animationStateRef.current = "idle";
            if (pendingRoomRef.current) {
              setDisplayedRoom(pendingRoomRef.current);
            }
          }
          return;
        }

        currentPos = (currentPos + 1) % totalTiles;

        setDisplayedRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map((p) =>
              p.id === turnPlayerId ? { ...p, position: currentPos } : p
            ),
          };
        });
      }, stage1IntervalMs);

      return;
    }

    // --- STANDARD SINGLE-STAGE WALK (Only skipped if start === end AND no waypoint) ---
    if (oldPlayer.position === newPlayer.position) {
      animationStateRef.current = "idle";
      setDisplayedRoom(targetRoom);
      return;
    }

    animationStateRef.current = "walking";
    let currentPos = oldPlayer.position;
    const targetPos = newPlayer.position;

    const stepsToTake = (targetPos - currentPos + totalTiles) % totalTiles;
    const totalWalkTimeMs = 500;
    const stepIntervalMs = Math.max(20, Math.floor(totalWalkTimeMs / (stepsToTake || 1)));

    const stepInterval = setInterval(() => {
      if (currentPos === targetPos || animationStateRef.current !== "walking") {
        clearInterval(stepInterval);
        animationStateRef.current = "idle";
        if (pendingRoomRef.current) {
          setDisplayedRoom(pendingRoomRef.current);
        }
        return;
      }

      currentPos = (currentPos + 1) % totalTiles;

      setDisplayedRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === turnPlayerId ? { ...p, position: currentPos } : p
          ),
        };
      });
    }, stepIntervalMs);
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
        {/* COLUMN 1 (LEFT): Brand + Player HUD + Chat */}
        <aside className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="border border-ink-border bg-ink-raised p-3 shrink-0 flex items-center justify-between">
            <Wordmark size="sm" />
          </div>
          <PlayerHud room={currentDisplayedRoom} playerId={playerId} currentTurnId={currentTurnId} />
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
            bountyPool={currentDisplayedRoom.bountyPool ?? 100}
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
              onUsePass={usePass}
              onEndTurn={endTurn}
              onBuy={buyProperty}
              onPass={passPurchase}
              onPlayWager={playWager}
              onSkipWager={skipWager}
              onRollComplete={handleRollComplete}
            />
          </Board>
        </main>

        {/* COLUMN 3 (RIGHT): Room info, Trades (40%), Properties (60%) */}
        <aside className="h-full min-h-0 flex flex-col gap-3 pr-1 overflow-hidden">
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

          <div className="h-[40%] min-h-0 flex flex-col overflow-hidden">
            <TradePanel room={currentDisplayedRoom} me={displayedMe} />
          </div>
          <div className="h-[60%] min-h-0 flex flex-col overflow-hidden">
            <PropertiesPanel
              room={currentDisplayedRoom}
              me={displayedMe}
              onBuild={buildHouse}
              onSell={sellHouse}
              onMortgage={mortgageProperty}
              onUnmortgage={unmortgageProperty}
            />
          </div>
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
      <div className="border border-amber bg-ink-raised-2 p-6 w-full max-w-md shadow-2xl animate-fade-in">
        <div className="text-center mb-5">
          <p className="text-xs text-amber font-semibold uppercase tracking-widest mb-1">Game over</p>
          <p className="font-display text-3xl text-parchment">{winnerName} wins!</p>
        </div>
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {standings.map((p, i) => (
            <div key={p.id} className="bg-ink/60 border border-ink-border px-3 py-2 flex items-center gap-3 text-sm">
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
  onUsePass,
  onEndTurn,
  onBuy,
  onPass,
  onPlayWager,
  onSkipWager,
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
  onUsePass: () => void;
  onEndTurn: () => void;
  onBuy: () => void;
  onPass: () => void;
  onPlayWager: (amount: number) => void;
  onSkipWager: () => void;
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

            {/* Dynamic Jail Bail Cost Calculation */}
            {(() => {
              const bailCost = (me.prisonCount || 1) * 50;

              return (
                <>
                  {me.inJail && room.turnPhase === "rolling" && (
                    <p className="text-[10px] text-slate leading-tight text-center mb-1">
                      In Holding ({me.jailTurns}/3). Roll doubles{me.freePassCount > 0 ? ", use pass," : ""} or pay ${bailCost}.
                    </p>
                  )}

                  {room.turnPhase === "rolling" && me.inJail && (
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={onPayBail}
                        disabled={me.money < bailCost}
                        className="flex-1 border border-ink-border py-1 text-xs text-parchment hover:border-amber disabled:opacity-40 cursor-pointer transition-colors"
                      >
                        Pay ${bailCost} &amp; roll
                      </button>

                      {me.freePassCount > 0 && (
                        <button
                          onClick={onUsePass}
                          className="flex-1 border border-amber/40 bg-amber/10 py-1 text-xs text-amber hover:border-amber transition-colors font-medium cursor-pointer"
                        >
                          🎟️ Use Pass ({me.freePassCount})
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {room.turnPhase === "rolling" && (
              <button
                onClick={onRoll}
                className="cursor-pointer bg-amber text-ink font-bold py-2 text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md"
              >
                {bonusRoll ? "Roll doubles!" : me.inJail ? "Try doubles" : "Roll dice"}
              </button>
            )}

            {room.turnPhase === "awaiting-wager" && (
              <div className="border border-amber bg-ink-raised-2 p-2 flex flex-col gap-2 rounded">
                <div className="text-center">
                  <p className="text-xs font-bold text-amber uppercase tracking-wider">High Stakes Wager</p>
                  <p className="text-[11px] text-parchment leading-tight mt-0.5">
                    Roll 2 dice: <span className="text-signal font-mono">1–7 Lose</span> | <span className="text-teal font-mono">8–12 Win Double</span>
                  </p>
                </div>
                <div className="flex gap-1.5 justify-center">
                  <button
                    onClick={() => onSkipWager()}
                    className="px-2 py-1 text-xs border border-ink-border text-slate hover:text-parchment transition-colors cursor-pointer"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => onPlayWager(50)}
                    disabled={me.money < 50}
                    className="flex-1 bg-amber/20 border border-amber text-amber font-mono font-bold text-xs py-1 hover:bg-amber hover:text-ink transition-all disabled:opacity-30 cursor-pointer"
                  >
                    Bet $50
                  </button>
                  <button
                    onClick={() => onPlayWager(100)}
                    disabled={me.money < 100}
                    className="flex-1 bg-amber text-ink font-mono font-bold text-xs py-1 hover:opacity-90 transition-opacity disabled:opacity-30 cursor-pointer"
                  >
                    Bet $100
                  </button>
                </div>
              </div>
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

function renderStyledLogMessage(message: string) {
  // We can split or match keywords to apply custom styles
  // For example, splitting by words or checking includes for color tagging
  const parts = message.split(/(\bTwist\b|\bTWIST\b|\bTreasure\b|\bTREASURE\b|\bHigh Stakes\b|\bPrison\b|\bVacation\b|\bdoubles\b|\bbankrupt\b|\bWAGER WIN\b|\bWAGER LOSS\b|\bIncome Tax\b|\bLuxury Toll\b)/g);
  console.log(parts)

  return parts.map((part, index) => {
    switch (part) {
      case "Twist":
      case "TWIST":
        return <span key={index} className="text-purple-500 font-semibold">{part}</span>;
      case "Treasure":
      case "TREASURE":
        return <span key={index} className="text-amber font-semibold">{part}</span>;
      case "WAGER WIN":
        return <span key={index} className="text-green-500 font-semibold">{part}</span>;
      case "WAGER LOSS":
      case "Income Tax":
      case "Luxury Toll":
        return <span key={index} className="text-red-600 font-semibold">{part}</span>;
      case "High Stakes":
        return <span key={index} className="text-purple-300 font-semibold">{part}</span>;
      case "Prison":
        return <span key={index} className="text-signal font-semibold">{part}</span>;
      case "Vacation":
        return <span key={index} className="text-blue-400 font-semibold">{part}</span>;
      case "doubles":
        return <span key={index} className="text-teal font-semibold">{part}</span>;
      case "bankrupt":
        return <span key={index} className="text-signal font-bold">{part}</span>;
      default:
        return part;
    }
  });
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
            {renderStyledLogMessage(entry.message)}
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
          className={`absolute left-0 pointer-events-none font-mono font-bold text-xs whitespace-nowrap ${delta.type === "gain" ? "text-teal" : "text-signal"
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
    <div className="border border-ink-border bg-ink-raised p-3 shrink-0">
      <p className="text-xs font-semibold text-slate uppercase tracking-wider mb-2">Players</p>
      <div className="flex flex-col gap-1.5">
        {room.players.map((p) => {
          const prisonVisits = p.prisonCount || 0;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 border transition-colors ${p.id === currentTurnId ? "border-amber bg-ink-raised-2" : "border-ink-border/50 bg-ink/40"
                } ${p.bankrupt ? "opacity-40" : ""}`}
            >
              <AvatarBadge id={p.avatar} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-parchment truncate mb-0.5">{p.nickname}</p>
                  {p.id === playerId && <span className="text-[10px] text-slate shrink-0">(you)</span>}
                  {p.id === currentTurnId && !p.bankrupt && <span className="text-[10px] text-amber shrink-0">●</span>}

                  {/* Prison Icon & Counter Badge */}
                  {prisonVisits > 0 && (
                    <div
                      className="flex items-center gap-0.5 ml-auto text-signal bg-signal/10 border border-signal/30 px-1 rounded text-[8px] font-mono shrink-0"
                      title={`Jailed ${prisonVisits} ${prisonVisits === 1 ? "time" : "times"}. Bail cost increases by $50 per sentence (Current: $${prisonVisits * 50})`}
                    >
                      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3">
                        <circle cx="50" cy="38" r="18" fill="#e5484d" />
                        <path d="M20,88 C20,68 32,60 50,60 C68,60 80,68 80,88 Z" fill="#e5484d" />
                      </svg>
                      <span>{prisonVisits}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate font-mono">
                  {p.bankrupt ? (
                    <span className="text-signal">Bankrupt</span>
                  ) : (
                    <>
                      <PlayerMoneyDisplay money={p.money} />
                      {ownedCount(p.id) > 0 && <span>{ownedCount(p.id)} owned</span>}
                      {p.inJail && <span className="text-signal font-sans font-medium">Holding</span>}
                      {p.onVacation && <span className="text-blue-400 font-sans font-medium">Vacation</span>}
                      {/* --- Display Free Pass count if they have any --- */}
                      {p.freePassCount && p.freePassCount > 0 ? (
                        <span className="text-amber font-sans font-semibold bg-amber/10 border border-amber/30 px-1 rounded" title="Prison escape pass">
                          🎟️ {p.freePassCount > 1 ? `(${p.freePassCount})` : ""}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getGroupDetails(groupKey: string): { name: string; flag?: string } {
  const g = groupKey.toLowerCase();

  if (g === "nepal") return { name: "Nepal", flag: "/flags/nepal.png" };
  if (g === "russia") return { name: "Russia", flag: "/flags/russia.png" };
  if (g === "spain") return { name: "Spain", flag: "/flags/spain.png" };
  if (g === "germany") return { name: "Germany", flag: "/flags/germany.png" };
  if (g === "japan") return { name: "Japan", flag: "/flags/japan.png" };
  if (g === "uk") return { name: "United Kingdom", flag: "/flags/uk.png" };
  if (g === "uae") return { name: "UAE", flag: "/flags/uae.png" };
  if (g === "usa") return { name: "USA", flag: "/flags/usa.png" };

  if (g === "transit") return { name: "Transit Hubs" };
  if (g === "utility") return { name: "Utilities" };

  return { name: groupKey.charAt(0).toUpperCase() + groupKey.slice(1) };
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
  const { push } = useToast();
  const owned = BOARD.filter((t) => room.ownership[t.index] === me.id);
  const ownedCount = (pid: string) => Object.values(room.ownership).filter((id) => id === pid).length;

  const groupedTiles: { [groupKey: string]: BoardTile[] } = {};
  for (const tile of owned) {
    const key = tile.group ?? tile.kind ?? "other";
    if (!groupedTiles[key]) groupedTiles[key] = [];
    groupedTiles[key].push(tile);
  }

  const groupKeys = Object.keys(groupedTiles);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showArrow, setShowArrow] = useState(false);

  function checkScroll(el: HTMLDivElement | null) {
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setShowArrow(scrollHeight > clientHeight && scrollTop + clientHeight < scrollHeight - 5);
  }

  useEffect(() => {
    checkScroll(scrollRef.current);
  }, [owned.length, groupKeys.length, room]);

  return (
    <div className="border border-ink-border bg-ink-raised p-3 flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-slate uppercase tracking-wider">My Properties</p>
        {ownedCount(me.id) > 0 && (
          <span className="text-[10px] font-mono font-bold bg-amber/20 text-amber px-1.5 py-0.2 rounded-full">
            {ownedCount(me.id)}
          </span>
        )}
      </div>

      {owned.length === 0 ? (
        <p className="text-xs text-slate italic py-4 text-center my-auto">No properties held.</p>
      ) : (
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={(e) => checkScroll(e.currentTarget)}
            className="flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {groupKeys.map((groupKey) => {
              const tilesInGroup = groupedTiles[groupKey];
              const { name: displayName, flag: flagSrc } = getGroupDetails(groupKey);
              const isTransitOrUtility = groupKey === "transit" || groupKey === "utility";
              const buildCost = groupHouseCost(groupKey);
              const sellRefund = Math.floor(buildCost / 2);

              const gridColsClass = groupKey === "transit"
                ? "grid-cols-4"
                : groupKey === "utility"
                  ? "grid-cols-2"
                  : "grid-cols-3";

              return (
                <div key={groupKey} className="border border-ink-border bg-ink/30 p-2 flex flex-col gap-2">
                  {/* Country / Group Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-ink-border/50 pb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {!isTransitOrUtility && (
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-ink-border shrink-0 flex items-center justify-center bg-ink">
                          {flagSrc ? (
                            <img src={flagSrc} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px]">🌐</span>
                          )}
                        </div>
                      )}
                      {isTransitOrUtility && (
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-ink-border shrink-0 flex items-center justify-center bg-ink">
                          {groupKey === "transit" ? (
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                              <rect x="5" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="8.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
                              <circle cx="15.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
                              <path d="M5 10h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                              <path d="M13 3 L6 13 h5 l-1 8 8-11 h-5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      )}
                      <span className="text-xs font-bold text-parchment uppercase tracking-wide truncate">
                        {displayName}
                      </span>
                    </div>

                    {!isTransitOrUtility && (
                      <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                        <span className="text-teal" title="Build House Cost">
                          ▲${buildCost}
                        </span>
                        <span className="text-signal" title="Sell House Refund">
                          ▼${sellRefund}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* City Boxes Grid */}
                  <div className={`grid ${gridColsClass} gap-1.5`}>
                    {tilesInGroup.map((tile) => {
                      const isProperty = tile.kind === "property";
                      const houses = room.houses[tile.index] ?? 0;
                      const mortgaged = Boolean(room.mortgaged[tile.index]);
                      const buildCheck = isProperty ? checkCanBuildHouse(room, tile, me) : null;
                      const sellCheck = isProperty ? checkCanSellHouse(room, tile, me) : null;
                      const mortgageCheck = checkCanMortgage(room, tile, me);
                      const unmortgageCheck = checkCanUnmortgage(room, tile, me);

                      return (
                        <div
                          key={tile.index}
                          className={`border p-1.5 flex flex-col justify-between bg-ink/50 text-center ${!isTransitOrUtility ? "h-24" : ""} ${mortgaged ? "border-signal/50 opacity-80" : "border-ink-border"}`}
                        >
                          {/* Top Section: City Name & Fixed-Height House Indicator Row */}
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-medium text-parchment leading-tight truncate w-full" title={tile.name}>
                              {tile.name}
                            </span>

                            <div className="flex items-center justify-center h-3.5">
                              {mortgaged ? (
                                <span className="text-[10px] text-signal font-semibold">Mortgaged</span>
                              ) : (
                                !isTransitOrUtility && (
                                  houses >= 5 ? (
                                    <span className="text-[8px] font-mono font-bold bg-amber/20 text-amber px-1.5 py-0.2 rounded border border-amber/40 tracking-wider">
                                      HOTEL
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-0.5">
                                      {Array.from({ length: 4 }).map((_, i) => (
                                        <span
                                          key={i}
                                          className={`w-2 h-2 rounded-xs transition-colors ${i < houses ? "bg-amber shadow-xs shadow-amber/50" : "bg-ink-border/40"}`}
                                          title={`${houses} House${houses > 1 ? "s" : ""}`}
                                        />
                                      ))}
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          </div>

                          {/* Middle Section: Action Buttons Row (Sell / Build) */}
                          {!isTransitOrUtility && (
                            <div className="my-1">
                              {isProperty && !mortgaged ? (
                                <div className="grid grid-cols-2 gap-1">
                                  <button
                                    onClick={() => {
                                      if (sellCheck && !sellCheck.ok) {
                                        push(sellCheck.reason ?? "Cannot sell house", "error");
                                      } else {
                                        onSell(tile.index);
                                      }
                                    }}
                                    className={`${!sellCheck?.ok ? "opacity-30" : ""} bg-signal/20 border border-signal text-signal hover:bg-signal hover:text-ink py-1 font-bold transition-all cursor-pointer flex items-center justify-center rounded-xs`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 21l9-10h-5V3H8v8H3l9 10z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (buildCheck && !buildCheck.ok) {
                                        push(buildCheck.reason ?? "Cannot build house", "error");
                                      } else {
                                        onBuild(tile.index);
                                      }
                                    }}
                                    className={`${!buildCheck?.ok ? "opacity-30" : ""} bg-teal/20 border border-teal text-teal hover:bg-teal hover:text-ink font-bold transition-all cursor-pointer flex items-center justify-center rounded-xs`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 3L3 13h5v8h8v-8h5L12 3z" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <div className="h-5.5" />
                              )}
                            </div>
                          )}

                          {/* Bottom Section: Mortgage / Unmortgage Button */}
                          <div>
                            {mortgaged ? (
                              <button
                                onClick={() => {
                                  if (!unmortgageCheck.ok) {
                                    push(unmortgageCheck.reason ?? "Cannot unmortgage", "error");
                                  } else {
                                    onUnmortgage(tile.index);
                                  }
                                }}
                                className={`${!unmortgageCheck.ok ? "opacity-30" : ""} w-full border border-teal text-teal hover:bg-teal/10 ${groupKey === "utility" ? "text-[10px] py-0.5" : "text-[8.5px]"} transition-colors cursor-pointer rounded-xs overflow-clip`}
                              >
                                Unmortgage (${unmortgageCheck.amount ?? ""})
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!mortgageCheck.ok) {
                                    push(mortgageCheck.reason ?? "Cannot mortage", "error");
                                  } else {
                                    onMortgage(tile.index);
                                  }
                                }}
                                className={`${!mortgageCheck.ok ? "opacity-30" : ""} w-full border border-ink-border text-slate hover:border-amber hover:text-amber ${groupKey === "utility" ? "text-[10px] py-0.5" : "text-[8.5px]"} font-medium transition-colors cursor-pointer rounded-xs`}
                              >
                                Mortgage (+${mortgageCheck.amount ?? ""})
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {showArrow && (
            <div className="absolute bottom-1 right-2 pointer-events-none text-amber animate-bounce text-xs font-bold bg-ink/80 px-1.5 pt-1 pb-0.5 rounded-full shadow">
              ▼
            </div>
          )}
        </div>
      )}
    </div>
  );
}