import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "./rooms/RoomManager.js";
import { registerSocketHandlers } from "./socket/socketHandlers.js";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "claim-server" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

const roomManager = new RoomManager();
roomManager.onBroadcast = (room) => io.to(room.code).emit("room:state", room);
registerSocketHandlers(io, roomManager);

httpServer.listen(PORT, () => {
  console.log(`claim-server listening on http://localhost:${PORT}`);
  console.log(`accepting client connections from ${CLIENT_ORIGIN}`);
});
