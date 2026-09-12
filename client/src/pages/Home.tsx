import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Wordmark from "../components/Wordmark";
import { AVATARS, AvatarBadge } from "../game/avatars";
import { loadIdentity } from "../game/identity";
import { useRoom } from "../game/RoomContext";

type Mode = "create" | "join";

export default function Home() {
  const { createRoom, joinRoom, connected } = useRoom();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("create");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0].id);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = loadIdentity();
    if (saved) {
      setNickname(saved.nickname);
      setAvatar(saved.avatar);
    }
  }, []);

  const canSubmit = nickname.trim().length > 0 && (mode === "create" || code.trim().length >= 4) && connected;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const ok =
      mode === "create" ? await createRoom(nickname, avatar) : await joinRoom(code, nickname, avatar);
    setSubmitting(false);
    if (ok) navigate("/lobby");
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      {/* Brand panel */}
      <div className="relative flex flex-col justify-between px-8 py-10 md:px-14 md:py-16 bg-ink-raised border-b md:border-b-0 md:border-r border-ink-border overflow-hidden">
        <div className="relative z-10">
          <Wordmark />
          <p className="mt-4 max-w-sm text-slate text-lg leading-relaxed">
            Buy property, strike deals, and bankrupt your friends — live, in the same
            room code.
          </p>
        </div>

        <div className="relative z-10 hidden md:flex flex-col gap-3 mt-16">
          {[
            "No accounts. Just a nickname and a room code.",
            "Up to six players, real dice, real trades.",
            "Play solo or in teams.",
          ].map((line) => (
            <div key={line} className="flex items-start gap-3 text-parchment/90">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber shrink-0" />
              <span className="text-sm">{line}</span>
            </div>
          ))}
        </div>

        <DecorativeTiles />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 md:px-14">
        <form onSubmit={handleSubmit} className="w-full max-w-md">
          <div className="flex notch-sm overflow-hidden border border-ink-border mb-8 w-fit">
            <TabButton active={mode === "create"} onClick={() => setMode("create")}>
              New game
            </TabButton>
            <TabButton active={mode === "join"} onClick={() => setMode("join")}>
              Join game
            </TabButton>
          </div>

          <label className="block text-sm font-medium text-slate mb-2" htmlFor="nickname">
            Your nickname
          </label>
          <input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 16))}
            placeholder="What should we call you?"
            autoComplete="off"
            className={`w-full ${mode == "join" ? "mb-0" : "mb-25.5"} bg-ink-raised border border-ink-border notch-sm px-4 py-3 text-parchment placeholder:text-slate/70 outline-none focus:border-amber transition-colors`}/>

          {mode === "join" && (
            <div className="mt-5">
              <label className="block text-sm font-medium text-slate mb-2" htmlFor="code">
                Room code
              </label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABCXYZ"
                autoComplete="off"
                className="w-full bg-ink-raised border border-ink-border notch-sm px-4 py-3 text-parchment placeholder:text-slate/70 outline-none focus:border-amber transition-colors font-display text-xl tracking-[0.2em]"
              />
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm font-medium text-slate mb-3">Pick an avatar</p>
            <div className="grid grid-cols-6 gap-2.5">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setAvatar(a.id)}
                  aria-label={a.label}
                  aria-pressed={avatar === a.id}
                  className="focus:outline-none"
                >
                  <AvatarBadge id={a.id} size={44} selected={avatar === a.id} />
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="mt-8 w-full notch bg-amber text-ink font-semibold py-3.5 text-base transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            {submitting ? "One moment…" : mode === "create" ? "Create room" : "Join room"}
          </button>

          {!connected && (
            <p className="mt-3 text-sm text-slate">Connecting to the game server…</p>
          )}
        </form>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium transition-colors ${active ? "bg-amber text-ink" : "bg-transparent text-slate hover:text-parchment"
        }`}
    >
      {children}
    </button>
  );
}

function DecorativeTiles() {
  return (
    <div className="relative z-10 hidden md:flex gap-2 mt-14 w-54">
      सुरु गरु कब्जा, अनि आउछ मजा
      सुरु गरु कब्जा, अनि आउछ मजा
    </div>
  );
}
