const IDENTITY_KEY = "kabzaa:identity";
const SESSION_KEY = "kabzaa:session";

export interface StoredIdentity {
  nickname: string;
}

export interface StoredSession {
  roomCode: string;
  playerId: string;
}

export function loadIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as StoredIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: StoredIdentity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Storage can fail in private-browsing contexts — non-fatal, the
    // player just won't have their nickname prefilled next time.
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Non-fatal — see saveIdentity.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Non-fatal.
  }
}
