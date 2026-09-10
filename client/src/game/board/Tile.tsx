import type { BoardTile } from "./data";
import { groupColor } from "./data";
import type { Edge } from "./layout";
import { avatarColor } from "../avatars";
import type { Player } from "../../types";

const BAR_SIDE: Record<Edge, string> = {
  bottom: "border-t-4",
  left: "border-r-4",
  top: "border-b-4",
  right: "border-l-4",
};

const BAR_COLOR_PROP: Record<Edge, string> = {
  bottom: "borderTopColor",
  left: "borderRightColor",
  top: "borderBottomColor",
  right: "borderLeftColor",
};

function TileIcon({ kind }: { kind: BoardTile["kind"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "start":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M4 12h13" {...common} />
          <path d="M12 5l7 7-7 7" {...common} />
        </svg>
      );
    case "jail":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20">
          <rect x="5" y="4" width="14" height="16" rx="1" {...common} />
          <path d="M9 4v16 M14 4v16 M5 9h14 M5 15h14" {...common} />
        </svg>
      );
    case "rest":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="7" {...common} />
          <path d="M12 8v4l3 2" {...common} />
        </svg>
      );
    case "goToJail":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M12 3v10" {...common} />
          <path d="M8 9l4 4 4-4" {...common} />
          <path d="M5 19h14" {...common} />
        </svg>
      );
    case "transit":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <rect x="5" y="4" width="14" height="12" rx="2" {...common} />
          <circle cx="8.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
          <path d="M5 10h14" {...common} />
        </svg>
      );
    case "utility":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M13 3 L6 13 h5 l-1 8 8-11 h-5 Z" {...common} />
        </svg>
      );
    case "tax":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M9 15c0-1.5 3-1.5 3-3s-3-1.5-3-3 M12 7v1 M12 16v1" {...common} />
        </svg>
      );
    case "twist":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M9 9a3 3 0 1 1 3 3v2" {...common} />
          <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "windfall":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <rect x="4" y="10" width="16" height="9" rx="1" {...common} />
          <path d="M4 10l8-6 8 6" {...common} />
          <path d="M12 13v6" {...common} />
        </svg>
      );
    default:
      return null;
  }
}

export default function Tile({
  tile,
  edge,
  occupants,
  isCorner,
  ownerColor,
  ownerName,
  houses = 0,
}: {
  tile: BoardTile;
  edge: Edge;
  occupants: Player[];
  isCorner: boolean;
  ownerColor?: string;
  ownerName?: string;
  houses?: number;
}) {
  const base = "relative flex w-full h-full bg-ink-raised border border-ink-border overflow-hidden";
  const ownerBadge = ownerColor ? (
    <span
      title={ownerName ? `Owned by ${ownerName}` : undefined}
      className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: ownerColor }}
    />
  ) : null;

  if (isCorner) {
    return (
      <div className={`${base} flex-col items-center justify-center gap-1 text-center px-1`} title={tile.name}>
        <div className="text-amber">
          <TileIcon kind={tile.kind} />
        </div>
        <span className="text-[10px] font-medium leading-tight text-parchment/90">{tile.name}</span>
        <Occupants occupants={occupants} />
      </div>
    );
  }

  if (tile.kind === "property") {
    const barStyle = { [BAR_COLOR_PROP[edge]]: groupColor(tile.group) } as React.CSSProperties;
    return (
      <div className={`${base} flex-col justify-between ${BAR_SIDE[edge]}`} style={barStyle}>
        {ownerBadge}
        <div className="px-1 py-1 flex flex-col justify-between h-full" title={tile.name}>
          <span className="text-[8.5px] leading-[1.15] text-parchment/90 line-clamp-2">{tile.name}</span>
          <HousesIndicator houses={houses} />
          <span className="text-[8px] text-slate">${tile.price}</span>
          <Occupants occupants={occupants} />
        </div>
      </div>
    );
  }

  // transit / utility / tax / twist / windfall
  const tint =
    tile.kind === "tax" ? "text-signal" : tile.kind === "twist" ? "text-amber" : tile.kind === "windfall" ? "text-teal" : "text-slate";

  return (
    <div className={`${base} flex-col items-center justify-center gap-0.5 text-center px-1`} title={tile.name}>
      {ownerBadge}
      <div className={tint}>
        <TileIcon kind={tile.kind} />
      </div>
      <span className="text-[8px] leading-tight text-parchment/80 line-clamp-2">{tile.name}</span>
      {tile.kind === "tax" && <span className="text-[8px] text-slate">${tile.taxAmount}</span>}
      <Occupants occupants={occupants} />
    </div>
  );
}

function HousesIndicator({ houses }: { houses: number }) {
  if (houses <= 0) return null;
  if (houses >= 5) {
    return (
      <div className="flex justify-center my-0.5">
        <span className="w-3 h-2 rounded-[1px] bg-signal" title="Hotel" />
      </div>
    );
  }
  return (
    <div className="flex gap-0.5 justify-center my-0.5">
      {Array.from({ length: houses }).map((_, i) => (
        <span key={i} className="w-1 h-1.5 rounded-[1px] bg-teal" />
      ))}
    </div>
  );
}

function Occupants({ occupants }: { occupants: Player[] }) {
  if (occupants.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
      {occupants.map((p) => (
        <span
          key={p.id}
          title={p.nickname}
          className="w-2.5 h-2.5 rounded-full border border-ink shrink-0"
          style={{ backgroundColor: avatarColor(p.avatar) }}
        />
      ))}
    </div>
  );
}
