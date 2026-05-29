/// User-facing rename layer for raw offense strings from police feeds.
///
/// Some upstream NIBRS labels read poorly to a non-specialist:
///   - "Simple Assault" sounds dismissive of the victim's experience —
///     every assault is serious. NIBRS uses "simple" only as a
///     technical contrast to "aggravated" (no weapon, no serious
///     bodily injury). The TravelSafe UI says "Non-Aggravated
///     Assault" instead.
///   - "All Other Offenses" is the FBI's NIBRS 90Z catch-all bucket.
///     The string tells the user nothing about what's actually inside.
///     v96p2 — first attempted "Other reports — DUI, trespass,
///     disorderly, etc." but the user reported the original "All
///     Other …" string was still showing through in the dispatch
///     feed + crime graph. Root cause: many upstream feeds publish
///     near-variants the regex didn't catch ("All Others", "Other
///     Misc Crime", "All Other Larceny", "Other Offense - State /
///     Local"). Widened the matcher to handle every "*Other*" and
///     "*Misc*" form, plus the city-specific NIBRS sub-codes that
///     belong in the same bucket. Display label now:
///     "Other / minor reports (DUI, trespass, etc.)" — short
///     enough to fit the chart legend, includes the most common
///     examples, and avoids the "All" prefix that read as "every
///     other crime in the city" to non-specialists.
///
/// The mapping is intentionally case-insensitive and whitespace-tolerant
/// because adapters publish offense names in slightly different shapes
/// (ALL-CAPS Chicago, Title-Case Cleveland, snake_cased SDPD).
///
/// This layer ONLY changes the rendered display label. The underlying
/// `ibrOffenseDescription` field is preserved unchanged so downstream
/// analytics, exports, and NIBRS-classified safety scoring continue to
/// reference the official term.

interface LabelRule {
  /** Regex against the normalized (lowercased, alphanumeric-only) raw label. */
  match: RegExp;
  display: string;
}

const RULES: LabelRule[] = [
  // Order matters: more specific first.
  { match: /^aggravatedassault$|aggravatedassaultandbattery|^assaultaggravated$/, display: "Aggravated Assault" },
  { match: /^simpleassault$|^assaultsimple$|^misdemeanorassault$|^nonaggravatedassault$|^offensivecontact$/, display: "Non-Aggravated Assault" },
  // Widened in v96p2-followup to cover every "Other / All Other /
  // Misc" variant we observe across the 30+ city feeds (each entry
  // is the normalized form — lowercased, alphanumeric-only):
  //   allotheroffense(s), allotherlarceny, allothers — Chicago / Cleveland
  //   otheroffense(s), othercrime(s), otherincident(s)
  //   otheroffensestateorlocal, otheroffensestatelocal — Boston-style suffix
  //   misc, miscellaneous, misc(ellaneous)offense(s), misc(ellaneous)crime
  //   groupb, groupboffense(s)
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

/// Returns the user-facing display label for a raw upstream offense
/// description. If no rule matches, the raw string is title-cased and
/// any standalone "Simple" prefix is replaced with "Non-Aggravated"
/// so we never surface the word "simple" in front of a crime to a
/// user, even when the upstream label is something we don't know.
export function displayOffenseLabel(raw: string): string {
  if (!raw) return "Unknown";
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const rule of RULES) {
    if (rule.match.test(normalized)) return rule.display;
  }
  // Fallback — title-case the raw and replace any "simple" prefix.
  const titled = raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return titled.replace(/^Simple\b/, "Non-Aggravated").replace(/\bSimple Assault\b/g, "Non-Aggravated Assault");
}
