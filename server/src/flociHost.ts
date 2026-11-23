const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Trong container console, "localhost" Floci trả về là chính container: đổi sang host của Floci
export const reachableHost = (host: string, flociUrl: string) =>
  LOCAL_HOSTS.has(host) ? new URL(flociUrl).hostname : host;
