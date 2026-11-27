import type { AttributeType } from "@aws-sdk/client-cognito-identity-provider";
import { USERNAME_EDGE_LENGTH, USERNAME_ELLIPSIS } from "./constants.ts";

export const attributeValue = (attributes: readonly AttributeType[] | undefined, name: string) =>
  attributes?.find((attribute) => attribute.Name === name)?.Value;

const MAX_PLAIN_LENGTH = 2 * USERNAME_EDGE_LENGTH + 1;

// Cắt giữa để thấy cả đầu lẫn đuôi UUID
export const truncateMiddle = (text: string) =>
  text.length > MAX_PLAIN_LENGTH
    ? `${text.slice(0, USERNAME_EDGE_LENGTH)}${USERNAME_ELLIPSIS}${text.slice(-USERNAME_EDGE_LENGTH)}`
    : text;
