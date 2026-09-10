export interface GridPos {
  row: number;
  col: number;
}

/** Classic Monopoly-style layout: Start at bottom-right, running counter
 * along the bottom to Holding (bottom-left), up the left side to Break
 * (top-left), across the top to Send-off (top-right), and down the right
 * side back to Start. 11x11 grid, 1-indexed for CSS grid-row/column. */
export function gridPosition(index: number): GridPos {
  if (index === 0) return { row: 11, col: 11 };
  if (index <= 9) return { row: 11, col: 11 - index };
  if (index === 10) return { row: 11, col: 1 };
  if (index <= 19) return { row: 11 - (index - 10), col: 1 };
  if (index === 20) return { row: 1, col: 1 };
  if (index <= 29) return { row: 1, col: index - 20 + 1 };
  if (index === 30) return { row: 1, col: 11 };
  return { row: index - 30 + 1, col: 11 };
}

export type Edge = "bottom" | "left" | "top" | "right";

/** Which edge of the board a tile sits on — determines where the color
 * bar / orientation points so it faces the board's center. */
export function edgeOf(index: number): Edge {
  if (index <= 10) return "bottom";
  if (index <= 20) return "left";
  if (index <= 30) return "top";
  return "right";
}
