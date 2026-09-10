// Mirrors server/src/game/board.ts. The server is authoritative for game
// logic; the client only needs this to render tiles and look up display
// info by index.

export type TileKind =
  | "start"
  | "jail"
  | "rest"
  | "goToJail"
  | "property"
  | "transit"
  | "utility"
  | "tax"
  | "twist"
  | "windfall";

export interface BoardTile {
  index: number;
  kind: TileKind;
  name: string;
  group?: string;
  price?: number;
  taxAmount?: number;
  rent?: number;
}

export interface GroupInfo {
  id: string;
  color: string;
  label: string;
  houseCost: number;
}

export const GROUPS: GroupInfo[] = [
  { id: "ash", color: "#8B6F52", label: "Ash", houseCost: 50 },
  { id: "cove", color: "#5AA9D6", label: "Cove", houseCost: 50 },
  { id: "orchid", color: "#C9599C", label: "Orchid", houseCost: 100 },
  { id: "marigold", color: "#E8963D", label: "Marigold", houseCost: 100 },
  { id: "garnet", color: "#D64545", label: "Garnet", houseCost: 150 },
  { id: "gold", color: "#E8C93D", label: "Gold", houseCost: 150 },
  { id: "emerald", color: "#3FA66B", label: "Emerald", houseCost: 200 },
  { id: "sapphire", color: "#4A5FC1", label: "Sapphire", houseCost: 200 },
];

export function groupColor(id: string | undefined): string {
  return GROUPS.find((g) => g.id === id)?.color ?? "#8B90A6";
}

export function groupHouseCost(id: string | undefined): number {
  return GROUPS.find((g) => g.id === id)?.houseCost ?? 50;
}

export const HOUSE_RENT_MULTIPLIERS = [5, 15, 45, 80, 125];
export const MAX_HOUSES = 4;
export const HOTEL_LEVEL = 5;

export const JAIL_POSITION = 10;
export const GO_TO_JAIL_POSITION = 30;
export const PASS_GO_AMOUNT = 200;
export const JAIL_BAIL = 50;

export const BOARD: BoardTile[] = [
  { index: 0, kind: "start", name: "Start" },
  { index: 1, kind: "property", name: "Ashline Alley", group: "ash", price: 60, rent: 2 },
  { index: 2, kind: "windfall", name: "Windfall" },
  { index: 3, kind: "property", name: "Cinder Row", group: "ash", price: 60, rent: 4 },
  { index: 4, kind: "tax", name: "Property Levy", taxAmount: 200 },
  { index: 5, kind: "transit", name: "Union Transit", price: 200 },
  { index: 6, kind: "property", name: "Cove Landing", group: "cove", price: 100, rent: 6 },
  { index: 7, kind: "twist", name: "Twist" },
  { index: 8, kind: "property", name: "Wharf Row", group: "cove", price: 100, rent: 6 },
  { index: 9, kind: "property", name: "Ferry Street", group: "cove", price: 120, rent: 8 },
  { index: 10, kind: "jail", name: "Holding" },
  { index: 11, kind: "property", name: "Orchid Court", group: "orchid", price: 140, rent: 10 },
  { index: 12, kind: "utility", name: "Hydro Works", price: 150 },
  { index: 13, kind: "property", name: "Amaranth Square", group: "orchid", price: 140, rent: 10 },
  { index: 14, kind: "property", name: "Petal Terrace", group: "orchid", price: 160, rent: 12 },
  { index: 15, kind: "transit", name: "Harborline Transit", price: 200 },
  { index: 16, kind: "property", name: "Marigold Avenue", group: "marigold", price: 180, rent: 14 },
  { index: 17, kind: "windfall", name: "Windfall" },
  { index: 18, kind: "property", name: "Sunspire Row", group: "marigold", price: 180, rent: 14 },
  { index: 19, kind: "property", name: "Tangerine Walk", group: "marigold", price: 200, rent: 16 },
  { index: 20, kind: "rest", name: "Break" },
  { index: 21, kind: "property", name: "Garnet Row", group: "garnet", price: 220, rent: 18 },
  { index: 22, kind: "twist", name: "Twist" },
  { index: 23, kind: "property", name: "Ember Street", group: "garnet", price: 220, rent: 18 },
  { index: 24, kind: "property", name: "Vermilion Court", group: "garnet", price: 240, rent: 20 },
  { index: 25, kind: "transit", name: "Meridian Transit", price: 200 },
  { index: 26, kind: "property", name: "Gilded Row", group: "gold", price: 260, rent: 22 },
  { index: 27, kind: "property", name: "Sovereign Street", group: "gold", price: 260, rent: 22 },
  { index: 28, kind: "utility", name: "Lumen Power Co.", price: 150 },
  { index: 29, kind: "property", name: "Treasury Walk", group: "gold", price: 280, rent: 24 },
  { index: 30, kind: "goToJail", name: "Send-off" },
  { index: 31, kind: "property", name: "Emerald Heights", group: "emerald", price: 300, rent: 26 },
  { index: 32, kind: "property", name: "Jade Crescent", group: "emerald", price: 300, rent: 26 },
  { index: 33, kind: "windfall", name: "Windfall" },
  { index: 34, kind: "property", name: "Malachite Lane", group: "emerald", price: 320, rent: 28 },
  { index: 35, kind: "transit", name: "Central Transit", price: 200 },
  { index: 36, kind: "twist", name: "Twist" },
  { index: 37, kind: "property", name: "Sapphire Crown", group: "sapphire", price: 350, rent: 35 },
  { index: 38, kind: "tax", name: "Luxury Toll", taxAmount: 100 },
  { index: 39, kind: "property", name: "The Pinnacle", group: "sapphire", price: 400, rent: 50 },
];

export function tileAt(index: number): BoardTile {
  return BOARD[((index % 40) + 40) % 40];
}

export function isPurchasable(tile: BoardTile): boolean {
  return (tile.kind === "property" || tile.kind === "transit" || tile.kind === "utility") && tile.price !== undefined;
}
