// The app-wide offline stack: hub client, cache, write queue and reminders.
// Reads the hub address saved by the setup screen (api/client.ts), so it always
// talks to the same hub as the rest of the app.
import { getHubUrl } from "./api/client";
import { createOffline } from "./platform";

export const offline = createOffline(getHubUrl);
