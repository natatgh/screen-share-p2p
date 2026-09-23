export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRoom(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8);
}

export function isValidRoom(code: string): boolean {
  return code.length === 8 && [...code].every((c) => ROOM_ALPHABET.includes(c));
}

export function createRoom(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((n) => ROOM_ALPHABET[n % ROOM_ALPHABET.length]).join("");
}
