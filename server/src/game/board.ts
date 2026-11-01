export type TileKind =
  | "start"
  | "jail"
  | "rest"
  | "wager"
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
  label: string;
  houseCost: number;
}

export const GROUPS: GroupInfo[] = [
  { id: "ash", label: "Ash", houseCost: 50 },
  { id: "cove", label: "Cove", houseCost: 50 },
  { id: "orchid", label: "Orchid", houseCost: 100 },
  { id: "marigold", label: "Marigold", houseCost: 100 },
  { id: "garnet", label: "Garnet", houseCost: 150 },
  { id: "gold", label: "Gold", houseCost: 150 },
  { id: "emerald", label: "Emerald", houseCost: 200 },
  { id: "sapphire", label: "Sapphire", houseCost: 200 },
];

export function groupHouseCost(id: string | undefined): number {
  return GROUPS.find((g) => g.id === id)?.houseCost ?? 50;
}

export const HOUSE_RENT_MULTIPLIERS = [5, 15, 45, 80, 125];
export const MAX_HOUSES = 4;
export const HOTEL_LEVEL = 5;

export const JAIL_POSITION = 30;
export const PASS_GO_AMOUNT = 300;      // Awarded when passing through Start
export const LAND_START_AMOUNT = 500;      // Awarded when landing directly on Start
export const JAIL_BAIL = 50;

export const BOARD: BoardTile[] = [
  { index: 0, kind: "start", name: "Start" },
  { index: 1, kind: "property", name: "Kathmandu", group: "ash", price: 60, rent: 2 },
  { index: 2, kind: "windfall", name: "Windfall" },
  { index: 3, kind: "property", name: "Pokhara", group: "ash", price: 60, rent: 4 },
  { index: 4, kind: "tax", name: "Property Levy", taxAmount: 200 },
  { index: 5, kind: "transit", name: "South Transit", price: 200 },
  { index: 6, kind: "property", name: "Kazan", group: "cove", price: 100, rent: 6 },
  { index: 7, kind: "twist", name: "Twist" },
  { index: 8, kind: "property", name: "Petersburg", group: "cove", price: 100, rent: 6 },
  { index: 9, kind: "property", name: "Moscow", group: "cove", price: 120, rent: 8 },
  { index: 10, kind: "wager", name: "High Stakes" },
  { index: 11, kind: "property", name: "Valencia", group: "orchid", price: 140, rent: 10 },
  { index: 12, kind: "utility", name: "Hydro Works", price: 150 },
  { index: 13, kind: "property", name: "Barcelona", group: "orchid", price: 140, rent: 10 },
  { index: 14, kind: "property", name: "Madrid", group: "orchid", price: 160, rent: 12 },
  { index: 15, kind: "transit", name: "West Transit", price: 200 },
  { index: 16, kind: "property", name: "Berlin", group: "marigold", price: 180, rent: 14 },
  { index: 17, kind: "windfall", name: "Windfall" },
  { index: 18, kind: "property", name: "Frankfurt", group: "marigold", price: 180, rent: 14 },
  { index: 19, kind: "property", name: "Munich", group: "marigold", price: 200, rent: 16 },
  { index: 20, kind: "rest", name: "Vacation" },
  { index: 21, kind: "property", name: "Osaka", group: "garnet", price: 220, rent: 18 },
  { index: 22, kind: "twist", name: "Twist" },
  { index: 23, kind: "property", name: "Yokohama", group: "garnet", price: 220, rent: 18 },
  { index: 24, kind: "property", name: "Tokyo", group: "garnet", price: 240, rent: 20 },
  { index: 25, kind: "transit", name: "North Transit", price: 200 },
  { index: 26, kind: "property", name: "Birmingham", group: "gold", price: 260, rent: 22 },
  { index: 27, kind: "property", name: "Manchester", group: "gold", price: 260, rent: 22 },
  { index: 28, kind: "utility", name: "Power Co.", price: 150 },
  { index: 29, kind: "property", name: "London", group: "gold", price: 280, rent: 24 },
  { index: 30, kind: "jail", name: "Prison" },
  { index: 31, kind: "property", name: "Sharjah", group: "emerald", price: 300, rent: 26 },
  { index: 32, kind: "property", name: "Abu Dhabi", group: "emerald", price: 300, rent: 26 },
  { index: 33, kind: "windfall", name: "Windfall" },
  { index: 34, kind: "property", name: "Dubai", group: "emerald", price: 320, rent: 28 },
  { index: 35, kind: "transit", name: "East Transit", price: 200 },
  { index: 36, kind: "twist", name: "Twist" },
  { index: 37, kind: "property", name: "Los Angeles", group: "sapphire", price: 350, rent: 35 },
  { index: 38, kind: "tax", name: "Luxury Toll", taxAmount: 100 },
  { index: 39, kind: "property", name: "New York", group: "sapphire", price: 400, rent: 50 },
];

export const TRANSIT_RENTS = [25, 50, 100, 200];
export const UTILITY_RENT_MULTIPLIER_ONE = 4;
export const UTILITY_RENT_MULTIPLIER_BOTH = 10;

export function tileAt(index: number): BoardTile {
  return BOARD[((index % 40) + 40) % 40];
}