export const MODULE_ID = "foundry-v14-pf1e-qol-backport";

/** Localize a key under this module's namespace. */
export const loc = (key, data) =>
  data ? game.i18n.format(`PF1QOL.${key}`, data) : game.i18n.localize(`PF1QOL.${key}`);
