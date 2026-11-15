import type { Logger } from "pino";
import type { AiClient } from "../adapters/ai/types.js";
import type { Mailer } from "../adapters/mailer.js";
import type { SessionSigner } from "../auth/session.js";
import type { Config } from "../config.js";
import type { Store } from "../repo/types.js";

/** Everything a service needs, injected so tests can swap any adapter. */
export interface Deps {
  config: Config;
  logger: Logger;
  store: Store;
  ai: AiClient;
  mailer: Mailer;
  signer: SessionSigner;
  now: () => Date;
}
