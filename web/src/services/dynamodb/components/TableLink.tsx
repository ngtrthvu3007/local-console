import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useTableExists } from "../hooks/useTables.ts";
import { dynamodbRoutes } from "../routes.ts";

// Tên bảng thành link sang trang bảng; dùng ở data source của AppSync
export function TableLink({ name }: { name: string }) {
  const exists = useTableExists(name).data;
  return <ReferenceLink name={name} href={dynamodbRoutes.table(name)} missing={exists === false} />;
}
