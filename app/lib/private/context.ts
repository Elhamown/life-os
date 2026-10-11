import "server-only";
import { getConfig } from "./config";
import { productionStore } from "./store";
import { createReadOnlyNotion } from "../notion/gateway";
import { PrivateError } from "./errors";
import type { PrivateContext } from "./api";
export function productionContext(): PrivateContext {
  const config = getConfig();
  const store = productionStore(config.databaseUrl, config.encryptionKey);
  return {
    config,
    store,
    notion: () => {
      if (!config.notionToken || !config.readOnlyAcknowledged)
        throw new PrivateError("NOTION_SETUP_REQUIRED", 503);
      return createReadOnlyNotion(config.notionToken);
    },
  };
}
