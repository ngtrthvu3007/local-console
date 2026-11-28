// Binary ↔ base64 (atob / btoa có ở cả trình duyệt lẫn Node)
export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
