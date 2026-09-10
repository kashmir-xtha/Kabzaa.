# Kabzaa.

A live multiplayer property-trading board game for up to six friends.
No accounts — just a nickname, an avatar, and a room code.

## Quick start

You'll need [Node.js](https://nodejs.org) 20 or later. 

**Terminal — the client:**
```bash
cd client
npm install
npm run dev
```
Starts the Vite dev server on `http://localhost:5173` — open that in your
browser. Open it again in a second tab (or a different browser) to play
against yourself while testing.

Running both on `localhost` only lets people on the *same machine* join
(different browser tabs). To actually play with friends on different network, see

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
