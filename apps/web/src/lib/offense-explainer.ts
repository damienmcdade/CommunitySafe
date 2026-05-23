/// Plain-English explanations for the NIBRS offense codes that appear
/// in CrimeMixCard. Adapters publish offense names in slightly
/// different formats (some upper-case, some title-case, some prefixed
/// with the NIBRS code), so the lookup is a regex match against a
/// normalized form rather than an exact-string compare.

interface OffenseExplanation {
  label: string;
  description: string;
}

interface ExplainerRule {
  /** Regex against the normalized (lowercased, alphanumeric-only) offense string. */
  match: RegExp;
  explain: OffenseExplanation;
}

// Order matters: more specific rules first so "aggravated assault"
// doesn't get caught by the generic "assault" rule.
const RULES: ExplainerRule[] = [
  {
    match: /aggravatedassault|assaultaggravated|simpleassaultaggravated/,
    explain: {
      label: "Aggravated Assault",
      description:
        "Unlawful attack on another person where the attacker uses a weapon OR inflicts serious bodily injury. A standalone NIBRS Crime Against Persons offense — more severe than simple assault.",
    },
  },
  {
    match: /simpleassault|misdemeanorassault|assaultsimple|nonaggravatedassault/,
    explain: {
      label: "Simple Assault",
      description:
        "Unlawful attack causing minor injury or threatening violence without a weapon. NIBRS distinguishes simple from aggravated by the absence of a deadly weapon and the lack of serious injury.",
    },
  },
  {
    match: /robbery|carjacking/,
    explain: {
      label: "Robbery",
      description:
        "Taking or attempting to take something of value by force, threat of force, or violence. NIBRS categorizes robbery as a Crime Against Persons because the victim is present.",
    },
  },
  {
    match: /homicide|murder|manslaughter/,
    explain: {
      label: "Homicide",
      description:
        "Killing of one person by another. NIBRS subdivides into Murder/Non-negligent Manslaughter and Negligent Manslaughter based on intent.",
    },
  },
  {
    match: /rape|sodomy|sexualassault|forciblefondling|sexualbattery/,
    explain: {
      label: "Sex Offense",
      description:
        "Non-consensual sexual contact or penetration. NIBRS tracks several sub-types (rape, sodomy, sexual assault with an object, forcible fondling); local feeds vary in how they label them.",
    },
  },
  {
    match: /humantrafficking|prostitution.*compelled/,
    explain: {
      label: "Human Trafficking",
      description:
        "Recruiting, harboring, or transporting a person for forced labor or commercial sex. NIBRS added this category to track the offense as distinct from prostitution.",
    },
  },
  {
    match: /kidnapping|abduction|falseimprisonment/,
    explain: {
      label: "Kidnapping / Abduction",
      description:
        "Unlawful seizure, transportation, or detention of a person against their will. Includes false imprisonment when the victim is held but not moved.",
    },
  },
  {
    match: /burglary|breakingandentering/,
    explain: {
      label: "Burglary",
      description:
        "Unlawful entry into a structure (home, business, vehicle) to commit a felony or theft. NIBRS counts the entry itself, not what's taken — that's a separate offense if it occurs.",
    },
  },
  {
    match: /motorvehicletheft|autotheft|stolenvehicle|vehicletheft/,
    explain: {
      label: "Motor Vehicle Theft",
      description:
        "Theft of a self-propelled vehicle that runs on land surfaces (cars, trucks, motorcycles, buses, snowmobiles). Joyriding and taking-without-permission roll up to this category.",
    },
  },
  {
    match: /larceny|theftfrom|shopliftin|pocketpicking|pursesnatching|bicycletheft|theftofproperty|theftallother|theftfromvehicle|theftpetit|theftgrand/,
    explain: {
      label: "Larceny / Theft",
      description:
        "Taking property from another person without force or breaking and entering. Includes shoplifting, theft from a vehicle, pocket-picking, bike theft, and most everyday property theft.",
    },
  },
  {
    match: /arson/,
    explain: {
      label: "Arson",
      description:
        "Intentional setting of fire to property, including vehicles and buildings. NIBRS counts arson regardless of whether the property belonged to the offender.",
    },
  },
  {
    match: /vandalism|destructionofproperty|damagetoproperty|criminalmischief/,
    explain: {
      label: "Vandalism / Property Damage",
      description:
        "Willfully damaging, destroying, or defacing property without the owner's consent. NIBRS uses Destruction/Damage/Vandalism as one offense category.",
    },
  },
  {
    match: /fraud|forgery|counterfeit|identitytheft|embezzlement|wirefraud|creditcard|cybercrime|impersonation|swindle|confidence/,
    explain: {
      label: "Fraud / Financial Crime",
      description:
        "Obtaining money, property, or services through deception. Spans identity theft, credit-card fraud, wire fraud, embezzlement, forgery, and counterfeiting — all NIBRS Crimes Against Property.",
    },
  },
  {
    match: /stolenproperty|receivingstolen|possessionstolen/,
    explain: {
      label: "Stolen-Property Offenses",
      description:
        "Buying, receiving, or possessing property that the holder knows or should know is stolen. Distinct from the original theft.",
    },
  },
  {
    match: /extortion|blackmail/,
    explain: {
      label: "Extortion / Blackmail",
      description:
        "Compelling someone to give up property or perform an act through threat of injury, harm to property, accusation, or exposure of secrets.",
    },
  },
  {
    match: /drug|narcotic|controlledsubstance/,
    explain: {
      label: "Drug Offense",
      description:
        "Violations involving manufacturing, distributing, possessing, or using controlled substances. NIBRS classifies these as Crimes Against Society — there's no specific victim, the public order is the protected interest.",
    },
  },
  {
    match: /weapon|firearm|gunlaw/,
    explain: {
      label: "Weapon-Law Violation",
      description:
        "Carrying, possessing, manufacturing, or selling firearms or other weapons in violation of state or local law. A NIBRS Crime Against Society.",
    },
  },
  {
    match: /prostitution|solicitation|sexwork/,
    explain: {
      label: "Prostitution Offenses",
      description:
        "Engaging in or promoting sexual activity for compensation. NIBRS Crime Against Society. (Trafficking is tracked separately.)",
    },
  },
  {
    match: /gambling|wager|bookmaking/,
    explain: {
      label: "Gambling Offense",
      description:
        "Illegal wagering, operating a gambling business, transporting gambling devices, or related conduct. NIBRS Crime Against Society.",
    },
  },
  {
    match: /dui|drivingundertheinfluence|drivingwhileintoxicated|dwi|drunkdriving/,
    explain: {
      label: "Driving Under the Influence",
      description:
        "Operating a motor vehicle while impaired by alcohol or drugs. Tracked as a Society offense because the protected interest is general public safety, not a specific victim (though injury cases are charged additionally).",
    },
  },
  {
    match: /disorderlyconduct|disturbingthepeace|publicdisturbance/,
    explain: {
      label: "Disorderly Conduct",
      description:
        "Conduct that disturbs public peace, decency, or order — fighting, public intoxication, unreasonable noise. NIBRS Crime Against Society.",
    },
  },
  {
    match: /trespass|trespassing/,
    explain: {
      label: "Trespass",
      description:
        "Knowingly entering or remaining on property without permission. Often charged when an individual returns to a location after being told to leave.",
    },
  },
  {
    match: /liquorlaw|alcohollaw|publicintoxication|drunkenness/,
    explain: {
      label: "Liquor / Public-Intoxication",
      description:
        "Violations of state or local alcohol laws — open containers, public intoxication, selling to minors. NIBRS Crime Against Society.",
    },
  },
  {
    match: /family|domestic|childneglect|childabuse|elderabuse/,
    explain: {
      label: "Family Offenses (Non-Violent)",
      description:
        "Non-violent acts toward family members — neglect, abandonment, criminal failure to support. Violent domestic incidents are coded as assault and tracked separately.",
    },
  },
  {
    match: /weaponoffense/,
    explain: {
      label: "Weapon Offense",
      description:
        "Generic NIBRS weapon-law violation when the local feed doesn't subdivide into possession vs. discharge vs. trafficking.",
    },
  },
];

export function explainOffense(offenseName: string): OffenseExplanation {
  const normalized = offenseName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const rule of RULES) {
    if (rule.match.test(normalized)) return rule.explain;
  }
  return {
    label: offenseName,
    description:
      "This offense category isn't in our common-NIBRS dictionary yet. " +
      "It's pulled directly from the city's police feed using the upstream " +
      "name. The FBI's NIBRS user manual at cde.ucr.cjis.gov publishes the " +
      "full canonical definitions.",
  };
}
