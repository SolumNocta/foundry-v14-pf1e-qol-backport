import { MODULE_ID } from "./const.mjs";
import { patchApplyDamage, registerApplyDamageSettings } from "./apply-damage.mjs";
import { patchItemValue } from "./item-pricing.mjs";
import { registerItemSheet } from "./item-sheet.mjs";

// PF1 12+ (Foundry v14) has these features natively.
const supported = () => game.system.id === "pf1" && !foundry.utils.isNewerVersion(game.system.version, "11.999");

Hooks.once("init", () => {
  if (!supported()) {
    console.warn(`${MODULE_ID} | Inactive: only needed for PF1 11.x (found ${game.system.id} ${game.system.version})`);
    return;
  }
  registerApplyDamageSettings();
});

Hooks.once("setup", () => {
  if (!supported()) return;
  patchApplyDamage();
  patchItemValue();
  registerItemSheet();
});
