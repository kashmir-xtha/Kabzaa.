import type { BoardTile } from "./data";
import type { Edge } from "./layout";
import { avatarColor } from "../avatars";
import type { Player } from "../../types";
import jail from "../../assets/jail.png";
import vacation from "../../assets/vacation.png";
import dice from "../../assets/dice.png";

const BAR_SIDE: Record<Edge, string> = {
  bottom: "border-t-2 sm:border-t-4",
  left: "border-r-2 sm:border-r-4",
  top: "border-b-2 sm:border-b-4",
  right: "border-l-2 sm:border-l-4",
};

const BAR_COLOR_PROP: Record<Edge, string> = {
  bottom: "borderTopColor",
  left: "borderRightColor",
  top: "borderBottomColor",
  right: "borderLeftColor",
};

// Explicitly match tiles by name for the flag background
function getTileFlag(tileName: string): string | undefined {
  if (tileName === "Kathmandu" || tileName === "Pokhara") {
    return "/flags/nepal.png";
  }
  if (tileName === "Moscow" || tileName === "Petersburg" || tileName === "Kazan") {
    return "/flags/russia.png";
  }
  if (tileName === "Madrid" || tileName === "Barcelona" || tileName === "Valencia") {
    return "/flags/spain.png";
  }
  if (tileName === "Munich" || tileName === "Frankfurt" || tileName === "Berlin") {
    return "/flags/germany.png";
  }
  if (tileName === "Tokyo" || tileName === "Yokohama" || tileName === "Osaka") {
    return "/flags/japan.png";
  }
  if (tileName === "London" || tileName === "Manchester" || tileName === "Birmingham") {
    return "/flags/uk.png";
  }
  if (tileName === "Dubai" || tileName === "Abu Dhabi" || tileName === "Sharjah") {
    return "/flags/uae.png";
  }
  if (tileName === "New York" || tileName === "Los Angeles") {
    return "/flags/usa.png";
  }
  return undefined;
}

function TileIcon({ kind }: { kind: BoardTile["kind"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "start":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <g transform="rotate(180 12 12)">
            <path d="M4 12h13" {...common} />
            <path d="M12 5l7 7-7 7" {...common} />
          </g>
        </svg>
      );
    case "jail":
      return (
        <img src={jail} height="28rem" width="28rem" />
      );
    case "rest":
      return (
        <img src={vacation} height="28rem" width="28rem" />
      );
    case "autoRoll":
      return (
        <img src={dice} height="28rem" width="28rem" />
      );
    case "transit":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
          <rect x="5" y="4" width="14" height="12" rx="2" {...common} />
          <circle cx="8.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
          <path d="M5 10h14" {...common} />
        </svg>
      );
    case "utility":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
          <path d="M13 3 L6 13 h5 l-1 8 8-11 h-5 Z" {...common} />
        </svg>
      );
    case "tax":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M9 15c0-1.5 3-1.5 3-3s-3-1.5-3-3 M12 7v1 M12 16v1" {...common} />
        </svg>
      );
    case "twist":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
          <path d="M9 9a3 3 0 1 1 3 3v2" {...common} />
          <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "windfall":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
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
  rent,
}: {
  tile: BoardTile;
  edge: Edge;
  occupants: Player[];
  isCorner: boolean;
  ownerColor?: string;
  ownerName?: string;
  houses?: number;
  rent?: number;
}) {
  const base = "relative flex w-full h-full bg-ink-raised border border-ink-border/60 overflow-hidden";

  if (isCorner) {
    return (
      <div className={`${base} flex-col items-center justify-center gap-0.5 text-center p-0.5`} title={tile.name}>
        <div className="text-amber">
          <TileIcon kind={tile.kind} />
        </div>
        <span className="text-[8px] sm:text-[9.5px] font-semibold leading-tight text-parchment/90 line-clamp-1">
          {tile.name}
        </span>
        <Occupants occupants={occupants} />
      </div>
    );
  }

  // Handle Property, Transit, and Utility tiles uniformly for ownership and price tags
  const isPurchasable = tile.kind === "property" || tile.kind === "transit" || tile.kind === "utility";

  if (isPurchasable) {
    const dashColor = ownerColor || "#808080";
    const barStyle = { [BAR_COLOR_PROP[edge]]: dashColor } as React.CSSProperties;

    // Shows current rent if owned, or base purchase price if unowned
    const displayValue = ownerColor && rent !== undefined ? `$${rent}` : `$${tile.price}`;
    const flagSrc = tile.kind === "property" ? getTileFlag(tile.name) : undefined;
    const tint = tile.kind === "transit" ? "text-amber" : tile.kind === "utility" ? "text-teal" : "";

    return (
      <div className={`${base} flex-col justify-between ${BAR_SIDE[edge]}`} style={barStyle}>
        {/* Background flag layer for properties */}
        {flagSrc && (
          <div className="absolute inset-0 opacity-30 pointer-events-none flex items-center justify-center z-0">
            <img src={flagSrc} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-0.5 flex flex-col justify-between h-full w-full relative z-10" title={ownerName ? `${tile.name} (Owned by ${ownerName})` : tile.name}>
          <div className="flex items-center justify-between">
            <span className="text-[7.5px] sm:text-[8.5px] leading-tight font-medium text-parchment/90 line-clamp-2 drop-shadow-xs">
              {tile.name}
            </span>
            {tile.kind !== "property" && (
              <div className={`${tint} scale-100 shrink-0`}>
                <TileIcon kind={tile.kind} />
              </div>
            )}
          </div>

          {tile.kind === "property" ? <HousesIndicator houses={houses} /> : <div />}

          <span
            className={`text-[9px] font-mono ${ownerColor ? "font-semibold" : "text-parchment/90 font-medium drop-shadow-xs"}`}
            style={ownerColor ? { color: ownerColor } : undefined}
          >
            {displayValue}
          </span>
          <Occupants occupants={occupants} />
        </div>
      </div>
    );
  }

  const tint =
    tile.kind === "tax"
      ? "text-signal"
      : tile.kind === "twist" || tile.kind === "autoRoll"
        ? "text-amber"
        : tile.kind === "windfall"
          ? "text-teal"
          : "text-slate";

  return (
    <div className={`${base} flex-col items-center justify-center gap-0.5 text-center p-0.5`} title={tile.name}>
      <div className={tint}>
        <TileIcon kind={tile.kind} />
      </div>
      <span className="text-[7.5px] sm:text-[8.5px] leading-tight text-parchment/80 line-clamp-2">{tile.name}</span>
      {tile.kind === "tax" && <span className="text-[7px] font-mono text-slate">${tile.taxAmount}</span>}
      <Occupants occupants={occupants} />
    </div>
  );
}

function HousesIndicator({ houses }: { houses: number }) {
  if (houses <= 0) return null;

  if (houses >= 5) {
    return (
      <div className="flex items-center justify-center my-0.5" title="Hotel (Level 5)">
        <svg
          viewBox="0 0 24 24"
          className="w-6.5 h-6.5 fill-current drop-shadow-[0_0_4px_rgba(214,69,69,0.6)]"
        >
          <rect x="4.5" y="10" width="1" height="2.5" rx="0.5" fill="url(#windowGlow)" />
          <rect x="4.5" y="14.5" width="1" height="2.5" rx="0.5" fill="url(#windowGlow)" />
          <rect x="9" y="12" width="1.5" height="3" rx="0.5" fill="url(#windowGlow)" />
          <rect x="13.5" y="12" width="1.5" height="3" rx="0.5" fill="url(#windowGlow)" />
          <rect x="18.5" y="10" width="1" height="2.5" rx="0.5" fill="url(#windowGlow)" />
          <rect x="18.5" y="14.5" width="1" height="2.5" rx="0.5" fill="url(#windowGlow)" />
          <path d="M9 21v-4.5a3 3 0 0 1 6 0V21" fill="url(#windowGlow)" />
          <path d="M3 8h4v13H3V8Z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M2 8h6V5H6v1H4V5H2v3Z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M17 8h4v13h-4V8Z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M16 8h6V5h-2v1h-2V5h-2v3Z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M7 10h10v11H7V10Z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M7 10h10V7h-2v1h-2V7h-2v1h-2V7H7v3Z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
          <line x1="12" y1="7" x2="12" y2="1" stroke="#3b82f6" stroke-width="1.2" stroke-linecap="round" />
          <path d="M12 1l4 2.5L12 6V1z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1" stroke-linejoin="round" />
          <path d="M9 21v-4.5a3 3 0 0 1 6 0V21" stroke="#3b82f6" stroke-width="0.8" />
          <line x1="2" y1="22" x2="22" y2="22" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center justify-center my-0.5"
      title={`${houses} House${houses > 1 ? "s" : ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-6.5 h-6.5 fill-current drop-shadow-[0_0_3px_rgba(63,166,107,0.5)]"
      >
        <path d="M15.5 8V3.5h2V10l-2-2z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M5 10.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9.5L12 4.5 5 10.5z" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M2.5 10l9.5-8 9.5 8" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <line x1="3" y1="22" x2="21" y2="22" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span className="absolute inset-0 pt-1 flex items-center justify-center text-[10px] font-extrabold font-mono select-none">
        {houses}
      </span>
    </div>
  );
}

function Occupants({ occupants }: { occupants: Player[] }) {
  if (occupants.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-0.5 justify-center mt-auto pt-0.5">
      {occupants.map((p) => (
        <span
          key={p.id}
          title={p.nickname}
          className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-ink shrink-0 shadow-sm"
          style={{ backgroundColor: avatarColor(p.avatar) }}
        />
      ))}
    </div>
  );
}