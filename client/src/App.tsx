import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import { RoomProvider, useRoom } from "./game/RoomContext";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";

function destinationFor(status: "lobby" | "in_progress" | "finished" | null): string {
  if (status === "lobby") return "/lobby";
  if (status === "in_progress" || status === "finished") return "/game";
  return "/";
}

function Gate({ children, path }: { children: ReactNode; path: "/" | "/lobby" | "/game" }) {
  const { room, connecting } = useRoom();

  if (connecting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate">
        <p className="text-sm tracking-wide">Reconnecting…</p>
      </div>
    );
  }

  const dest = destinationFor(room?.status ?? null);
  if (dest !== path) return <Navigate to={dest} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <RoomProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <Gate path="/">
                  <Home />
                </Gate>
              }
            />
            <Route
              path="/lobby"
              element={
                <Gate path="/lobby">
                  <Lobby />
                </Gate>
              }
            />
            <Route
              path="/game"
              element={
                <Gate path="/game">
                  <Game />
                </Gate>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RoomProvider>
    </ToastProvider>
  );
}
