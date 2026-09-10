import { useState } from "react";
import { AvatarBadge } from "./avatars";
import { BOARD, groupColor } from "./board/data";
import { useRoom } from "./RoomContext";
import type { Player, Room, TradeOffer } from "../types";

function tradeableTiles(room: Room, ownerId: string) {
  return BOARD.filter((t) => room.ownership[t.index] === ownerId && (room.houses[t.index] ?? 0) === 0);
}

function SideSummary({ side }: { side: { money: number; tiles: number[] } }) {
  const names = side.tiles.map((i) => BOARD[i]?.name).filter(Boolean);
  const parts: string[] = [];
  if (side.money > 0) parts.push(`$${side.money.toLocaleString()}`);
  parts.push(...names);
  if (parts.length === 0) return <span className="text-slate">nothing</span>;
  return <span className="text-parchment">{parts.join(", ")}</span>;
}

function TradeCard({
  trade,
  players,
  mode,
  onAccept,
  onDecline,
  onCancel,
}: {
  trade: TradeOffer;
  players: Player[];
  mode: "incoming" | "outgoing";
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  const from = players.find((p) => p.id === trade.fromId);
  const to = players.find((p) => p.id === trade.toId);

  return (
    <div className="notch-sm border border-ink-border px-3 py-2 flex flex-col gap-1.5">
      <p className="text-xs text-slate">
        {mode === "incoming" ? `${from?.nickname ?? "Someone"} offers you` : `You offered ${to?.nickname ?? "someone"}`}
      </p>
      <p className="text-sm">
        <SideSummary side={trade.offer} />
      </p>
      <p className="text-xs text-slate">for</p>
      <p className="text-sm">
        <SideSummary side={trade.request} />
      </p>
      <div className="flex gap-2 mt-1">
        {mode === "incoming" ? (
          <>
            <button
              onClick={onDecline}
              className="flex-1 notch-sm border border-ink-border py-1.5 text-xs text-parchment hover:border-signal transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              className="flex-1 notch-sm bg-teal text-ink py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Accept
            </button>
          </>
        ) : (
          <button
            onClick={onCancel}
            className="flex-1 notch-sm border border-ink-border py-1.5 text-xs text-slate hover:border-signal hover:text-signal transition-colors"
          >
            Cancel offer
          </button>
        )}
      </div>
    </div>
  );
}

function TradeComposer({ room, me, players, onClose }: { room: Room; me: Player; players: Player[]; onClose: () => void }) {
  const { proposeTrade } = useRoom();
  const others = players.filter((p) => p.id !== me.id);
  const [counterpartId, setCounterpartId] = useState<string | null>(others[0]?.id ?? null);
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);
  const [offerTiles, setOfferTiles] = useState<number[]>([]);
  const [requestTiles, setRequestTiles] = useState<number[]>([]);
  const [sending, setSending] = useState(false);

  const counterpart = others.find((p) => p.id === counterpartId) ?? null;
  const myTiles = tradeableTiles(room, me.id);
  const theirTiles = counterpart ? tradeableTiles(room, counterpart.id) : [];

  function toggle(list: number[], setList: (v: number[]) => void, index: number) {
    setList(list.includes(index) ? list.filter((i) => i !== index) : [...list, index]);
  }

  async function handleSend() {
    if (!counterpartId || sending) return;
    setSending(true);
    const ok = await proposeTrade(counterpartId, { money: offerMoney, tiles: offerTiles }, { money: requestMoney, tiles: requestTiles });
    setSending(false);
    if (ok) onClose();
  }

  if (others.length === 0) return null;

  return (
    <div className="notch-sm border border-amber bg-ink-raised-2 p-3 flex flex-col gap-3">
      <div>
        <p className="text-xs text-slate mb-2">Trade with</p>
        <div className="flex gap-2 flex-wrap">
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setCounterpartId(p.id);
                setRequestTiles([]);
              }}
              className={`flex items-center gap-1.5 px-2 py-1 notch-sm border text-xs ${
                counterpartId === p.id ? "border-amber text-parchment" : "border-ink-border text-slate"
              }`}
            >
              <AvatarBadge id={p.avatar} size={20} />
              {p.nickname}
            </button>
          ))}
        </div>
      </div>

      {counterpart && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate mb-1">You give</p>
            <input
              type="number"
              min={0}
              max={me.money}
              value={offerMoney}
              onChange={(e) => setOfferMoney(Math.max(0, Number(e.target.value)))}
              className="w-full bg-ink border border-ink-border notch-sm px-2 py-1 text-sm text-parchment mb-2"
              placeholder="$0"
            />
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {myTiles.map((t) => (
                <label key={t.index} className="flex items-center gap-1.5 text-xs text-parchment/90">
                  <input type="checkbox" checked={offerTiles.includes(t.index)} onChange={() => toggle(offerTiles, setOfferTiles, t.index)} />
                  {t.group && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: groupColor(t.group) }} />}
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
              {myTiles.length === 0 && <p className="text-xs text-slate">No tradeable properties.</p>}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate mb-1">You get</p>
            <input
              type="number"
              min={0}
              max={counterpart.money}
              value={requestMoney}
              onChange={(e) => setRequestMoney(Math.max(0, Number(e.target.value)))}
              className="w-full bg-ink border border-ink-border notch-sm px-2 py-1 text-sm text-parchment mb-2"
              placeholder="$0"
            />
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {theirTiles.map((t) => (
                <label key={t.index} className="flex items-center gap-1.5 text-xs text-parchment/90">
                  <input
                    type="checkbox"
                    checked={requestTiles.includes(t.index)}
                    onChange={() => toggle(requestTiles, setRequestTiles, t.index)}
                  />
                  {t.group && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: groupColor(t.group) }} />}
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
              {theirTiles.length === 0 && <p className="text-xs text-slate">Nothing tradeable.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 notch-sm border border-ink-border py-1.5 text-xs text-slate">
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={!counterpartId || sending}
          className="flex-1 notch-sm bg-amber text-ink py-1.5 text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {sending ? "Sending…" : "Send offer"}
        </button>
      </div>
    </div>
  );
}

export default function TradePanel({ room, me }: { room: Room; me: Player }) {
  const { respondToTrade, cancelTrade } = useRoom();
  const [composerOpen, setComposerOpen] = useState(false);

  const incoming = room.trades.filter((t) => t.toId === me.id);
  const outgoing = room.trades.filter((t) => t.fromId === me.id);

  return (
    <div className="notch border border-ink-border bg-ink-raised p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate">Trades</p>
        {!composerOpen && (
          <button onClick={() => setComposerOpen(true)} className="text-xs text-amber hover:opacity-80">
            + Propose
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {composerOpen && <TradeComposer room={room} me={me} players={room.players} onClose={() => setComposerOpen(false)} />}

        {incoming.map((t) => (
          <TradeCard
            key={t.id}
            trade={t}
            players={room.players}
            mode="incoming"
            onAccept={() => respondToTrade(t.id, true)}
            onDecline={() => respondToTrade(t.id, false)}
          />
        ))}

        {outgoing.map((t) => (
          <TradeCard key={t.id} trade={t} players={room.players} mode="outgoing" onCancel={() => cancelTrade(t.id)} />
        ))}

        {!composerOpen && incoming.length === 0 && outgoing.length === 0 && (
          <p className="text-xs text-slate">No active trades.</p>
        )}
      </div>
    </div>
  );
}
