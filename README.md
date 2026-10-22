# PF1e v14 QoL Backport

Backports quality-of-life features from the Pathfinder 1e system's Foundry v14 development branch to **PF1 11.x on Foundry v13**. It does nothing on PF1 12 or later, which has these features natively.

Manifest URL:

```
https://github.com/SolumNocta/foundry-v14-pf1e-qol-backport/releases/latest/download/module.json
```

## Apply Damage dialog

- **Opens automatically with two or more targets.** A single target still applies directly. Shift flips the default: it opens the dialog for one target and skips it for several. Client setting **Open Apply Damage dialog**: never (PF1 11 behaviour), with two or more targets (default), always.
- **v14 damage rules in the dialog** (world setting, on by default):
  - Energy vulnerabilities add +50%. They're listed per target and can be unticked.
  - Immunity to precision, area or nonlethal damage negates any damage instance that includes it (11.x only did so when the instance had no other type, so sneak attack got through).
  - Other immunities negate an instance when they cover all its types (fire + cold immunity vs fire + cold damage).
  - DR doesn't stack: only the largest applies (11.x subtracted every applicable DR). For DR that explicitly stacks, like Stalwart with barbarian DR, enter the combined value as one entry.

| Example | PF1 11.11 | With this module |
|---|---|---|
| 20 slashing vs DR 5/magic and DR 10/adamantine | 5 | 10 |
| 6 slashing + precision and 10 slashing vs precision immunity | 16 | 10 |
| 10 fire vs fire vulnerability | 10 | 15 |
| 10 fire + cold vs fire and cold immunity | 10 | 0 |

## Automatic pricing and modifications

On weapons, armor and shields, the Details tab gets a **Modifications** section under Enhancement Bonus.

- **Auto Price** (per item, off by default): the price is calculated from the base price, masterwork, enhancement bonus and modifications. The sidebar's Price field becomes **Base Price** (the mundane price), with the calculated **Total Price** next to it. Existing items keep their manually entered price until you turn this on.
- **Modifications** have a name, an *enhancement equivalent* and a flat price. Enhancement equivalents are added to the enhancement bonus for pricing, so a +1 keen longsword is priced as +2: 15 + 300 (masterwork) + 8,000 = 8,315 gp. Flat prices are added on top. Modifications only affect price; they don't change the item's attack, damage or other stats.
- Costs follow v14: masterwork 300 gp for weapons and 150 gp for armor and shields (implied by any enhancement bonus), enhancement +1 to +10 at 2,000 / 8,000 / 18,000 … 200,000 gp for weapons and half that for armor and shields.
- Everything that uses PF1's item value (inventory totals, containers, selling, quantity, broken and timeworn) uses the calculated price.

Data is stored in item flags (`flags.foundry-v14-pf1e-qol-backport.autoPrice` and `.mods`), so removing the module leaves items untouched apart from those flags.

## Not included

- DR, ER, immunities and vulnerabilities granted by items (buffs, gear, features). In v14 that relies on a new defenses data layer.
- Armor modifications to AC, ACP and max Dex, and weight from modifications.
- Material costs in the price calculation; include them in the base price.

## License

GPL-3.0, same as the Pathfinder 1e system, from which the dialog template and damage rules are adapted.
