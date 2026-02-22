/* eslint-disable no-console */

import { getApiBaseUrls, info, runScriptForBaseUrl, step } from "./shared";

async function main() {
  const baseUrls = getApiBaseUrls();
  const runLivePlaid = process.env.RUN_LIVE_PLAID_TESTS === "true";
  const runWebhook = process.env.RUN_WEBHOOK_TESTS === "true";

  step("Layer 6: Domain execution matrix");
  info(`Base URLs: ${baseUrls.join(", ")}`);
  info(`RUN_LIVE_PLAID_TESTS=${runLivePlaid}`);
  info(`RUN_WEBHOOK_TESTS=${runWebhook}`);

  for (const baseUrl of baseUrls) {
    step(`Running deep suite for ${baseUrl}`);

    runScriptForBaseUrl("smoke:api", baseUrl);

    if (runLivePlaid) {
      runScriptForBaseUrl("smoke:plaid", baseUrl);
    }

    if (runWebhook) {
      runScriptForBaseUrl("smoke:webhook", baseUrl);
    }

    info(`Completed ${baseUrl}`);
  }

  console.log("\nDomain matrix smoke run completed successfully.");
}

main().catch((error) => {
  console.error("Domain matrix smoke run failed:", error);
  process.exit(1);
});
