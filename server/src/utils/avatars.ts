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

/** First avatar id not already used by any of the given players. Falls
 * back to the first avatar overall if somehow all are taken (can't happen
 * in practice: rooms cap at 6 players and there are 12 avatars). */
export function pickUnusedAvatar(takenAvatars: Iterable<string>): AvatarId {
  const taken = new Set(takenAvatars);
  return AVATAR_IDS.find((id) => !taken.has(id)) ?? AVATAR_IDS[0];
}
