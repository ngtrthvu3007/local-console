export const SSM_SERVICE_ID = "ssm";
const SSM_ROOT = `/${SSM_SERVICE_ID}`;

// Tên parameter có "/" nên đưa vào query string (như ?key= của S3)
export const SEARCH_PARAMS = { name: "name" } as const;

export const SSM_ROUTE_PATTERNS = {
  parameters: "parameters",
  createParameter: "parameters/create",
  editParameter: "parameters/edit",
  parameter: "parameters/detail",
} as const;

const fullPath = (pattern: string) => `${SSM_ROOT}/${pattern}`;
const withName = (pattern: string, name: string) =>
  `${fullPath(pattern)}?${new URLSearchParams({ [SEARCH_PARAMS.name]: name })}`;

export const ssmRoutes = {
  parameters: fullPath(SSM_ROUTE_PATTERNS.parameters),
  createParameter: fullPath(SSM_ROUTE_PATTERNS.createParameter),
  editParameter: (name: string) => withName(SSM_ROUTE_PATTERNS.editParameter, name),
  parameter: (name: string) => withName(SSM_ROUTE_PATTERNS.parameter, name),
};
