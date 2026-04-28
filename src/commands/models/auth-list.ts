import path from "node:path";
import { resolveAgentDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { resolveAuthStorePathForDisplay } from "../../agents/auth-profiles/paths.js";
import { ensureAuthProfileStoreWithoutExternalProfiles as ensureAuthProfileStore } from "../../agents/auth-profiles/store.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import { type RuntimeEnv, writeRuntimeJson } from "../../runtime.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { shortenHomePath } from "../../utils.js";
import { resolveProviderAuthOverview } from "./list.auth-overview.js";
import { loadModelsConfig } from "./load-config.js";
import { resolveKnownAgentId } from "./shared.js";

export async function modelsAuthListCommand(
  opts: { provider?: string; agent?: string; json?: boolean },
  runtime: RuntimeEnv,
) {
  const cfg = await loadModelsConfig({ commandName: "models auth list", runtime });
  const agentId =
    resolveKnownAgentId({ cfg, rawAgentId: opts.agent }) ?? resolveDefaultAgentId(cfg);
  const agentDir = resolveAgentDir(cfg, agentId);
  const store = ensureAuthProfileStore(agentDir);
  const modelsPath = path.join(agentDir, "models.json");
  const storePath = shortenHomePath(resolveAuthStorePathForDisplay(agentDir));

  const filterProvider = normalizeOptionalString(opts.provider);
  const normalizedFilter = filterProvider ? normalizeProviderId(filterProvider) : null;

  const providersFromStore = new Set(
    Object.values(store.profiles)
      .map((profile) => normalizeProviderId(profile.provider))
      .filter((p): p is string => Boolean(p)),
  );
  const providersFromConfig = new Set(
    Object.keys(cfg.models?.providers ?? {})
      .map((p) => normalizeProviderId(p))
      .filter(Boolean),
  );

  const allProviders = [...new Set([...providersFromStore, ...providersFromConfig])].sort();
  const providers = normalizedFilter
    ? allProviders.filter((p) => p === normalizedFilter)
    : allProviders;

  const overviews = providers.map((provider) =>
    resolveProviderAuthOverview({ provider, cfg, store, modelsPath }),
  );

  if (opts.json) {
    writeRuntimeJson(runtime, {
      agentId,
      agentDir,
      storePath,
      providers: overviews,
    });
    return;
  }

  runtime.log(`Agent: ${agentId}`);
  runtime.log(`Auth store: ${storePath}`);
  if (overviews.length === 0) {
    if (normalizedFilter) {
      runtime.log(`No auth profiles or config found for provider '${normalizedFilter}'.`);
    } else {
      runtime.log("No auth profiles or providers configured.");
    }
    return;
  }
  for (const overview of overviews) {
    runtime.log("");
    runtime.log(`Provider: ${overview.provider}`);
    runtime.log(`  Effective: ${overview.effective.kind} (${overview.effective.detail})`);
    if (overview.profiles.count > 0) {
      runtime.log(`  Profiles (${overview.profiles.count}):`);
      for (const label of overview.profiles.labels) {
        runtime.log(`    ${label}`);
      }
    } else {
      runtime.log("  Profiles: (none)");
    }
    if (overview.env) {
      runtime.log(`  Env key: ${overview.env.value} [${overview.env.source}]`);
    }
    if (overview.modelsJson) {
      runtime.log(
        `  models.json key: ${overview.modelsJson.value} [${overview.modelsJson.source}]`,
      );
    }
  }
}
