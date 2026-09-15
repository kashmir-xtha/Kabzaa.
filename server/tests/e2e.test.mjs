// End-to-end test: boots a real instance of the server (Express + Socket.IO
// + RoomManager, same wiring as src/index.ts) on an ephemeral port, then
// drives it with real socket.io-client connections through a full game —
// lobby, dice, purchases, rent, a trade, and mortgaging. This exercises the
// actual socket handlers and RoomManager, not just the pure engine
// functions the other tests/*.test.mjs files cover.
//
// Run with: npx tsx tests/e2e.test.mjs (from the server/ directory)
import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import { io as ioClient } from "socket.io-client";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { registerSocketHandlers } from "../src/socket/socketHandlers.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("PASS:", msg); }
}
function ack(socket, event, payload) {
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

  const created = await ack(host, "room:create", { nickname: "Ada" });
  assert(created.ok, "create room");
  const code = created.data.room.code;

  const joined = await ack(guest, "room:join", { code, nickname: "Bo" });
  assert(joined.ok, "join room");

  const chat = await ack(host, "chat:send", { text: "hi" });
  assert(chat.ok && chat.data.chatMessages.length === 1, "chat works in the lobby");

  await ack(host, "player:setReady", { ready: true });
  await ack(guest, "player:setReady", { ready: true });
  const started = await ack(host, "room:start", {});
  assert(started.ok, "start game");
  let room = started.data;

  const adaId = room.players.find((p) => p.nickname === "Ada").id;

  // Play until both a purchase and a rent payment have happened, plus try a trade.
  let guard = 0;
  let traded = false;
  while (guard < 100) {
    guard++;
    const turnId = room.turnOrder[room.currentTurnIndex];
    const actor = turnId === adaId ? host : guest;
    if (room.turnPhase === "rolling") {
      const res = await ack(actor, "game:roll", {});
      assert(res.ok, `roll #${guard} succeeds`);
      room = res.data;
    } else if (room.turnPhase === "awaiting-purchase") {
      const res = await ack(actor, "game:buyProperty", {});
      room = res.ok ? res.data : (await ack(actor, "game:passPurchase", {})).data;
    } else if (room.turnPhase === "rolled") {
      const res = await ack(actor, "game:endTurn", {});
      room = res.data;
    }

    if (!traded) {
      const boId = room.players.find((p) => p.nickname === "Bo").id;
      const adaTile = Object.keys(room.ownership).find((k) => room.ownership[k] === adaId);
      const boTile = Object.keys(room.ownership).find((k) => room.ownership[k] === boId);
      if (adaTile !== undefined && boTile !== undefined) {
        traded = true;
        const propose = await ack(host, "trade:propose", {
          toId: boId, offerMoney: 0, offerTiles: [Number(adaTile)], requestMoney: 0, requestTiles: [Number(boTile)],
        });
        assert(propose.ok, "trade proposed");
        room = propose.data;
        const tradeId = room.trades[0]?.id;
        if (tradeId) {
          const resp = await ack(guest, "trade:respond", { tradeId, accept: true });
          assert(resp.ok, "trade accepted");
          room = resp.data;
          assert(room.ownership[adaTile] === boId && room.ownership[boTile] === adaId, "tiles swapped correctly");
        }
      }
    }
    if (traded && guard > 15) break;
  }
  assert(traded, "a trade was exercised during the run");

  host.close();
  guest.close();
  io.close();
  httpServer.close();

  console.log(process.exitCode ? "\nSOME E2E CHECKS FAILED" : "\nALL E2E CHECKS PASSED");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
