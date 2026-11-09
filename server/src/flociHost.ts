const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Floci trả địa chỉ "localhost" khi chạy ngoài Docker; từ container console, localhost lại là
// chính container console, nên đổi thành host của Floci (vd: floci). Chạy ngoài Docker thì
// host của Floci là localhost, vẫn đúng.
export const reachableHost = (host: string, flociUrl: string) =>
  LOCAL_HOSTS.has(host) ? new URL(flociUrl).hostname : host;
