// Luật tên parameter của AWS
export const PARAMETER_NAME_PATTERN = /^[a-zA-Z0-9_.\-/]+$/;
export const PARAMETER_PATH_SEPARATOR = "/";

export const PARAMETER_TYPES = {
  String: { label: "String", description: "Any text, like a host name or a flag." },
  StringList: { label: "StringList", description: "Values separated by commas." },
  SecureString: {
    label: "SecureString",
    description: "Hidden in the console until you show it, like a password.",
  },
} as const;
export type ParameterType = keyof typeof PARAMETER_TYPES;
export const SECURE_STRING: ParameterType = "SecureString";

// DeleteParameters nhận tối đa 10 tên một lần
export const DELETE_PARAMETERS_BATCH = 10;
