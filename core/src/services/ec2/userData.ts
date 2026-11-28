import { fromBase64, toBase64 } from "#shared/utils/encoding.ts";

// EC2 nhận user data dạng base64 của UTF-8; btoa / atob chỉ biết Latin-1 nên đi qua byte
export const encodeUserData = (text: string) => toBase64(new TextEncoder().encode(text));

export const decodeUserData = (base64: string) => new TextDecoder().decode(fromBase64(base64));
