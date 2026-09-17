import { useState } from "react";
import Wordmark from "../components/Wordmark";
import { AVATARS, AvatarBadge } from "../game/avatars";
import Chat from "../game/Chat";
import { useRoom } from "../game/RoomContext";
import { useToast } from "../components/Toast";
import type { Room } from "../types";

function startBlockedReason(room: Room): string | null {
  if (room.players.length < 2) return "Need at least 2 players to start.";
  if (!room.players.every((p) => p.ready)) return "Waiting for everyone to be ready.";
  if (room.mode === "teams") {
    if (room.players.some((p) => p.teamId === null)) return "Everyone needs to join a team.";
    if (room.teams.some((t) => t.memberIds.length === 0)) return "Both teams need at least one player.";
  }
  return null;
}

export default function Lobby() {
  const { room, me, isHost, leaveRoom, selectMode, selectTeam, selectAvatar, changeSettings, startGame, kickPlayer } = useRoom();
  const { push } = useToast();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  if (!room || !me) return null;

  const blockedReason = startBlockedReason(room);

  function copyCode() {
    navigator.clipboard.writeText(room!.code).then(() => push("Room code copied.", "success"));
  }

  const sortedPlayers = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <div className="h-dvh overflow-hidden flex flex-col p-4">
      <header className="flex-none flex flex-wrap items-center justify-between gap-4 mb-5">
        <Wordmark size="sm" />

        <div className="flex items-center gap-3">
          <button
            onClick={copyCode}
            className="notch-sm border border-ink-border bg-ink-raised px-4 py-2 flex items-center gap-3 hover:border-amber transition-colors cursor-pointer"
          >
            <span className="text-xs text-slate">Room code</span>
            <span className="font-display text-sm tracking-[0.2em] text-amber">{room.code}</span>
          </button>
          {!confirmingLeave ? (
            <button
              onClick={() => setConfirmingLeave(true)}
              className="notch-sm border border-ink-border px-4 py-2 text-sm text-slate hover:text-signal hover:border-signal transition-colors cursor-pointer"
            >
              Leave
            </button>
          ) : (
            <div className="notch-sm border border-signal px-3 py-2 flex items-center gap-2 text-sm">
              <span className="text-parchment">Leave room?</span>
              <button onClick={leaveRoom} className="text-signal font-semibold cursor-pointer">
                Yes
              </button>
              <button onClick={() => setConfirmingLeave(false)} className="text-slate cursor-pointer">
                No
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1fr)_360px] gap-6 md:gap-8">
        {/* Roster + chat */}
        <div className="min-h-0 flex flex-col gap-4">
          <section className="flex-none">
            <h2 className="text-sm font-medium text-slate mb-3">
              Players <span className="text-parchment/60">({room.players.length}/{room.settings.maxPlayers})</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {sortedPlayers.map((p) => {
                const team = room.teams.find((t) => t.id === p.teamId);
                return (
                  <div
                    key={p.id}
                    className={`notch border px-4 py-3 flex items-center gap-3 bg-ink-raised transition-colors ${
                      p.id === me.id ? "border-amber" : "border-ink-border"
                    } ${!p.connected ? "opacity-50" : ""}`}
                  >
                    <AvatarBadge id={p.avatar} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-parchment truncate">{p.nickname}</p>
                        {p.id === me.id && <span className="text-xs text-slate shrink-0">(you)</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs">
                        {p.isHost && <span className="text-amber">Host</span>}
                        {team && (
                          <span style={{ color: team.color }}>{team.name}</span>
                        )}
                        {!p.connected && <span className="text-slate">Reconnecting…</span>}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 notch-sm shrink-0 ${
                        p.ready ? "bg-teal/15 text-teal" : "bg-ink-raised-2 text-slate"
                      }`}
                    >
                      {p.ready ? "Ready" : "Not ready"}
                    </span>
                    {isHost && p.id !== me.id && (
                      <button
                        onClick={() => kickPlayer(p.id)}
                        className="text-xs text-slate hover:text-signal transition-colors shrink-0 cursor-pointer"
                      >
                        Kick
                      </button>
                    )}
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, room.settings.maxPlayers - room.players.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="notch border border-dashed border-ink-border px-4 py-3 flex items-center gap-3 text-slate/60"
                >
                  <div className="notch-sm w-11 h-11 border border-dashed border-ink-border shrink-0" />
                  <p className="text-sm">Waiting for a player…</p>
                </div>
              ))}
            </div>
          </section>

          <div className="flex-1 min-h-0">
            <Chat messages={room.chatMessages} myPlayerId={me.id} />
          </div>
        </div>

        {/* Setup panel */}
        <aside className="notch border border-ink-border bg-ink-raised p-5 flex flex-col gap-5 min-h-0 overflow-y-auto">
          <div>
            <p className="text-sm font-medium text-slate mb-3">Your avatar</p>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => {
                const takenBy = room.players.find((p) => p.avatar === a.id && p.id !== me.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => !takenBy && selectAvatar(a.id)}
                    disabled={Boolean(takenBy)}
                    aria-label={a.label}
                    aria-pressed={me.avatar === a.id}
                    title={takenBy ? `Taken by ${takenBy.nickname}` : a.label}
                    className={`focus:outline-none ${takenBy ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <AvatarBadge id={a.id} size={36} selected={me.avatar === a.id} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate mb-3">Mode</p>
            <div className="flex notch-sm overflow-hidden border border-ink-border">
              {(["casual", "teams"] as const).map((m) => (
                <button
                  key={m}
                  disabled={!isHost}
                  onClick={() => selectMode(m)}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                    room.mode === m ? "bg-amber text-ink" : "bg-transparent text-slate"
                  } ${isHost ? "hover:text-parchment cursor-pointer" : "cursor-default"}`}
                >
                  {m === "casual" ? "Free-for-all" : "Teams"}
                </button>
              ))}
            </div>
            {!isHost && <p className="text-xs text-slate mt-2">Only the host can change the mode.</p>}
          </div>

          {room.mode === "teams" && (
            <div>
              <p className="text-sm font-medium text-slate mb-3">Your team</p>
              <div className="flex flex-col gap-2">
                {room.teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    className={`notch-sm border px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                      me.teamId === t.id ? "border-2" : "border-ink-border"
                    }`}
                    style={me.teamId === t.id ? { borderColor: t.color } : undefined}
                  >
                    <span style={{ color: t.color }} className="font-medium">
                      {t.name}
                    </span>
                    <span className="text-slate text-xs">{t.memberIds.length}/3</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isHost && (
            <div>
              <p className="text-sm font-medium text-slate mb-3">Settings</p>
              <div className="flex flex-col gap-3 text-sm">
                <SettingsStepper
                  label="Max players"
                  value={room.settings.maxPlayers}
                  min={2}
                  max={6}
                  onChange={(v) => changeSettings({ maxPlayers: v })}
                />
                <SettingsStepper
                  label="Starting cash"
                  value={room.settings.startingMoney}
                  min={500}
                  max={10000}
                  step={500}
                  format={(v) => `$${v.toLocaleString()}`}
                  onChange={(v) => changeSettings({ startingMoney: v })}
                />
                <div className="flex items-center justify-between">
                  <span className="text-slate">Turn timer</span>
                  <button
                    onClick={() => changeSettings({ turnTimerEnabled: !room.settings.turnTimerEnabled })}
                    className={`notch-sm px-3 py-1 text-xs font-medium border cursor-pointer ${
                      room.settings.turnTimerEnabled ? "bg-teal text-ink border-teal" : "border-ink-border text-slate"
                    }`}
                  >
                    {room.settings.turnTimerEnabled ? "On" : "Off"}
                  </button>
                </div>
                {room.settings.turnTimerEnabled && (
                  <SettingsStepper
                    label="Seconds per turn"
                    value={room.settings.turnTimerSeconds}
                    min={15}
                    max={180}
                    step={15}
                    onChange={(v) => changeSettings({ turnTimerSeconds: v })}
                  />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-ink-border pt-4 flex flex-col gap-3">
            {isHost ? (
              <>
                <button
                  onClick={startGame}
                  disabled={Boolean(blockedReason)}
                  className="notch bg-amber text-ink font-semibold py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Start game
                </button>
                {blockedReason && <p className="text-xs text-slate text-center">{blockedReason}</p>}
              </>
            ) : (
              <p className="text-xs text-slate text-center">Waiting on the host to start the game.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SettingsStepper({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-7 h-7 notch-sm border border-ink-border text-parchment hover:border-amber"
        >
          −
        </button>
        <span className="w-16 text-center text-parchment tabular-nums">{format ? format(value) : value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-7 h-7 notch-sm border border-ink-border text-parchment hover:border-amber"
        >
          +
        </button>
      </div>
    </div>
  );
}
