import Box from "@cloudscape-design/components/box";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { KEY_TYPES, type KeyAttribute } from "@localconsole/core/dynamodb";

// "pk String": tên key ở màu chữ chính, kiểu màu xám (dễ đọc hơn "pk (S)")
export function KeyLabel({ attribute }: { attribute?: KeyAttribute }) {
  if (!attribute) return <Box color='text-status-inactive'>{NOT_AVAILABLE}</Box>;
  return (
    <span>
      {attribute.name}{" "}
      <Box variant='span' color='text-body-secondary'>
        {KEY_TYPES[attribute.type]}
      </Box>
    </span>
  );
}

export const keyText = (attribute: KeyAttribute) =>
  `${attribute.name} ${KEY_TYPES[attribute.type]}`;
