// Tests for the avatar-uniqueness fix: avatars are now auto-assigned on
// join/create (no client-picked avatar at that point), and can only be
// changed in the lobby to an avatar nobody else in the room already has.
// Run with: npx tsx tests/avatars.test.mjs (from the server/ directory)
import { RoomManager } from "../src/rooms/RoomManager.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("PASS:", msg); }
}
function throws(fn) { try { fn(); return false; } catch { return true; } }

// Joining players get distinct auto-assigned avatars.
{
  const rm = new RoomManager();
  const { room: r1, player: host } = rm.createRoom("Ada", "sock-1");
  const { player: guest } = rm.joinRoom(r1.code, "Bo", "sock-2");
  assert(typeof host.avatar === "string" && host.avatar.length > 0, "host gets an auto-assigned avatar");
  assert(host.avatar !== guest.avatar, "second player gets a DIFFERENT avatar than the first, automatically");
}

// Changing to an avatar nobody else has succeeds.
{
  const rm = new RoomManager();
  const { room: r1, player: host } = rm.createRoom("Ada", "sock-1");
  rm.joinRoom(r1.code, "Bo", "sock-2");
  const otherAvatars = ["fox", "hare", "panda", "seal", "boar", "lynx"]
    .filter((a) => a !== host.avatar);
  const room = rm.getRoomByCode(r1.code);
  const guestAvatar = room.players.find((p) => p.id !== host.id).avatar;
  const free = otherAvatars.find((a) => a !== guestAvatar);
  const updated = rm.selectAvatar("sock-1", free);
  assert(updated.players.find((p) => p.id === host.id).avatar === free, "avatar changed successfully");
}

// Trying to switch to an avatar someone else already has is rejected.
{
  const rm = new RoomManager();
  const { room: r1 } = rm.createRoom("Ada", "sock-1");
  rm.joinRoom(r1.code, "Bo", "sock-2");
  const room = rm.getRoomByCode(r1.code);
  const [hostP, guestP] = room.players;
  assert(throws(() => rm.selectAvatar("sock-1", guestP.avatar)), "can't switch to an avatar someone else already has");
}

// Picking your own current avatar again is fine (no-op, not blocked by the "taken" check).
{
  const rm = new RoomManager();
  const { room: r1, player: host } = rm.createRoom("Ada", "sock-1");
  const updated = rm.selectAvatar("sock-1", host.avatar);
  assert(updated.players[0].avatar === host.avatar, "re-selecting your own avatar is allowed");
}

// Avatar changes are rejected once the game has started.
{
  const rm = new RoomManager();
  const { room: r1 } = rm.createRoom("Ada", "sock-1");
  rm.joinRoom(r1.code, "Bo", "sock-2");
  rm.setReady("sock-1", true);
  rm.setReady("sock-2", true);
  rm.startGame("sock-1");
  assert(throws(() => rm.selectAvatar("sock-1", "stag")), "can't change avatar once the game has started");
}

// An invalid avatar id is rejected.
{
  const rm = new RoomManager();
  rm.createRoom("Ada", "sock-1");
  assert(throws(() => rm.selectAvatar("sock-1", "not-a-real-avatar")), "invalid avatar id is rejected");
}

console.log(process.exitCode ? "\nSOME AVATAR TESTS FAILED" : "\nALL AVATAR TESTS PASSED");
