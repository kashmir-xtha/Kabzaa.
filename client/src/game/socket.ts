import { io, type Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

// autoConnect is false so the app can decide exactly when to open the
// connection (avoids connecting before we know if we're rejoining).
export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
