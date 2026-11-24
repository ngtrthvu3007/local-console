// EC2 nhận user data dạng base64 của UTF-8; btoa / atob chỉ biết Latin-1 nên đi qua byte
export function encodeUserData(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

export function decodeUserData(base64: string): string {
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
