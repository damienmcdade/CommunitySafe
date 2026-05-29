/// Server-side mirror of apps/web/src/lib/offense-labels.ts. Lifted
/// here so the trend-feed dispatch bullets (formatted server-side
/// inside trend-feed.ts) emit the same user-facing labels as the
/// client-rendered components. Prior to this lift, the dispatches
/// list shipped raw upstream strings ("ALL OTHER OFFENSES") while
/// the chart legend (rendering via apps/web's displayOffenseLabel)
/// showed the friendly form — the user saw two different labels for
/// the same bucket on the same page.
///
/// Keep the rules in sync with apps/web/src/lib/offense-labels.ts.
/// The web copy is the canonical UI source; this copy is just here
/// so trend-feed.ts can produce identical strings without crossing
/// the package boundary backward.

interface LabelRule {
  match: RegExp;
  display: string;
}

const RULES: LabelRule[] = [
  { match: /^aggravatedassault$|aggravatedassaultandbattery|^assaultaggravated$/, display: "Aggravated Assault" },
  { match: /^simpleassault$|^assaultsimple$|^misdemeanorassault$|^nonaggravatedassault$|^offensivecontact$/, display: "Non-Aggravated Assault" },
  {
    match: /^(allother(s|offenses?|larceny)?|other(offenses?|crimes?|incidents?|offensestate(or)?local)?|misc(ellaneous)?(offenses?|crimes?)?|groupb(offenses?)?)$/,
    display: "Other / minor reports (DUI, trespass, etc.)",
  },
  { match: /^sexoffenses?$/, display: "Sex Offense" },
  { match: /^theftof(motorvehicle)?partsoraccessories$|^theftofmotorvehiclepartsoraccessories$/, display: "Theft of Vehicle Parts / Accessories" },
  { match: /^drugnarcoticviolations?$|^drugnarcoticoffense$/, display: "Drug / Narcotic Violation" },
  { match: /^drivingundertheinfluence$/, display: "Driving Under the Influence" },
  { match: /^drugequipmentviolations?$/, display: "Drug Equipment Violation" },
  { match: /^liquorlawviolations?$/, display: "Liquor-Law Violation" },
  { match: /^familyoffensesnonviolent$/, display: "Family Offense (Non-Violent)" },
];

export function displayOffenseLabel(raw: string): string {
  if (!raw) return "Unknown";
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const rule of RULES) {
    if (rule.match.test(normalized)) return rule.display;
  }
  const titled = raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return titled.replace(/^Simple\b/, "Non-Aggravated").replace(/\bSimple Assault\b/g, "Non-Aggravated Assault");
}
