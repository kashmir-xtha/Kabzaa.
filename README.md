# Kabzaa

A live multiplayer property-trading board game for you and up to five friends.
No accounts — just a nickname, an avatar, and a room code.

This is a complete, playable game: lobby, an original 40-tile board, dice
and turns, property purchase and rent, houses and hotels, mortgaging,
trading, chat, a team mode, bankruptcy, win conditions, and an optional
per-turn countdown timer. See [Known limitations](#known-limitations) for
what's deliberately left out.

- **[Quick start](#quick-start)** — run it locally in two terminals
- **[How the game works](#how-the-game-works)** — the actual rules
- **[Architecture](#architecture)** — how the client and server talk to each other
- **[Codebase guide](#codebase-guide)** — what every file does, file by file
- **[Testing](#testing)** — how to run the test suite
- **[Deploying](#deploying)** — putting it somewhere friends can reach
- **[Known limitations](#known-limitations)**

## Quick start

You'll need [Node.js](https://nodejs.org) 20 or later. Open two terminals.

**Terminal 1 — the server:**
```bash
cd server
npm install
npm run dev
```
Starts the Socket.IO server on `http://localhost:4000`.

**Terminal 2 — the client:**
```bash
cd client
npm install
npm run dev
```
Starts the Vite dev server on `http://localhost:5173` — open that in your
browser. Open it again in a second tab (or a different browser) to play
against yourself while testing.

Running both on `localhost` only lets people on the *same machine* join
(different browser tabs). To actually play with friends elsewhere, see
[Deploying](#deploying).

## How the game works

### Lobby
- **Create a room** to get a 6-character room code; **join a room** with
  that code. Duplicate nicknames in the same room get auto-numbered
  ("Ada" → "Ada 2").
- Toggle **ready**; the host can start once everyone is ready and at least
  2 players have joined.
- **Modes**: Free-for-all, or Teams (2 teams, up to 3 players each,
  self-assigned).
- **Host-only settings**: max players (2–6), starting cash, and an optional
  turn timer (15–180 seconds per turn).
- Your seat is remembered in `localStorage`, so refreshing the page
  reconnects you instead of losing your spot.
- **Chat** works in the lobby and carries into the game.

### Playing
- Turn order is randomized when the host starts the game.
- **Roll dice** to move; pass Start and collect $200; pay tax on tax tiles.
- **Doubles** grant an extra roll — unless it's your third double in a row
  (sent to Holding instead) or you used doubles to escape Holding (no bonus
  that time).
- **Land on an unowned property/transit stop/utility** → you're asked to
  buy it or pass before you can end your turn.
- **Land on someone else's tile** → rent is charged automatically.
  Properties pay double rent if the owner holds the whole color group;
  transit rent scales with how many stations they own (25/50/100/200);
  utility rent is 4x the dice roll for one utility, 10x for both. No rent
  is charged between teammates in Teams mode.
- **Holding (jail)**: roll for doubles to escape, pay $50 to leave and roll
  normally, or wait it out (forced to pay $50 after 3 failed tries).
- **Buildings**: once you (or your team) own every tile in a color group,
  build houses on them any time from the "My properties" panel. Houses
  must go up evenly across the group; the 5th "house" is a hotel. Selling
  refunds half cost and must also happen evenly (highest tile first).
- **Mortgaging**: mortgage any unimproved property for half its price to
  raise cash. Mortgaged tiles collect no rent and block building anywhere
  in their group until unmortgaged (half price + 10% interest).
- **Trading**: propose any mix of cash/properties for any mix of
  cash/properties, with anyone, any time. They accept, decline, or you
  cancel while it's pending. Properties with houses or a mortgage can't be
  traded until resolved.
- **Bankruptcy**: a payment that would leave you negative first triggers
  auto-liquidation (houses sold, properties mortgaged, most valuable
  first). If that's still not enough, you go bankrupt — your remaining
  assets go to whoever you owed (or the bank, for a tax payment) — and
  you're out. You can also forfeit voluntarily any time.
- **Winning**: free-for-all ends when one player remains; Teams ends when
  one team has an active player left. A final standings screen ranks
  everyone by net worth (cash + properties + buildings).

## Architecture

```
┌─────────────┐   Socket.IO events    ┌─────────────┐
│   Browser   │ ─────────────────────▶│   Server    │
│  (client/)  │◀───── room:state ─────│  (server/)  │
└─────────────┘      (full Room)      └─────────────┘
```

**The server is the only source of truth.** It's a single Node process
holding every live room in memory — there's no database. Every player
action (roll dice, buy a property, propose a trade, send a chat message...)
is a Socket.IO event sent to the server; the server validates it, mutates
its in-memory `Room` object if valid, and broadcasts the *entire* updated
`Room` back to everyone in it as a `room:state` event. The client never
computes a dice roll, rent amount, or ownership change itself — it just
renders whatever `Room` it was last sent and asks the server to act.

This "resend the whole state" approach (rather than diffing/patching) is
deliberately simple: a `Room` object is small (a handful of KB even
mid-game), so there's no real cost to it, and it means the client can never
drift out of sync with the server.

**Request flow for a typical action** (e.g. rolling dice):
1. Client calls `rollDice()` from `useRoom()` → emits a `"game:roll"`
   socket event with an ack callback.
2. `socketHandlers.ts` receives it, calls `roomManager.rollDice(socket.id)`.
3. `RoomManager` looks up the room and player, checks it's actually their
   turn and the game has started, then calls `performRoll(room)` in
   `engine.ts`.
4. `engine.ts` mutates the room in place (moves the token, charges tax,
   charges rent via `economy.ts`, maybe triggers bankruptcy, sets the next
   `turnPhase`) and returns.
5. `RoomManager` returns the updated room; `socketHandlers.ts` sends it
   back to the caller as the ack response *and* broadcasts it to every
   other socket in the room.
6. Every connected client's `RoomContext` receives the new `room:state` and
   re-renders.

## Codebase guide

```
claim/
├── server/                     Node + Express + Socket.IO (TypeScript)
│   ├── src/
│   │   ├── index.ts             Entry point — boots the HTTP + Socket.IO server
│   │   ├── types/index.ts       Every shared type: the shape of a Room, Player, etc.
│   │   ├── utils/
│   │   │   ├── errors.ts          GameError — the "expected, user-facing error" type
│   │   │   ├── roomCode.ts        6-character room code generator
│   │   │   └── avatars.ts         Valid avatar id list + validator
│   │   ├── game/
│   │   │   ├── board.ts           Static board data (all 40 tiles, groups, constants)
│   │   │   ├── economy.ts         Pure calculations: rent, build/mortgage eligibility
│   │   │   └── engine.ts          All game-state mutations: dice, trades, bankruptcy…
│   │   ├── rooms/RoomManager.ts Owns every live room; the only class that calls engine.ts
│   │   └── socket/socketHandlers.ts  Wires Socket.IO events to RoomManager methods
│   └── tests/                   Permanent test suite (see Testing below)
│
└── client/                     React + Vite + Tailwind v4 (TypeScript)
    └── src/
        ├── main.tsx              React entry point
        ├── App.tsx               Router: Home / Lobby / Game, status-based redirects
        ├── index.css             Design tokens (colors, fonts) + global styles
        ├── types/index.ts        Client copy of the shared types
        ├── game/
        │   ├── socket.ts           The single Socket.IO client instance
        │   ├── identity.ts         localStorage helpers (nickname/avatar/session)
        │   ├── RoomContext.tsx     Central state: owns the live Room, exposes actions
        │   ├── avatars.tsx         Original SVG avatar icons + <AvatarBadge>
        │   ├── TradePanel.tsx      Trade list + trade composer UI
        │   ├── Chat.tsx            Shared chat panel (lobby + game)
        │   └── board/
        │       ├── data.ts           Client copy of the board layout
        │       ├── layout.ts         Board-index → grid-position math
        │       ├── economy.ts        Client mirror of build/mortgage eligibility checks
        │       ├── Board.tsx          Renders the 11×11 tile grid
        │       └── Tile.tsx           Renders a single tile (all the different kinds)
        ├── components/
        │   ├── Wordmark.tsx        The "Kabzaa." brand mark
        │   ├── Dice.tsx            Two dice with pip layouts
        │   └── Toast.tsx           Toast notification system
        └── pages/
            ├── Home.tsx            Landing: nickname, avatar, create/join
            ├── Lobby.tsx           Pre-game lobby
            └── Game.tsx            The main game screen
```

### `server/src/types/index.ts`

The single source of truth for what data exists in the game. Every other
server file imports types from here. The most important shape is `Room` —
it's the entire state of one game, and it's what gets sent to clients
verbatim on every update:

| Field | Holds |
|---|---|
| `code`, `status`, `mode`, `hostId` | Room identity, lobby/in_progress/finished, casual/teams, who's host |
| `players: Player[]` | Everyone in the room — nickname, avatar, money, board position, jail state, team, `bankrupt` flag |
| `settings` | Host-configurable: max players, starting cash, turn timer on/off + seconds (auction toggle is reserved but unused, see limitations) |
| `turnOrder`, `currentTurnIndex`, `turnPhase` | Whose turn it is and what they can currently do (`"rolling"` / `"awaiting-purchase"` / `"rolled"`) |
| `lastRoll`, `turnDeadline` | The most recent dice roll; when the current turn's timer expires (`null` if disabled) |
| `ownership`, `houses`, `mortgaged` | Tile index → owning player id / house count (1-4, 5=hotel) / mortgaged flag |
| `trades: TradeOffer[]` | Currently pending trade proposals |
| `chatMessages`, `log` | Chat history; the plain-English event feed shown in-game |
| `winnerId`, `winnerTeamId` | Set once `status` becomes `"finished"` |

### `server/src/utils/`

- **`errors.ts`** — `GameError`, a tiny `Error` subclass. Every "this move
  isn't allowed" case throws one of these with a human-readable message.
  `socketHandlers.ts` specifically catches `GameError` and relays its
  `.message` to the client; anything else becomes a generic "Something went
  wrong" so internal bugs never leak implementation details to players.
- **`roomCode.ts`** — `generateRoomCode()` picks 6 characters from an
  alphabet that skips visually ambiguous ones (`0`/`O`, `1`/`I`/`L`) so
  codes are easy to read aloud or retype.
- **`avatars.ts`** — the 6 valid avatar ids (`"fox"`, `"owl"`, …) and
  `isValidAvatar()`, used to reject a client sending a made-up avatar id.

### `server/src/game/board.ts`

Pure data, no logic. Exports:
- `BOARD: BoardTile[]` — all 40 tiles in order (index 0–39), each with a
  `kind` (`"property"`, `"transit"`, `"utility"`, `"tax"`, `"twist"`,
  `"windfall"`, or one of the four corner kinds), and for properties: which
  `group` (color) they belong to, `price`, and base `rent`.
- `GROUPS` — the 8 color groups with their display color and house cost.
- Constants: `JAIL_POSITION`, `GO_TO_JAIL_POSITION`, `PASS_GO_AMOUNT`,
  `JAIL_BAIL`, `TRANSIT_RENTS`, `UTILITY_RENT_MULTIPLIER_ONE/BOTH`,
  `HOUSE_RENT_MULTIPLIERS`, `MAX_HOUSES`, `HOTEL_LEVEL`.
- Helpers: `tileAt(index)`, `groupColor(id)`, `groupHouseCost(id)`.

All board names, districts, and layout are original — there's no real
Monopoly IP referenced anywhere in this file (see the note in
[Known limitations](#known-limitations) about why).

### `server/src/game/economy.ts`

Pure, read-only calculation functions — none of them mutate a `Room`, they
just answer questions given the current state:
- `isPurchasable(tile)` — can this tile ever be bought?
- `sameTeam(room, aId, bId)` — are these two players teammates (only
  meaningful in Teams mode)?
- `ownsWholeGroup(room, tile, ownerId)` — does `ownerId` (or their team, in
  Teams mode) control every tile in this color group?
- `computeRent(room, tile, ownerId)` — the actual rent formula: handles
  mortgaged (free), houses/hotel (multiplier table), monopoly doubling,
  transit (owned-count table), and utility (dice-total × multiplier).
- `checkCanBuildHouse` / `checkCanSellHouse` — enforce the even-building /
  even-selling rules and return `{ ok, reason?, cost? }` rather than
  throwing, so the client can show *why* a button is disabled.
- `checkCanMortgage` / `checkCanUnmortgage` — ownership/houses/affordability
  checks for mortgaging.

### `server/src/game/engine.ts`

The heart of the simulation — every function here **mutates** a `Room` you
pass in. Organized into sections:
- **Movement**: `movePlayer` (internal), `performRoll`, `payBailAndRoll` —
  dice, passing Start, tax, rent, landing-on-Send-off, and wiring into the
  purchase-prompt / bankruptcy / bonus-roll logic that follows a move.
- **Purchases**: `buyCurrentTile`, `passCurrentPurchase`.
- **Buildings**: `buildHouse`, `sellHouse`.
- **Mortgages**: `mortgageTile`, `unmortgageTile`.
- **Turns**: `endTurn`, `isCurrentTurn`, and `forceCompleteTurn` — used by
  the turn timer and the disconnected-player auto-skip in `RoomManager` to
  play out a stalled turn (roll if needed, auto-pass any purchase, end the
  turn), stopping early if the player goes bankrupt mid-move.
- **Trading**: `createTrade`, `resolveTrade`, `withdrawTrade`.
- **Chat**: `postChatMessage`.
- **Bankruptcy & win conditions**: `liquidateAssets` (auto-sell/mortgage to
  cover debt), `executeBankruptcy` (transfer assets, remove from turn
  order), `resolveDebt` (the two combined), `declareBankruptcy` (voluntary
  forfeit — also fixes up `currentTurnIndex` correctly if a player who
  *isn't* currently up forfeits), `checkWinCondition`.
- **`initializeGame`** — resets/sets up a `Room` for a brand new game
  (shuffles turn order, resets every player's money/position, clears
  ownership/houses/mortgages/trades).
- **`addLog`** — appends to the in-game event feed, capped at the most
  recent 60 entries.

### `server/src/rooms/RoomManager.ts`

The only class allowed to call into `engine.ts` / `economy.ts`. It:
- Owns `Map<roomCode, Room>` — literally every game's entire state, all in
  memory. If the process restarts, every room is gone (see
  [Known limitations](#known-limitations)).
- Tracks which socket belongs to which player in which room.
- Exposes one public method per client action (`createRoom`, `joinRoom`,
  `rollDice`, `buyProperty`, `proposeTrade`, `mortgageOn`, `sendChat`, …).
  Each one: looks up the room/player, checks authorization (their turn?
  host-only action? game actually started?), delegates to `engine.ts`, and
  returns the updated `Room`.
- Owns three kinds of timers:
  - **Lobby disconnect grace period** (2 minutes) — a seat is held before
    being freed up if someone disconnects pre-game.
  - **Optional per-turn countdown** (`scheduleTurnTimer`) — if the host
    turned it on, auto-completes a turn that runs out the clock.
  - **Disconnected-player auto-skip** (20 seconds, always active,
    independent of the setting above) — if it becomes a disconnected
    player's turn mid-game, plays it out for them so the game never stalls
    forever.
- Handles host migration (next connected player becomes host) and, if a
  player explicitly leaves mid-game, runs them through the same bankruptcy
  path as running out of money — so their properties don't end up
  "orphaned," pointing at a player who's no longer in the room.

### `server/src/socket/socketHandlers.ts`

Registers every Socket.IO event name (`"room:create"`, `"game:roll"`,
`"trade:propose"`, `"chat:send"`, …) and wires each to the matching
`RoomManager` method. Sanitizes raw client input (never trusts it — checks
types, ranges, string lengths), sends an ack response to the calling
socket, and broadcasts the resulting room state to everyone else in the
room. Contains **no game rules** itself — if you're looking for *why* a
move is or isn't allowed, that logic lives in `engine.ts`/`economy.ts`,
not here.

### `server/src/index.ts`

The entry point: creates the Express app (just a `/health` endpoint) and
HTTP server, attaches Socket.IO with CORS configured for the client's
origin, constructs one `RoomManager`, wires its `onBroadcast` callback (so
server-initiated changes like a timer firing can still push updates to
clients), registers the socket handlers, and starts listening.

### Client: `src/game/`

- **`socket.ts`** — creates the one `Socket.IO` client instance the whole
  app shares (connection is deferred — `RoomProvider` decides when to
  actually connect).
- **`identity.ts`** — `localStorage` helpers: your nickname/avatar persist
  across visits (`saveIdentity`/`loadIdentity`), and your current
  room+player-id persist so a page refresh can silently rejoin
  (`saveSession`/`loadSession`/`clearSession`).
- **`RoomContext.tsx`** — the single most important client file. A React
  Context that owns the live `Room` object (updated whenever a
  `"room:state"` event arrives), handles the connect/auto-rejoin flow on
  mount, and exposes one function per action (`rollDice()`,
  `buyProperty()`, `proposeTrade()`, …) that just emits the matching socket
  event. Every page reads state and triggers actions via `useRoom()`.
- **`avatars.tsx`** — 6 original, hand-drawn geometric SVG marks (not
  emoji, not third-party art) plus `<AvatarBadge>`, the colored badge
  component used everywhere an avatar appears.
- **`TradePanel.tsx`** — lists incoming trades (accept/decline), outgoing
  trades (cancel), and the trade composer (pick a counterpart, pick
  money/tiles on each side, send).
- **`Chat.tsx`** — the message list + input box, shared by the Lobby and
  Game screens.
- **`board/data.ts`** — client-side copy of `server/src/game/board.ts`
  (same tiles/groups/constants), used only for rendering.
- **`board/layout.ts`** — `gridPosition(index)` maps a board index (0–39)
  to `{row, col}` in the 11×11 CSS grid; `edgeOf(index)` says which side of
  the board a tile is on (used to decide which edge gets the color stripe).
- **`board/economy.ts`** — client mirror of the server's eligibility
  checks, so Build/Sell/Mortgage buttons can enable/disable instantly
  without a server round-trip. The server always re-validates regardless —
  this is purely a UX nicety, never trusted for correctness.
- **`board/Board.tsx`** — lays out all 40 `<Tile>`s in the 11×11 grid, with
  a center area (passed as `children`) for the dice/turn-controls panel.
- **`board/Tile.tsx`** — renders one tile: different layouts for corners,
  properties (color stripe on the edge facing the board's center), and
  transit/utility/tax/chance tiles, plus owner-marker dots, house/hotel
  icons, and player token dots.

### Client: `src/components/` and `src/pages/`

- **`Wordmark.tsx`** — the "Kabzaa." brand mark, reused at both sizes across
  Home/Lobby/Game.
- **`Dice.tsx`** — renders two dice faces with real pip layouts for 1–6.
- **`Toast.tsx`** — a small toast notification system (`ToastProvider` +
  `useToast()`) for errors and confirmations (e.g. "Room code copied").
- **`pages/Home.tsx`** — the landing page: nickname field, avatar picker,
  create-room / join-room form.
- **`pages/Lobby.tsx`** — room code + copy button, player roster, ready-up,
  mode/team selection, host settings (including the turn timer), start
  button, and chat.
- **`pages/Game.tsx`** — the main screen: the board, the center dice/turn
  panel (with the countdown when the timer's on), the player HUD, trades
  panel, "My properties" panel (build/sell/mortgage/unmortgage), chat, the
  event log, and the game-over banner with final net-worth standings.

### Why some files look duplicated

`client/src/types/index.ts` mirrors `server/src/types/index.ts`, and
`client/src/game/board/{data,economy}.ts` mirror
`server/src/game/{board,economy}.ts`. This is intentional, not drift: the
client and server are two independently-deployable npm projects (no shared
workspace/monorepo tooling), and the client's copies exist purely so the UI
can render tiles and show instant enable/disabled button states without
waiting on the network. The server's copies are the ones that actually get
enforced — nothing the client computes is ever trusted. If you extend the
game (new tile types, new rules), you'll need to update both sides.

## Testing

The permanent test suite lives in `server/tests/`. From `server/`:

```bash
npm test
```

This runs every `tests/*.test.mjs` file in sequence and prints a pass/fail
summary. What's covered:

| File | Covers |
|---|---|
| `engine.test.mjs` | Dice, movement, jail/doubles state machine, turn advancement |
| `economy.test.mjs` | Property purchase flow, rent (base/monopoly/transit/utility) |
| `buildings.test.mjs` | House/hotel building, even-building/selling rules, house rent |
| `trading.test.mjs` | Trade proposal validation, acceptance, decline, cancellation |
| `teams.test.mjs` | Rent waived between teammates, team-shared monopolies |
| `bankruptcy.test.mjs` | Auto-liquidation, bankruptcy, asset transfer, win conditions |
| `polish.test.mjs` | Turn timer scheduling, disconnect reconnect/cancel, mid-game leave |
| `e2e.test.mjs` | Boots a real server + real Socket.IO client connections through a full game (lobby → dice → purchase → rent → trade) |
| `ack-safety.test.mjs` | Regression test: a client emitting an event with no acknowledgment callback must never crash the server (see the fix in `socketHandlers.ts` — every handler normalizes `ack` before calling it) |

Most files construct a plain `Room` object by hand and call `engine.ts`
functions directly with mocked dice (`Math.random` is temporarily
overridden to force specific rolls) — this makes tests fast and
deterministic despite the game being inherently random.
`e2e.test.mjs` is the exception: it boots an actual instance of the server
on an ephemeral port and drives it with real `socket.io-client`
connections, so it exercises `RoomManager` and `socketHandlers.ts` too, not
just the pure game logic.

There's no client-side automated test suite in this repo; the client was
verified manually (and via headless-browser screenshots during
development) rather than with a committed test file.

## Deploying

To let friends on other networks join:
1. Deploy `server/` somewhere that runs a long-lived Node process (a small
   VPS, Railway, Render, Fly.io, etc.) and note its public URL.
2. Set the `CLIENT_ORIGIN` environment variable on the server to your
   deployed client's URL (used for CORS).
3. Deploy `client/` as a static site (Vercel, Netlify, Cloudflare Pages,
   etc.) with `VITE_SERVER_URL` set to your deployed server's URL.
4. Share the client URL.

**Environment variables:**
- `client/.env` (copy from `.env.example`): `VITE_SERVER_URL` — defaults to
  `http://localhost:4000`.
- Server: `PORT` (default `4000`), `CLIENT_ORIGIN` (default
  `http://localhost:5173`).

## Known limitations

Deliberate scope decisions, not oversights:

- **No auctions.** Declining to buy a property just leaves it unowned
  (real Monopoly auctions it to the table). `settings.auctionEnabled`
  exists in the type but isn't wired up to anything.
- **No persistent leaderboard across separate games.** No database is
  used; the "final standings" screen is computed live from the current
  game and disappears once the room is gone.
- **Trading a mortgaged property isn't supported** — unmortgage it first.
  (Real rules let you trade a mortgaged property, with the buyer taking on
  the mortgage; simplified away here.)
- **No IP from the real Monopoly game.** The board, district names, house
  rules, and branding here are all original. "Monopoly" is a Hasbro
  trademark; this project deliberately doesn't use that name or copy its
  specific board/street names, art, or logo — only generic, decades-old
  property-trading-game *mechanics* that aren't anyone's IP.
