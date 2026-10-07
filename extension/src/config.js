// Where GatorPlan runs. scripts/package.mjs rewrites this (and the matching
// content-script pattern in manifest.json) for a store build.
globalThis.GATORPLAN_URL = "http://localhost:3000";

// Bump when the data practices in the consent screen change, so everyone is
// asked again (Chrome Web Store: disclose changes after install).
globalThis.CONSENT_VERSION = 1;
