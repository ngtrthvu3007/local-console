export const SSM_SERVICE_ID = "ssm";
const SSM_ROOT = `/${SSM_SERVICE_ID}`;

// Tên parameter có "/" nên đưa vào query string (như ?key= của S3)
export const SEARCH_PARAMS = { name: "name" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
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

export const ssmBaseCrumbs = [
  { text: "AWS Systems Manager", href: ssmRoutes.parameters },
  { text: "Parameter Store", href: ssmRoutes.parameters },
];

export const parameterCrumbs = (name: string) => [
  ...ssmBaseCrumbs,
  { text: name, href: ssmRoutes.parameter(name) },
];
