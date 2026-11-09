import { createApp } from "./app.ts";
import { loadConfig, type Config } from "./config.ts";
import { BIND_ADDRESS } from "./constants.ts";

const EXIT_FAILURE = 1;

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(EXIT_FAILURE);
}

createApp(config).listen(config.PORT, BIND_ADDRESS, () => {
  console.log(
    `Local Console on http://localhost:${config.PORT} → Floci ${config.AWS_ENDPOINT_URL}`,
  );
});
