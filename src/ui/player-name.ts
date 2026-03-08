export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PLAYER_NAME_KEY = "playerName";

export function getStoredPlayerName(storage: StorageLike): string {
  return storage.getItem(PLAYER_NAME_KEY) || "";
}

export function rememberPlayerName(storage: StorageLike, name: string): string {
  const trimmedName = name.trim();

  if (trimmedName) {
    storage.setItem(PLAYER_NAME_KEY, trimmedName);
  } else {
    storage.removeItem(PLAYER_NAME_KEY);
  }

  return trimmedName;
}
