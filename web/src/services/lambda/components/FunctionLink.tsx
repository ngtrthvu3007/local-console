import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { functionNameOfArn } from "../helpers.ts";
import { useFunctionExists } from "../hooks/useFunctions.ts";
import { lambdaRoutes, type FunctionTab } from "../routes.ts";

// ARN function thành link sang trang function; dùng ở S3 (event notification), SNS (subscription)
// và trigger của queue / bảng
export function FunctionLink({ arn, tab }: { arn: string; tab?: FunctionTab }) {
  const name = functionNameOfArn(arn);
  const exists = useFunctionExists(name).data;
  return (
    <ReferenceLink name={name} href={lambdaRoutes.function(name, tab)} missing={exists === false} />
  );
}
