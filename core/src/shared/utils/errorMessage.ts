const GENERIC_ERROR_NAME = "Error";

// Lỗi hạ tầng (mạng, Floci tắt) SDK chỉ báo kiểu "Deserialization error": đổi sang câu dễ hiểu
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed/;
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const DESERIALIZATION_ERROR = "Deserialization error";

interface ErrorDetails {
  name?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
  $response?: { statusCode?: number };
}

function infrastructureMessage(details: ErrorDetails): string | undefined {
  if (details.name === "TypeError" && NETWORK_FAILURE.test(details.message ?? "")) {
    return "Can't reach the console server.";
  }

  const status = details.$metadata?.httpStatusCode ?? details.$response?.statusCode;

  if (status && GATEWAY_STATUSES.has(status)) {
    return `Floci didn't answer (HTTP ${status}). Check that it's running.`;
  }

  if (details.message?.includes(DESERIALIZATION_ERROR)) {
    return `Floci sent an unexpected response${status ? ` (HTTP ${status})` : ""}.`;
  }

  return undefined;
}

export function errorMessage(error: unknown): string {
  const details = error as ErrorDetails;
  if (!details?.message) return String(error);
  const infrastructure = infrastructureMessage(details);
  if (infrastructure) return infrastructure;

  return details.name && details.name !== GENERIC_ERROR_NAME
    ? `${details.name}: ${details.message}`
    : details.message;
}
