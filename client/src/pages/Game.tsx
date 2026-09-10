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

  if (!room || !me || !playerId) return null;

  const currentTurnId = room.turnOrder[room.currentTurnIndex];
  const currentPlayer = room.players.find((p) => p.id === currentTurnId) ?? null;
  const isMyTurn = currentTurnId === playerId;
  const gameOver = room.status === "finished";

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      {gameOver && <GameOverBanner room={room} />}

      <header className="flex items-center justify-between mb-6">
        <Wordmark size="sm" />
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate">Room {room.code}</span>
          {!me.bankrupt && !gameOver && (
            confirmingForfeit ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate">Give up?</span>
                <button onClick={forfeitGame} className="text-signal font-semibold">
                  Yes
                </button>
                <button onClick={() => setConfirmingForfeit(false)} className="text-slate">
                  No
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmingForfeit(true)} className="text-xs text-slate hover:text-signal transition-colors">
                Forfeit
              </button>
            )
          )}
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <Board players={room.players} ownership={room.ownership} houses={room.houses}>
          <CenterPanel
            room={room}
            currentPlayer={currentPlayer}
            isMyTurn={isMyTurn && !gameOver}
            me={me}
            onRoll={rollDice}
            onPayBail={payBail}
            onEndTurn={endTurn}
            onBuy={buyProperty}
            onPass={passPurchase}
          />
        </Board>

        <aside className="flex flex-col gap-4">
          <PlayerHud room={room} playerId={playerId} currentTurnId={currentTurnId} />
          <TradePanel room={room} me={me} />
          <PropertiesPanel
            room={room}
            me={me}
            onBuild={buildHouse}
            onSell={sellHouse}
            onMortgage={mortgageProperty}
            onUnmortgage={unmortgageProperty}
          />
          <div className="h-64">
            <Chat messages={room.chatMessages} myPlayerId={me.id} />
          </div>
          <EventLog room={room} />
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
    <div className="mb-6 notch border border-amber bg-ink-raised-2 px-6 py-5">
      <div className="text-center mb-4">
        <p className="text-xs text-amber uppercase tracking-wide mb-1">Game over</p>
        <p className="font-display text-3xl text-parchment">{winnerName} wins!</p>
      </div>
      <div className="max-w-sm mx-auto flex flex-col gap-1.5">
        {standings.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 text-sm">
            <span className="text-slate w-4 text-right">{i + 1}</span>
            <AvatarBadge id={p.avatar} size={24} />
            <span className={`flex-1 truncate ${p.bankrupt ? "text-slate line-through" : "text-parchment"}`}>{p.nickname}</span>
            <span className="tabular-nums text-parchment/90">${netWorth(room, p).toLocaleString()}</span>
          </div>
        ))}
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
    <p className={`text-xs mt-1 tabular-nums ${low ? "text-signal" : "text-slate"}`}>
      {secondsLeft}s left this turn
    </p>
  );
}

function CenterPanel({
  room,
  currentPlayer,
  isMyTurn,
  me,
  onRoll,
  onPayBail,
  onEndTurn,
  onBuy,
  onPass,
}: {
  room: Room;
  currentPlayer: Player | null;
  isMyTurn: boolean;
  me: Player;
  onRoll: () => void;
  onPayBail: () => void;
  onEndTurn: () => void;
  onBuy: () => void;
  onPass: () => void;
}) {
  const bonusRoll = room.turnPhase === "rolling" && room.lastRoll?.isDoubles;
  const tile = tileAt(me.position);

  if (room.status === "finished") {
    return (
      <div className="flex flex-col items-center gap-2 text-center max-w-[280px]">
        <Wordmark size="sm" />
        <p className="text-sm text-slate">Thanks for playing.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center max-w-[280px]">
      <Wordmark size="sm" />

      <div>
        <p className="text-xs text-slate uppercase tracking-wide">
          {isMyTurn ? "Your turn" : "Now playing"}
        </p>
        <p className="font-display text-2xl text-parchment mt-0.5">
          {isMyTurn ? "You" : currentPlayer?.nickname ?? "…"}
        </p>
        {room.settings.turnTimerEnabled && room.turnDeadline && <TurnCountdown deadline={room.turnDeadline} />}
      </div>

      {room.lastRoll ? (
        <Dice die1={room.lastRoll.die1} die2={room.lastRoll.die2} />
      ) : (
        <div className="h-14 flex items-center text-sm text-slate">Waiting to roll…</div>
      )}

      {me.bankrupt ? (
        <p className="text-sm text-slate">You're out of the game — spectating.</p>
      ) : isMyTurn ? (
        <div className="flex flex-col gap-2 w-full">
          {room.turnPhase === "awaiting-purchase" && (
            <div className="notch-sm border border-amber bg-ink-raised-2 px-3 py-3 flex flex-col gap-2">
              <p className="text-sm text-parchment font-medium">{tileAt(me.position).name}</p>
              <p className="text-xs text-slate">Buy for ${tileAt(me.position).price}?</p>
              <div className="flex gap-2">
                <button
                  onClick={onPass}
                  className="flex-1 notch-sm border border-ink-border py-2 text-sm text-parchment hover:border-signal transition-colors"
                >
                  Pass
                </button>
                <button
                  onClick={onBuy}
                  disabled={me.money < (tile.price ?? 0)}
                  className="flex-1 notch-sm bg-amber text-ink font-semibold py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  Buy
                </button>
              </div>
            </div>
          )}

          {me.inJail && room.turnPhase === "rolling" && (
            <p className="text-xs text-slate">
              In Holding — try {me.jailTurns}/3 for doubles, or pay ${50} to leave now.
            </p>
          )}

          {room.turnPhase === "rolling" && me.inJail && (
            <button
              onClick={onPayBail}
              disabled={me.money < 50}
              className="notch-sm border border-ink-border py-2 text-sm text-parchment hover:border-amber disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Pay $50 &amp; roll
            </button>
          )}

          {room.turnPhase === "rolling" && (
            <button
              onClick={onRoll}
              className="notch bg-amber text-ink font-semibold py-3 text-sm hover:opacity-90 transition-opacity"
            >
              {bonusRoll ? "Roll again — doubles!" : me.inJail ? "Roll for doubles" : "Roll dice"}
            </button>
          )}

          {room.turnPhase === "rolled" && (
            <button
              onClick={onEndTurn}
              className="notch bg-teal text-ink font-semibold py-3 text-sm hover:opacity-90 transition-opacity"
            >
              End turn
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate">Waiting for {currentPlayer?.nickname ?? "the next player"}…</p>
      )}
    </div>
  );
}

function PlayerHud({ room, playerId, currentTurnId }: { room: Room; playerId: string; currentTurnId: string }) {
  const ownedCount = (pid: string) => Object.values(room.ownership).filter((id) => id === pid).length;

  return (
    <div className="notch border border-ink-border bg-ink-raised p-4">
      <p className="text-sm font-medium text-slate mb-3">Players</p>
      <div className="flex flex-col gap-2">
        {room.players.map((p) => (
          <div
            key={p.id}
            className={`notch-sm flex items-center gap-3 px-3 py-2 border ${
              p.id === currentTurnId ? "border-amber bg-ink-raised-2" : "border-transparent"
            } ${p.bankrupt ? "opacity-40" : ""}`}
          >
            <AvatarBadge id={p.avatar} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-parchment truncate">{p.nickname}</p>
                {p.id === playerId && <span className="text-xs text-slate shrink-0">(you)</span>}
                {p.id === currentTurnId && !p.bankrupt && <span className="text-xs text-amber shrink-0">●</span>}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate">
                {p.bankrupt ? (
                  <span className="text-signal">Bankrupt</span>
                ) : (
                  <>
                    <span className="tabular-nums text-parchment/90">${p.money.toLocaleString()}</span>
                    {ownedCount(p.id) > 0 && <span>{ownedCount(p.id)} owned</span>}
                    {p.inJail && <span className="text-signal">In Holding</span>}
                    {!p.connected && <span>Reconnecting…</span>}
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
    <div className="notch border border-ink-border bg-ink-raised p-4">
      <p className="text-sm font-medium text-slate mb-3">My properties</p>
      <div className="flex flex-col gap-2">
        {owned.map((tile) => {
          const isProperty = tile.kind === "property";
          const houses = room.houses[tile.index] ?? 0;
          const mortgaged = Boolean(room.mortgaged[tile.index]);
          const buildCheck = isProperty ? checkCanBuildHouse(room, tile, me) : null;
          const sellCheck = isProperty ? checkCanSellHouse(room, tile, me) : null;
          const mortgageCheck = checkCanMortgage(room, tile, me);
          const unmortgageCheck = checkCanUnmortgage(room, tile, me);

          return (
            <div key={tile.index} className={`notch-sm border px-3 py-2 ${mortgaged ? "border-signal/50" : "border-ink-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {tile.group && (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: groupColor(tile.group) }} />
                  )}
                  <span className="text-sm text-parchment truncate">{tile.name}</span>
                </div>
                {mortgaged ? (
                  <span className="text-xs text-signal shrink-0">Mortgaged</span>
                ) : (
                  houses > 0 && <span className="text-xs text-slate shrink-0">{houses >= 5 ? "Hotel" : `${houses}🏠`}</span>
                )}
              </div>

              {isProperty && !mortgaged && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onSell(tile.index)}
                    disabled={!sellCheck?.ok}
                    title={sellCheck?.reason}
                    className="flex-1 notch-sm border border-ink-border py-1 text-xs text-parchment disabled:opacity-30 disabled:cursor-not-allowed hover:border-signal transition-colors"
                  >
                    Sell {sellCheck?.cost !== undefined ? `+$${sellCheck.cost}` : ""}
                  </button>
                  <button
                    onClick={() => onBuild(tile.index)}
                    disabled={!buildCheck?.ok}
                    title={buildCheck?.reason}
                    className="flex-1 notch-sm bg-amber text-ink py-1 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    Build ${groupHouseCost(tile.group)}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">
                {mortgaged ? (
                  <button
                    onClick={() => onUnmortgage(tile.index)}
                    disabled={!unmortgageCheck.ok}
                    title={unmortgageCheck.reason}
                    className="flex-1 notch-sm border border-teal text-teal py-1 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-teal/10 transition-colors"
                  >
                    Unmortgage ${unmortgageCheck.amount ?? ""}
                  </button>
                ) : (
                  <button
                    onClick={() => onMortgage(tile.index)}
                    disabled={!mortgageCheck.ok}
                    title={mortgageCheck.reason}
                    className="flex-1 notch-sm border border-ink-border py-1 text-xs text-slate disabled:opacity-30 disabled:cursor-not-allowed hover:border-amber hover:text-amber transition-colors"
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
        <p className="text-xs text-slate mt-1">Own every tile in a color group to build houses.</p>
      )}
    </div>
  );
}

function EventLog({ room }: { room: Room }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [room.log.length]);

  return (
    <div className="notch border border-ink-border bg-ink-raised p-4 flex flex-col min-h-0">
      <p className="text-sm font-medium text-slate mb-3">Log</p>
      <div ref={ref} className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
        {room.log.map((entry) => (
          <p key={entry.id} className="text-xs text-slate leading-relaxed">
            {entry.message}
          </p>
        ))}
      </div>
    </div>
  );
}
