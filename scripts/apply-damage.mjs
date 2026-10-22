/**
 * Apply Damage dialog backports from the PF1 v14 development branch.
 *
 * PF1 11.x already ships the Apply Damage dialog (per-target scaling, DR/ER, hardness, immunities), but only opens it
 * when Shift is held. This module:
 *  - opens it automatically when damage is applied to several targets (configurable), with Shift flipping the default;
 *  - applies v14's rules fixes inside the dialog: energy vulnerabilities (+50%), immunity to precision/area/nonlethal
 *    on mixed damage, and DR that no longer stacks (only the largest applies).
 *
 * The rules code is adapted from the Pathfinder 1e system (GPL-3.0).
 */

import { MODULE_ID } from "./const.mjs";

const DIALOG_TEMPLATE = `modules/${MODULE_ID}/templates/apply-damage-dialog.hbs`;

export function registerApplyDamageSettings() {
  game.settings.register(MODULE_ID, "applyDamageDialog", {
    name: "PF1QOL.Settings.ApplyDamageDialog.Name",
    hint: "PF1QOL.Settings.ApplyDamageDialog.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "multiple",
    choices: {
      never: "PF1QOL.Settings.ApplyDamageDialog.Never",
      multiple: "PF1QOL.Settings.ApplyDamageDialog.Multiple",
      always: "PF1QOL.Settings.ApplyDamageDialog.Always",
    },
  });
  game.settings.register(MODULE_ID, "applyDamageRules", {
    name: "PF1QOL.Settings.ApplyDamageRules.Name",
    hint: "PF1QOL.Settings.ApplyDamageRules.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });
}

/** Number of targets ActorPF.applyDamage() will resolve, mirroring its own fallback order. */
function countTargets(options) {
  if (options.targets?.length) return options.targets.length;
  const controlled = canvas?.tokens?.controlled?.length ?? 0;
  if (controlled) return controlled;
  return game.user.character ? 1 : 0;
}

export function patchApplyDamage() {
  const ActorPF = pf1.documents.actor.ActorPF;
  const original = ActorPF.applyDamage;

  // PF1 shows the dialog when `forceDialog` and Shift (pf1.skipConfirmPrompt) disagree, so setting the default here
  // keeps Shift as the toggle: it opens the dialog for one target and skips it for several.
  ActorPF.applyDamage = function (value = 0, options = {}) {
    if (options.interactive && options.forceDialog === undefined) {
      const mode = game.settings.get(MODULE_ID, "applyDamageDialog");
      options.forceDialog = mode === "always" || (mode === "multiple" && countTargets(options) >= 2);
    }
    return original.call(this, value, options);
  };

  if (game.settings.get(MODULE_ID, "applyDamageRules")) patchDialogRules();
}

/** Vulnerabilities relevant to this damage. As in v14, only energy vulnerabilities apply in the dialog. */
function relevantVulnerabilities(app, trait) {
  const entries = [];
  if (!trait) return entries;
  for (const typeId of trait.standard ?? []) {
    if (!app.damageIds.has(typeId)) continue;
    const type = pf1.registry.damageTypes.get(typeId);
    if (!type?.isEnergy) continue;
    entries.push({ label: type.name || typeId, id: typeId, active: true, disabled: false });
  }
  for (const custom of trait.custom ?? []) entries.push({ label: custom, active: false, disabled: true });
  return entries;
}

function patchDialogRules() {
  const ApplyDamage = pf1.applications.ApplyDamage;
  const proto = ApplyDamage.prototype;

  ApplyDamage.PARTS.form.template = DIALOG_TEMPLATE;

  // Vulnerabilities: 11.x lists them disabled; v14 enables energy ones by default.
  const originalPrepareTargets = proto._prepareTargets;
  proto._prepareTargets = function (...args) {
    const result = originalPrepareTargets.apply(this, args);
    if (!this.isHealing) {
      for (const target of this.targets) {
        target.dv = relevantVulnerabilities(this, target.actor.system.traits?.dv);
        target.haveDIV = target.di.length || target.dv.length;
        this._refreshTarget(target.uuid);
      }
    }
    return result;
  };

  // Read the vulnerability checkboxes too (11.x only reads DR, ER and immunities).
  const originalAddTargetData = proto._addTargetData;
  proto._addTargetData = function (targetId, data) {
    originalAddTargetData.call(this, targetId, data);
    const target = this.targets.get(targetId);
    const dv = data?.dv;
    if (!target || !dv) return;
    for (let i = 0; i < target.dv.length; i++) dv[i] ??= { active: false };
    for (const [idx, entry] of Object.values(dv).entries()) {
      if (target.dv[idx]) foundry.utils.mergeObject(target.dv[idx], entry);
    }
  };

  // _refreshTarget calls this first, right after preparing damage instances and before any reductions, which is
  // where v14 applies vulnerabilities. Then v14's immunity rules:
  //  - immunity to a modifier type (precision, area, nonlethal) negates any instance containing it;
  //  - other immunities negate an instance when they cover every one of its types.
  proto._processImmunities = function (target) {
    const vulnerable = new Set(target.dv.filter((v) => v.active && v.id).map((v) => v.id));
    let amplified = 0;
    if (vulnerable.size) {
      for (const instance of target.instances) {
        if (!instance.typeIds.intersects(vulnerable)) continue;
        const amp = Math.floor(instance.total * 0.5); // +50%
        instance.total += amp;
        amplified += amp;
      }
    }
    target.amplified = amplified;

    const immune = target.di.filter((i) => i.active && i.id).map((i) => i.id);
    const modifierIds = new Set(pf1.registry.damageTypes.filter((t) => t.isModifier).map((t) => t.id));
    const full = new Set(immune.filter((id) => modifierIds.has(id)));
    const conditional = new Set(immune.filter((id) => !modifierIds.has(id)));

    let immunized = 0;
    for (const instance of target.instances) {
      instance.immune
        = instance.typeIds.some((t) => full.has(t)) || instance.typeIds.every((t) => conditional.has(t));
      if (instance.immune) {
        immunized += instance.total;
        instance.total = 0;
      }
    }
    return immunized;
  };

  // DR doesn't stack: only the largest DR reduces damage (v14). ER still applies per type.
  proto._processReductions = function (target, instances, reductions, dr = false) {
    let total = 0;

    let reductionLimit = 0;
    if (dr) {
      for (const r of reductions) {
        if (r.value > reductionLimit) reductionLimit = r.value;
      }
    }
    else {
      reductionLimit = Infinity;
    }

    for (const reduction of reductions) {
      if (!reduction.active) continue;
      if (reduction.value <= 0) continue;
      reduction.available = Math.min(reduction.value, reductionLimit);

      for (const instance of instances) {
        if (instance.total <= 0) continue;
        if (!this._isReducedBy(target, instance, reduction, dr)) continue;

        // Already reduced more than this DR does
        if (dr && reductionLimit <= 0) continue;

        const reduced = this._applyReduction(target, instance, reduction, dr);
        if (dr) reductionLimit -= reduced;
        total += reduced;

        // Stop early if this reduction ran out
        if (reduction.available <= 0) break;
      }
    }

    return total;
  };
}
