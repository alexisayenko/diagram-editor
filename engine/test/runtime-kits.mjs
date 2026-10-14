// The shared runtime modules ("ui/keys", "ui/metrics") as the page builds them, for tests that load one runtime module by hand.
import { keysKit } from "../lib/keys.mjs";
import { METRICS, metricsKit } from "../render/metrics.mjs";

export const keys = keysKit();
export const metrics = metricsKit(METRICS);
