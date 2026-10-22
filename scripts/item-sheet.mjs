/**
 * Item sheet UI for automatic pricing and item modifications (weapons, armor and shields).
 *
 * Adds a Modifications section under the Enhancement Bonus field on the Details tab, and for auto-priced items turns
 * the sidebar Price field into the base price with a read-only total next to it.
 */

import { MODULE_ID, loc } from "./const.mjs";
import { getModifications, getPriceBreakdown, isAutoPriced, pricingKind } from "./item-pricing.mjs";

const TEMPLATE = `modules/${MODULE_ID}/templates/item-modifications.hbs`;

const formatGold = (value) =>
  game.i18n.format("PF1.Currency.Inline.gp", {
    value: Number(value).toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 }),
  });

export function registerItemSheet() {
  Hooks.on("renderItemSheetPF", onRenderItemSheet);
}

async function onRenderItemSheet(app, html) {
  const item = app.item;
  if (!pricingKind(item)) return;

  const root = html instanceof HTMLElement ? html : html[0];
  const autoPrice = isAutoPriced(item);

  if (autoPrice) adjustSidebarPrice(item, root);

  // Next to the Enhancement Bonus field, which PF1 hides for unidentified items
  const enhInput = root.querySelector('input[name="system.enh"], input[name="system.armor.enh"]');
  const anchor = enhInput?.closest(".form-group");
  if (!anchor) return;

  const breakdown = getPriceBreakdown(item);
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    editable: app.isEditable,
    autoPrice,
    mods: getModifications(item).map((mod) => ({ ...mod, priceLabel: formatGold(mod.price) })),
    breakdown: {
      ...breakdown,
      parts: breakdown.parts.map((part) => ({
        ...part,
        label: part.id.startsWith("mod-") ? part.label : game.i18n.localize(part.label),
        valueLabel: formatGold(part.value),
      })),
      totalLabel: formatGold(breakdown.total),
    },
  });

  // The sheet may have re-rendered while the template was loading
  if (!anchor.isConnected) return;
  anchor.insertAdjacentHTML("afterend", content);
  const section = anchor.nextElementSibling;

  section.querySelector(".pf1qol-autoprice")?.addEventListener("change", (event) => {
    item.setFlag(MODULE_ID, "autoPrice", event.currentTarget.checked);
  });
  section.querySelector(".pf1qol-mod-add")?.addEventListener("click", () => editModification(item));
  for (const row of section.querySelectorAll(".pf1qol-mod")) {
    const id = row.dataset.modId;
    row.querySelector(".pf1qol-mod-edit")?.addEventListener("click", () => editModification(item, id));
    row.querySelector(".pf1qol-mod-delete")?.addEventListener("click", () => deleteModification(item, id));
  }
}

/** Show the stored base price in PF1's Price field and add the calculated total beside it. */
function adjustSidebarPrice(item, root) {
  const input = root.querySelector('input[name="system.price"]');
  const label = input?.closest("label");
  if (!label) return;

  const span = label.querySelector("span");
  if (span) span.textContent = loc("Price.Base");
  // Same formatting as PF1's numberFormat helper, which its price parser expects (no thousands separators)
  input.value = (Number(item.system.price) || 0).toFixed(2);

  const total = document.createElement("label");
  total.className = "descriptor text pf1qol-price-total";
  // Tooltips render as HTML and modification names are user input
  const escape = foundry.utils.escapeHTML;
  total.dataset.tooltip = getPriceBreakdown(item)
    .parts.map((p) => `${escape(p.id.startsWith("mod-") ? p.label : game.i18n.localize(p.label))}: ${formatGold(p.value)}`)
    .join("<br>");
  const name = document.createElement("span");
  name.textContent = loc("Price.Total");
  const value = document.createElement("input");
  value.type = "text";
  value.readOnly = true;
  value.disabled = true;
  value.value = item.getValue({ sellValue: 1 }).toFixed(2);
  total.append(name, value);
  label.after(total);
}

async function editModification(item, id) {
  const existing = id ? item.getFlag(MODULE_ID, `mods.${id}`) : null;
  const escape = foundry.utils.escapeHTML;
  const content = `
    <div class="form-group">
      <label>${loc("Modifications.Name")}</label>
      <div class="form-fields"><input type="text" name="name" value="${escape(existing?.name ?? "")}" required autofocus></div>
    </div>
    <div class="form-group">
      <label>${loc("Modifications.Enhancement")}</label>
      <div class="form-fields"><input type="number" name="enh" value="${existing?.enh ?? 0}" min="0" max="10" step="1"></div>
      <p class="hint">${loc("Modifications.EnhancementHint")}</p>
    </div>
    <div class="form-group">
      <label>${loc("Modifications.Price")}</label>
      <div class="form-fields"><input type="number" name="price" value="${existing?.price ?? 0}" min="0" step="0.01"></div>
      <p class="hint">${loc("Modifications.PriceHint")}</p>
    </div>`;

  const data = await foundry.applications.api.DialogV2.input({
    window: { title: loc(id ? "Modifications.Edit" : "Modifications.Add") },
    content,
    ok: { label: loc(id ? "Modifications.Save" : "Modifications.Add"), icon: "fa-solid fa-check" },
    rejectClose: false,
  });
  if (!data?.name?.trim()) return;

  const mod = {
    name: data.name.trim(),
    enh: Math.max(0, Math.trunc(Number(data.enh) || 0)),
    price: Math.max(0, Number(data.price) || 0),
  };
  await item.update({ [`flags.${MODULE_ID}.mods.${id ?? foundry.utils.randomID()}`]: mod });
}

async function deleteModification(item, id) {
  const mod = item.getFlag(MODULE_ID, `mods.${id}`);
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: loc("Modifications.Delete") },
    content: `<p>${loc("Modifications.DeleteConfirm", { name: foundry.utils.escapeHTML(mod?.name ?? "") })}</p>`,
    rejectClose: false,
  });
  if (confirmed) await item.update({ [`flags.${MODULE_ID}.mods.-=${id}`]: null });
}
