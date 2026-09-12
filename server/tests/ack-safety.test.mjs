// Regression test for a real bug: the client's "leave lobby" action emitted
// room:leave without an ack callback, which crashed the entire server
// process when the handler unconditionally called ack(...). This test
// reproduces that exact scenario (and a few other events) with no callback
// at all, confirming the server survives and still does the right thing.
import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import { io as ioClient } from "socket.io-client";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { registerSocketHandlers } from "../src/socket/socketHandlers.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("PASS:", msg); }
}
function ackWith(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });
  const roomManager = new RoomManager();
  roomManager.onBroadcast = (room) => io.to(room.code).emit("room:state", room);
  registerSocketHandlers(io, roomManager);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  const url = `http://localhost:${port}`;
  const connect = () => new Promise((resolve) => {
    const s = ioClient(url, { transports: ["websocket"] });
    s.on("connect", () => resolve(s));
  });

  const host = await connect();
  const guest = await connect();

  const created = await ackWith(host, "room:create", { nickname: "Ada", avatar: "fox" });
  const code = created.data.room.code;
  await ackWith(guest, "room:join", { code, nickname: "Bo", avatar: "owl" });

  // The exact reproduction: emit room:leave with NO callback at all.
  guest.emit("room:leave", {});

  // Give the server a moment to process it — if it crashed, the health
  // check below (a totally unrelated fresh action) will fail/hang.
  await new Promise((r) => setTimeout(r, 300));

  const stillAlive = await ackWith(host, "player:setReady", { ready: true });
  assert(stillAlive.ok, "server survives an ack-less room:leave and keeps handling other events");

  // Also fire a few other common events with no callback to harden broadly,
  // not just the one spot that happened to crash.
  host.emit("game:roll", {});
  host.emit("chat:send", { text: "still here?" });
  await new Promise((r) => setTimeout(r, 300));

  const finalCheck = await ackWith(host, "room:changeSettings", { startingMoney: 2000 });
  assert(finalCheck.ok, "server survives multiple ack-less emits across different handlers");

  host.close();
  guest.close();
  io.close();
  httpServer.close();

  console.log(process.exitCode ? "\nSOME ACK-SAFETY CHECKS FAILED" : "\nALL ACK-SAFETY CHECKS PASSED");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
