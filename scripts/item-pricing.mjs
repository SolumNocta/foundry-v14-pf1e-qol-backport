/**
 * Automatic weapon and armor pricing with item modifications, backported from the PF1 v14 development branch.
 *
 * v14 derives an item's price from its base price, masterwork, enhancement bonus and modifications. Magic qualities
 * such as Keen count as extra enhancement for pricing (a +1 keen sword is priced as +2). In PF1 11.x the price field
 * holds the full price, so this is opt-in per item: with "Auto price" on, the price field is the mundane base price.
 *
 * Data lives in item flags:
 *   flags[MODULE_ID].autoPrice  boolean
 *   flags[MODULE_ID].mods       { [id]: { name: string, enh: number, price: number } }
 *     enh   - enhancement-bonus equivalent for pricing (Keen: 1)
 *     price - flat cost in gp
 *
 * Costs and rules are those of v14's config (masterwork and itemEnhancement), not configurable here.
 */

import { MODULE_ID } from "./const.mjs";

const MASTERWORK_COST = { weapon: 300, armor: 150, shield: 150 };
const ENHANCEMENT_COST = {
  weapon: [2_000, 8_000, 18_000, 32_000, 50_000, 72_000, 98_000, 128_000, 162_000, 200_000],
  armor: [1_000, 4_000, 9_000, 16_000, 25_000, 36_000, 49_000, 64_000, 81_000, 100_000],
};
export const MAX_TOTAL_ENHANCEMENT = 10;

/** "weapon", "armor" or "shield" for items that can be auto-priced, otherwise null. */
export function pricingKind(item) {
  if (item.type === "weapon") return "weapon";
  if (item.type === "equipment" && ["armor", "shield"].includes(item.system.subType)) return item.system.subType;
  return null;
}

export function isAutoPriced(item) {
  return pricingKind(item) !== null && item.getFlag(MODULE_ID, "autoPrice") === true;
}

/** Item modifications, sorted by name. */
export function getModifications(item) {
  const mods = item.getFlag(MODULE_ID, "mods") ?? {};
  return Object.entries(mods)
    .map(([id, mod]) => ({
      id,
      name: mod?.name || "",
      enh: Math.max(0, Math.trunc(Number(mod?.enh) || 0)),
      price: Math.max(0, Number(mod?.price) || 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * Price components in gp, in v14's order.
 *
 * @returns {{parts: Array<{id: string, label: string, detail?: string, value: number}>, total: number,
 *   bonus: number, virtual: number, enhancement: number, overLimit: boolean}}
 */
export function getPriceBreakdown(item) {
  const kind = pricingKind(item);
  const system = item.system;
  const base = Number(system.price) || 0;
  const bonus = (kind === "weapon" ? system.enh : system.armor?.enh) || 0;
  const mods = getModifications(item);
  const virtual = mods.reduce((sum, mod) => sum + mod.enh, 0);
  const enhancement = bonus + virtual;

  const parts = [{ id: "base", label: "PF1QOL.Price.Base", value: base }];

  // Masterwork is implied by an enhancement bonus, as in v14
  if (system.masterwork || bonus > 0) {
    parts.push({ id: "masterwork", label: "PF1.Masterwork", value: MASTERWORK_COST[kind] ?? 0 });
  }

  if (enhancement > 0) {
    const table = kind === "weapon" ? ENHANCEMENT_COST.weapon : ENHANCEMENT_COST.armor;
    parts.push({ id: "enh", label: "PF1.EnhancementBonus", detail: `+${enhancement}`, value: table[enhancement - 1] ?? 0 });
  }

  for (const mod of mods) {
    if (mod.price) parts.push({ id: `mod-${mod.id}`, label: mod.name, value: mod.price });
  }

  return {
    parts,
    total: parts.reduce((sum, part) => sum + part.value, 0),
    bonus,
    virtual,
    enhancement,
    overLimit: enhancement > MAX_TOTAL_ENHANCEMENT,
  };
}

/**
 * Make item value calculations use the derived price.
 *
 * ItemPhysicalPF#getValue reads system.price and then applies charges, broken/timeworn multipliers, quantity and
 * sale ratio. The derived price is swapped in for the duration of the call so all of that still applies, and
 * everything built on getValue (sheets, inventories, containers, selling) agrees.
 */
export function patchItemValue() {
  const proto = pf1.documents.item.ItemPhysicalPF.prototype;
  const original = proto.getValue;
  proto.getValue = function (...args) {
    if (!isAutoPriced(this)) return original.apply(this, args);
    const system = this.system;
    const stored = system.price;
    system.price = getPriceBreakdown(this).total;
    try {
      return original.apply(this, args);
    } finally {
      system.price = stored;
    }
  };
}
