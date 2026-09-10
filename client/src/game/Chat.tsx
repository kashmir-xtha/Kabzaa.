import { useEffect, useRef, useState, type FormEvent } from "react";
import { AvatarBadge } from "./avatars";
import { useRoom } from "./RoomContext";
import type { ChatMessage } from "../types";

export default function Chat({ messages, myPlayerId }: { messages: ChatMessage[]; myPlayerId: string }) {
  const { sendChatMessage } = useRoom();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    sendChatMessage(trimmed);
    setText("");
  }

  return (
    <div className="notch border border-ink-border bg-ink-raised p-4 flex flex-col h-full min-h-0">
      <p className="text-sm font-medium text-slate mb-3">Chat</p>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1 mb-3">
        {messages.length === 0 && <p className="text-xs text-slate">Say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.playerId === myPlayerId ? "flex-row-reverse text-right" : ""}`}>
            <AvatarBadge id={m.avatar} size={24} />
            <div className="min-w-0">
              <p className="text-[10px] text-slate">{m.nickname}</p>
              <p className="text-sm text-parchment/90 break-words">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 300))}
          placeholder="Say something…"
          className="flex-1 min-w-0 bg-ink border border-ink-border notch-sm px-3 py-1.5 text-sm text-parchment placeholder:text-slate/70 outline-none focus:border-amber transition-colors"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="notch-sm bg-amber text-ink px-3 py-1.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          Send
        </button>
      </form>
    </div>
  );
}
