import { createApp } from "./app.js";
import { env } from "./shared/config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${env.PORT}`);
});
