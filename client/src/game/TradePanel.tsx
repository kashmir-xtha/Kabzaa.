import { useState, useRef, useEffect } from "react";
import { AvatarBadge } from "./avatars";
import { BOARD } from "./board/data";
import { useRoom } from "./RoomContext";
import type { Player, Room, TradeOffer } from "../types";

function tradeableTiles(room: Room, ownerId: string) {
  return BOARD.filter((t) => room.ownership[t.index] === ownerId && (room.houses[t.index] ?? 0) === 0);
}

function getTileFlag(tileName: string): string | undefined {
  if (tileName === "Kathmandu" || tileName === "Pokhara") return "/flags/nepal.png";
  if (tileName === "Moscow" || tileName === "Petersburg" || tileName === "Kazan") return "/flags/russia.png";
  if (tileName === "Madrid" || tileName === "Barcelona" || tileName === "Valencia") return "/flags/spain.png";
  if (tileName === "Munich" || tileName === "Frankfurt" || tileName === "Berlin") return "/flags/germany.png";
  if (tileName === "Tokyo" || tileName === "Yokohama" || tileName === "Osaka") return "/flags/japan.png";
  if (tileName === "London" || tileName === "Manchester" || tileName === "Birmingham") return "/flags/uk.png";
  if (tileName === "Dubai" || tileName === "Abu Dhabi" || tileName === "Sharjah") return "/flags/uae.png";
  if (tileName === "New York" || tileName === "Los Angeles") return "/flags/usa.png";
  return undefined;
}

function SideSummary({ side }: { side: { money: number; tiles: number[] } }) {
  const names = side.tiles.map((i) => BOARD[i]?.name).filter(Boolean);
  const parts: string[] = [];
  if (side.money > 0) parts.push(`$${side.money.toLocaleString()}`);
  parts.push(...names);
  if (parts.length === 0) return <span className="text-slate italic">Nothing</span>;
  return <span className="text-parchment font-medium">{parts.join(", ")}</span>;
}

function TradeCard({
  trade,
  players,
  mode,
  onAccept,
  onDecline,
  onCounter,
  onCancel,
}: {
  trade: TradeOffer;
  players: Player[];
  mode: "incoming" | "outgoing";
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onCancel?: () => void;
}) {
  const from = players.find((p) => p.id === trade.fromId);
  const to = players.find((p) => p.id === trade.toId);

  return (
    <div className={`notch-sm border px-3 py-2.5 flex flex-col gap-2 transition-all ${
      mode === "incoming" ? "border-teal/40 bg-teal/5" : "border-ink-border bg-ink/40"
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          mode === "incoming" ? "bg-teal/20 text-teal" : "bg-slate/20 text-slate"
        }`}>
          {mode === "incoming" ? `Incoming from ${from?.nickname ?? "Someone"}` : `Outgoing to ${to?.nickname ?? "Someone"}`}
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <span className="text-slate font-mono">Offer:</span>
        <SideSummary side={trade.offer} />
        
        <span className="text-slate font-mono">Wants:</span>
        <SideSummary side={trade.request} />
      </div>

      <div className="flex gap-2 mt-1 pt-1 border-t border-ink-border/40">
        {mode === "incoming" ? (
          <>
            <button
              onClick={onDecline}
              className="flex-1 notch-sm border border-ink-border py-1 text-xs text-slate hover:border-signal hover:text-signal transition-colors cursor-pointer"
            >
              Decline
            </button>
            <button
              onClick={onCounter}
              className="flex-1 notch-sm border border-amber text-amber py-1 text-xs font-semibold hover:bg-amber/10 transition-colors cursor-pointer"
            >
              Counter
            </button>
            <button
              onClick={onAccept}
              className="flex-1 notch-sm bg-teal text-ink py-1 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            >
              Accept
            </button>
          </>
        ) : (
          <button
            onClick={onCancel}
            className="w-full notch-sm border border-ink-border py-1 text-xs text-slate hover:border-signal hover:text-signal transition-colors cursor-pointer"
          >
            Cancel offer
          </button>
        )}
      </div>
    </div>
  );
}

function TradeComposer({
  room,
  me,
  players,
  initialData,
  onClose,
}: {
  room: Room;
  me: Player;
  players: Player[];
  initialData?: { counterpartId: string; offerMoney: number; offerTiles: number[]; requestMoney: number; requestTiles: number[] };
  onClose: () => void;
}) {
  const { proposeTrade } = useRoom();
  const others = players.filter((p) => p.id !== me.id);
  
  const [counterpartId, setCounterpartId] = useState<string | null>(initialData?.counterpartId ?? others[0]?.id ?? null);
  const [offerMoney, setOfferMoney] = useState<number>(initialData?.offerMoney ?? 0);
  const [requestMoney, setRequestMoney] = useState<number>(initialData?.requestMoney ?? 0);
  const [offerTiles, setOfferTiles] = useState<number[]>(initialData?.offerTiles ?? []);
  const [requestTiles, setRequestTiles] = useState<number[]>(initialData?.requestTiles ?? []);
  const [sending, setSending] = useState(false);

  const giveScrollRef = useRef<HTMLDivElement>(null);
  const getScrollRef = useRef<HTMLDivElement>(null);

  const [showGiveArrow, setShowGiveArrow] = useState(false);
  const [showGetArrow, setShowGetArrow] = useState(false);

  const counterpart = others.find((p) => p.id === counterpartId) ?? null;
  const myTiles = tradeableTiles(room, me.id);
  const theirTiles = counterpart ? tradeableTiles(room, counterpart.id) : [];

  function checkScroll(el: HTMLDivElement | null, setArrow: (v: boolean) => void) {
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setArrow(scrollHeight > clientHeight && scrollTop + clientHeight < scrollHeight - 5);
  }

  useEffect(() => {
    checkScroll(giveScrollRef.current, setShowGiveArrow);
    checkScroll(getScrollRef.current, setShowGetArrow);
  }, [counterpartId, myTiles.length, theirTiles.length]);

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
    <div 
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-x-hidden cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="notch border border-amber bg-ink-raised-2 p-5 w-full max-w-xl shadow-2xl flex flex-col gap-4 animate-fade-in overflow-x-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-border pb-2">
          <p className="text-xs font-bold text-amber uppercase tracking-wider">Propose Trade Agreement</p>
          <button onClick={onClose} className="text-xs text-slate hover:text-parchment cursor-pointer">✕</button>
        </div>

        <div>
          <p className="text-[11px] text-slate uppercase tracking-wider mb-1.5">Select Partner</p>
          <div className="flex gap-2 flex-wrap">
            {others.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setCounterpartId(p.id);
                  setRequestTiles([]);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 notch-sm border text-xs cursor-pointer transition-colors ${
                  counterpartId === p.id ? "border-amber bg-amber/10 text-parchment font-medium" : "border-ink-border bg-ink/40 text-slate hover:border-slate"
                }`}
              >
                <AvatarBadge id={p.avatar} size={22} />
                {p.nickname}
              </button>
            ))}
          </div>
        </div>

        {counterpart && (
          <div className="grid grid-cols-2 gap-4 my-1 overflow-x-hidden">
            {/* You Give */}
            <div className="flex flex-col gap-2.5 p-1 overflow-x-hidden relative">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-signal">You Give</p>
                <span className="text-[10px] font-mono text-slate">Bal: ${me.money.toLocaleString()}</span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono text-signal font-bold">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={offerMoney === 0 ? "" : offerMoney}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, "");
                    const val = cleaned === "" ? 0 : Math.min(me.money, Number(cleaned));
                    setOfferMoney(val);
                  }}
                  className="w-full bg-transparent text-sm font-mono text-signal outline-none placeholder:text-slate/40"
                  placeholder="0"
                />
              </div>

              <div 
                ref={giveScrollRef}
                onScroll={(e) => checkScroll(e.currentTarget, setShowGiveArrow)}
                className="flex flex-col gap-1.5 max-h-44 overflow-y-auto overflow-x-hidden pr-1 scrollbar-none [&::-webkit-scrollbar]:hidden relative"
              >
                {myTiles.map((t) => {
                  const isSelected = offerTiles.includes(t.index);
                  const flagSrc = getTileFlag(t.name);

                  return (
                    <div
                      key={t.index}
                      onClick={() => toggle(offerTiles, setOfferTiles, t.index)}
                      className={`flex items-center gap-2 py-1.5 px-1 cursor-pointer transition-all duration-200 transform ${
                        isSelected 
                          ? "text-signal font-semibold translate-x-2" 
                          : "text-parchment/80 hover:text-parchment hover:translate-x-1"
                      }`}
                    >
                      {flagSrc ? (
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-ink-border shrink-0 flex items-center justify-center bg-ink">
                          <img src={flagSrc} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-ink-border/40 shrink-0 flex items-center justify-center text-[9px] font-mono">🏠</div>
                      )}
                      <span className="text-xs truncate">{t.name}</span>
                    </div>
                  );
                })}
                {myTiles.length === 0 && <p className="text-[11px] text-slate italic py-2">No tradeable properties.</p>}
              </div>

              {showGiveArrow && (
                <div className="absolute bottom-1 right-2 pointer-events-none text-signal animate-bounce text-xs font-bold">
                  ▼
                </div>
              )}
            </div>

            {/* You Get */}
            <div className="flex flex-col gap-2.5 p-1 overflow-x-hidden relative">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal">You Get</p>
                <span className="text-[10px] font-mono text-slate">Bal: ${counterpart.money.toLocaleString()}</span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono text-teal font-bold">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={requestMoney === 0 ? "" : requestMoney}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, "");
                    const val = cleaned === "" ? 0 : Math.min(counterpart.money, Number(cleaned));
                    setRequestMoney(val);
                  }}
                  className="w-full bg-transparent text-sm font-mono text-teal outline-none placeholder:text-slate/40"
                  placeholder="0"
                />
              </div>

              <div 
                ref={getScrollRef}
                onScroll={(e) => checkScroll(e.currentTarget, setShowGetArrow)}
                className="flex flex-col gap-1.5 max-h-44 overflow-y-auto overflow-x-hidden pr-1 scrollbar-none [&::-webkit-scrollbar]:hidden relative"
              >
                {theirTiles.map((t) => {
                  const isSelected = requestTiles.includes(t.index);
                  const flagSrc = getTileFlag(t.name);

                  return (
                    <div
                      key={t.index}
                      onClick={() => toggle(requestTiles, setRequestTiles, t.index)}
                      className={`flex items-center gap-2 py-1.5 px-1 cursor-pointer transition-all duration-200 transform ${
                        isSelected 
                          ? "text-teal font-semibold translate-x-2" 
                          : "text-parchment/80 hover:text-parchment hover:translate-x-1"
                      }`}
                    >
                      {flagSrc ? (
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-ink-border shrink-0 flex items-center justify-center bg-ink">
                          <img src={flagSrc} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-ink-border/40 shrink-0 flex items-center justify-center text-[9px] font-mono">🏠</div>
                      )}
                      <span className="text-xs truncate">{t.name}</span>
                    </div>
                  );
                })}
                {theirTiles.length === 0 && <p className="text-[11px] text-slate italic py-2">Nothing tradeable.</p>}
              </div>

              {showGetArrow && (
                <div className="absolute bottom-1 right-2 pointer-events-none text-teal animate-bounce text-xs font-bold">
                  ▼
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-ink-border">
          <button onClick={onClose} className="flex-1 notch-sm border border-ink-border py-1.5 text-xs text-slate hover:text-parchment cursor-pointer transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!counterpartId || sending}
            className="flex-1 notch-sm bg-amber text-ink py-1.5 text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer shadow-md"
          >
            {sending ? "Dispatching…" : "Dispatch Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TradePanel({ room, me }: { room: Room; me: Player }) {
  const { respondToTrade, cancelTrade } = useRoom();
  const [composerOpen, setComposerOpen] = useState(false);
  const [counterData, setCounterData] = useState<{ counterpartId: string; offerMoney: number; offerTiles: number[]; requestMoney: number; requestTiles: number[] } | undefined>(undefined);

  const incoming = room.trades.filter((t) => t.toId === me.id);
  const outgoing = room.trades.filter((t) => t.fromId === me.id);
  const totalActiveCount = incoming.length + outgoing.length;

  function handleOpenNew() {
    setCounterData(undefined);
    setComposerOpen(true);
  }

  function handleCounter(t: TradeOffer) {
    // Reverse offer vs request for counter-proposal
    setCounterData({
      counterpartId: t.fromId,
      offerMoney: t.request.money,
      offerTiles: [...t.request.tiles],
      requestMoney: t.offer.money,
      requestTiles: [...t.offer.tiles],
    });
    setComposerOpen(true);
  }

  return (
    <>
      <div className="notch border border-ink-border bg-ink-raised p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate uppercase tracking-wider">Active Trades</p>
            {totalActiveCount > 0 && (
              <span className="text-[10px] font-mono font-bold bg-amber/20 text-amber px-1.5 py-0.2 rounded-full">
                {totalActiveCount}
              </span>
            )}
          </div>
          <button 
            onClick={handleOpenNew} 
            className="text-xs font-medium text-amber hover:text-amber/80 transition-colors cursor-pointer"
          >
            + Propose
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
          {incoming.map((t) => (
            <TradeCard
              key={t.id}
              trade={t}
              players={room.players}
              mode="incoming"
              onAccept={() => respondToTrade(t.id, true)}
              onDecline={() => respondToTrade(t.id, false)}
              onCounter={() => handleCounter(t)}
            />
          ))}

          {outgoing.map((t) => (
            <TradeCard key={t.id} trade={t} players={room.players} mode="outgoing" onCancel={() => cancelTrade(t.id)} />
          ))}

          {totalActiveCount === 0 && (
            <p className="text-xs text-slate italic py-2 text-center">No active trades currently open.</p>
          )}
        </div>
      </div>

      {composerOpen && (
        <TradeComposer 
          room={room} 
          me={me} 
          players={room.players} 
          initialData={counterData} 
          onClose={() => {
            setComposerOpen(false);
            setCounterData(undefined);
          }} 
        />
      )}
    </>
  );
}