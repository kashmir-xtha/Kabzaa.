import type { CSSProperties } from "react";

export interface AvatarDef {
  id: string;
  label: string;
  color: string;
}

// Order matters for keyboard navigation in the picker grid. Colors are
// spread ~60° apart around the hue wheel (red/gold/green/cyan/indigo/
// magenta) so all six read as clearly distinct at a glance — this matters
// since these colors are also each player's board-token and message color.
export const AVATARS: AvatarDef[] = [
  { id: "fox", label: "Fox", color: "#D9484B" },
  { id: "hare", label: "Hare", color: "#E0B93D" },
  { id: "panda", label: "Panda", color: "#3FA669" },
  { id: "seal", label: "Seal", color: "#2FAED9" },
  { id: "boar", label: "Boar", color: "#895129" },
  { id: "lynx", label: "Lynx", color: "#C450A0" },
];

export function avatarColor(id: string): string {
  return AVATARS.find((a) => a.id === id)?.color ?? "#8B90A6";
}

/** Minimal geometric line-mark for each creature. Deliberately abstract
 * rather than pictorial — reads as a badge/seal, not a mascot. */
function CreatureMark({ id }: { id: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "fox":
      return (
        <>
          <polygon points="4,10 8,2 10,10" {...common} />
          <polygon points="20,10 16,2 14,10" {...common} />
          <path d="M6 10 L18 10 L12 20 Z" {...common} />
          <circle cx="9" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </>
      );
    case "panda":
      return (
        <>
          <circle cx="12" cy="12" r="6.5" {...common} />
          <circle cx="6.5" cy="6.5" r="2.1" {...common} />
          <circle cx="17.5" cy="6.5" r="2.1" {...common} />
          <ellipse cx="8.7" cy="11.5" rx="1.5" ry="1.9" fill="currentColor" stroke="none" />
          <ellipse cx="15.3" cy="11.5" rx="1.5" ry="1.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="15.2" r="0.9" fill="currentColor" stroke="none" />
        </>
      );
    case "lynx":
      return (
        <>
          <polygon points="5,9 8,2 10,9" {...common} />
          <polygon points="19,9 16,2 14,9" {...common} />
          <line x1="8" y1="2" x2="7" y2="0.3" {...common} />
          <line x1="16" y1="2" x2="17" y2="0.3" {...common} />
          <circle cx="12" cy="13" r="6" {...common} />
          <circle cx="9.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <path d="M10 16 Q12 17.5 14 16" {...common} />
        </>
      );
    case "hare":
      return (
        <>
          <ellipse cx="9.2" cy="5.5" rx="1.8" ry="5" transform="rotate(-10 9.2 5.5)" {...common} />
          <ellipse cx="14.8" cy="5.5" rx="1.8" ry="5" transform="rotate(10 14.8 5.5)" {...common} />
          <circle cx="12" cy="15" r="5.5" {...common} />
          <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14" cy="14" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
        </>
      );
    case "boar":
      return (
        <>
          <circle cx="12" cy="12.5" r="6" {...common} />
          <polygon points="6,8 8,3.5 9.5,9" {...common} />
          <polygon points="18,8 16,3.5 14.5,9" {...common} />
          <ellipse cx="12" cy="15.5" rx="3" ry="2" {...common} />
          <circle cx="10.7" cy="15.5" r="0.5" fill="currentColor" stroke="none" />
          <circle cx="13.3" cy="15.5" r="0.5" fill="currentColor" stroke="none" />
          <circle cx="9" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
        </>
      );
    case "seal":
      return (
        <>
          <ellipse cx="12" cy="13" rx="7" ry="6" {...common} />
          <circle cx="10" cy="11" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14" cy="11" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14.3" r="0.8" fill="currentColor" stroke="none" />
          <line x1="8" y1="14" x2="3.5" y2="13" {...common} />
          <line x1="8" y1="15.7" x2="3.5" y2="16.2" {...common} />
          <line x1="16" y1="14" x2="20.5" y2="13" {...common} />
          <line x1="16" y1="15.7" x2="20.5" y2="16.2" {...common} />
        </>
      );
    case "wolf":
      return (
        <>
          <polygon points="6,9 8,2 11,9" {...common} />
          <polygon points="18,9 16,2 13,9" {...common} />
          <path d="M6 9 L18 9 L12 20 Z" {...common} />
          <circle cx="9" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="6" {...common} />;
  }
}

export function AvatarBadge({
  id,
  size = 48,
  selected = false,
  style,
}: {
  id: string;
  size?: number;
  selected?: boolean;
  style?: CSSProperties;
}) {
  const color = avatarColor(id);
  return (
    <div
      className={`notch-sm flex items-center justify-center shrink-0 transition-transform border-2 ${
        selected ? "border-amber scale-105" : "border-transparent"
      }`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        color: "#0B0D17",
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>
        <CreatureMark id={id} />
      </svg>
    </div>
  );
}
