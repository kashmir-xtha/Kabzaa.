// Server-side source of truth for valid avatar ids. The client renders
// these as original geometric icons (see client/src/game/avatars.ts) —
// this list just needs to stay in sync so the server can reject bogus ids.
export const AVATAR_IDS = [
  "fox",
  "owl",
  "otter",
  "panda",
  "raven",
  "lynx",
  "hare",
  "boar",
  "seal",
  "crane",
  "wolf",
  "stag",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export function isValidAvatar(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATAR_IDS as readonly string[]).includes(value);
}
