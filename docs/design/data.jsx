// data.jsx — fake lab data for the prototype

const WORKSPACE = {
  name: "Solid-State Battery Lab",
  sub: "halide-lab.org",
  pi: "Dr. Mei Tanaka",
};

const PROJECTS = [
  {
    id: "p_nmc",
    emblem: "N",
    name: "NMC811 Cathode Optimization",
    tagline: "Pushing high-Ni cycling stability past 200 cycles at 4.3 V.",
    visibility: "workspace",
    activeIter: 7,
    samples: 34,
    experiments: 58,
    artifacts: 142,
    collaborators: ["MT","JR","SP","KB","DV"],
    status: "active",
  },
  { id: "p_sulf", emblem: "S", name: "Sulfide Electrolyte Stability", tagline: "LPSCl moisture sensitivity & dry-room handling.", visibility: "workspace", status: "active" },
  { id: "p_af", emblem: "A", name: "Anode-Free Cell Architecture", tagline: "Lithium-metal plating uniformity on copper.", visibility: "workspace", status: "active" },
  { id: "p_sei", emblem: "F", name: "SEI Formation Protocols", tagline: "Low-rate formation cycles vs. impedance growth.", visibility: "private", status: "planned" },
  { id: "p_pmm", emblem: "P", name: "Post-Mortem Methodology", tagline: "Cross-sectional SEM workflow.", visibility: "workspace", status: "active" },
];

const ITERATIONS = [
  { id: "it_7", num: 7, name: "High-Ni Cycling Window — 4.30 V cutoff", status: "active",  start: "May 18", end: "Jun 12", samples: 6,  experiments: 11, owner: "JR", desc: "Cells from batch 7B at 4.30 V upper cutoff; tracking impedance growth and gas evolution against the 4.20 V baseline." },
  { id: "it_6", num: 6, name: "Baseline 4.20 V Reference",                status: "done",    start: "Apr 28", end: "May 17", samples: 5,  experiments: 9,  owner: "JR", desc: "Reference dataset for batch 7A. Capacity retention 94.2% at C/3 over 80 cycles." },
  { id: "it_5", num: 5, name: "LPSCl Precursor Drying Sweep",              status: "done",    start: "Apr 06", end: "Apr 27", samples: 12, experiments: 14, owner: "SP", desc: "Three drying protocols evaluated; 110°C / 18 h selected for downstream cells." },
  { id: "it_4", num: 4, name: "Electrode Coating Calibration",             status: "done",    start: "Mar 18", end: "Apr 05", samples: 8,  experiments: 7,  owner: "KB", desc: "Coater slot-die at 40 µm wet; loading 12.4 mg/cm² ± 0.3." },
  { id: "it_8", num: 8, name: "Cross-Polymer Binder Comparison",           status: "planned", start: "Jun 15", end: "Jul 03", samples: 4,  experiments: 8,  owner: "DV", desc: "PVDF vs. CMC/SBR aqueous binders on 7B cathodes." },
  { id: "it_9", num: 9, name: "Pouch-Cell Scale-Up Trial",                 status: "planned", start: "Jul 06", end: "Jul 28", samples: 2,  experiments: 5,  owner: "MT", desc: "Move best 7B formulation from coin to 200 mAh pouch geometry." },
];

const SAMPLES = [
  { id: "NMC-7B-cell-014", kind: "cell",      name: "Coin cell, batch 7B, channel 14", chem: "NMC811 // LPSCl // Li-In",  mass: "11.42 g", cap: "192 mAh/g", v: "4.30 V", status: "active",   parent: "NMC-7B-cathode-r3" },
  { id: "NMC-7B-cell-015", kind: "cell",      name: "Coin cell, batch 7B, channel 15", chem: "NMC811 // LPSCl // Li-In",  mass: "11.38 g", cap: "189 mAh/g", v: "4.30 V", status: "active",   parent: "NMC-7B-cathode-r3" },
  { id: "NMC-7B-cell-016", kind: "cell",      name: "Coin cell, batch 7B, channel 16", chem: "NMC811 // LPSCl // Li-In",  mass: "11.45 g", cap: "—",         v: "4.30 V", status: "failed",   parent: "NMC-7B-cathode-r3", note: "Short on cycle 4." },
  { id: "NMC-7B-cathode-r3", kind: "electrode", name: "Cathode coating r3, 12.4 mg/cm²", chem: "NMC811 + PVDF + Super C65", load: "12.4 mg/cm²", status: "active", parent: "NMC811-pwd-04" },
  { id: "LPSCl-batch-22",   kind: "precursor", name: "LPSCl electrolyte, 110°C dried",  chem: "Li₆PS₅Cl",                  mass: "3.20 g",  status: "active",   parent: null },
  { id: "NMC811-pwd-04",    kind: "precursor", name: "NMC811 powder, calcined lot 04",  chem: "LiNi₀.₈Mn₀.₁Co₀.₁O₂",       mass: "48.6 g",  status: "active",   parent: null },
  { id: "PM-cell-014-cs",   kind: "derivative", name: "Cross-section, post-mortem",      chem: "(from cell-014)",          status: "active",   parent: "NMC-7B-cell-014" },
];

const EXPERIMENTS = [
  { id: "EX-211", method: "cycling", title: "Galvanostatic cycling, C/3, 4.30 V cutoff",  samples: ["NMC-7B-cell-014","NMC-7B-cell-015","NMC-7B-cell-016"], by: "JR", at: "May 22 · 11:42", status: "in_progress", summary: "Channel 16 shorted on cycle 4. 014 & 015 holding 188+ mAh/g through cycle 22." },
  { id: "EX-209", method: "EIS",     title: "Impedance spectroscopy at SoC 50%",          samples: ["NMC-7B-cell-014"],                                       by: "JR", at: "May 21 · 09:10", status: "completed",   summary: "Rct = 38 Ω, +12 Ω vs baseline 7A. Suggests minor interface growth." },
  { id: "EX-205", method: "SEM",     title: "Post-mortem SEM, top-down + cross-section",   samples: ["PM-cell-014-cs"],                                       by: "SP", at: "May 19 · 15:30", status: "completed",   summary: "Cathode particles intact; visible Li dendrite on separator." },
  { id: "EX-200", method: "XRD",     title: "Baseline XRD on NMC811 powder",               samples: ["NMC811-pwd-04"],                                        by: "KB", at: "May 12 · 10:00", status: "completed",   summary: "Sharp (003) at 18.7°; consistent with calcined α-NaFeO₂." },
  { id: "EX-196", method: "drying",  title: "LPSCl drying — 110°C / 18 h, glovebox",       samples: ["LPSCl-batch-22"],                                        by: "SP", at: "May 04 · 18:00", status: "completed",   summary: "Mass loss 4.2%. Conductivity 1.7 mS/cm at 25°C." },
];

const ARTIFACTS = [
  { id: "ar_01", type: "pdf",   name: "Maxwell-cycling-report-w22.pdf",       size: "1.2 MB", by: "JR", at: "2 hours ago", thumb: "plot" },
  { id: "ar_02", type: "ipynb", name: "post_mortem_analysis.ipynb",            size: "284 KB", by: "SP", at: "yesterday",   thumb: "code" },
  { id: "ar_03", type: "image", name: "SEM_top_cell014_25kx.png",              size: "8.4 MB", by: "SP", at: "yesterday",   thumb: "sem" },
  { id: "ar_04", type: "image", name: "SEM_cross_cell014_10kx.png",            size: "9.1 MB", by: "SP", at: "yesterday",   thumb: "sem" },
  { id: "ar_05", type: "pdf",   name: "EIS-summary-week22.pdf",                size: "640 KB", by: "JR", at: "2 days ago",  thumb: "plot" },
  { id: "ar_06", type: "ipynb", name: "impedance_fitting.ipynb",               size: "172 KB", by: "JR", at: "2 days ago",  thumb: "code" },
  { id: "ar_07", type: "image", name: "coater_setup_apr18.jpg",                size: "3.8 MB", by: "KB", at: "Apr 18",      thumb: "photo" },
  { id: "ar_08", type: "pdf",   name: "LPSCl-drying-protocol-v2.pdf",          size: "420 KB", by: "SP", at: "May 04",      thumb: "doc" },
  { id: "ar_09", type: "image", name: "XRD_NMC811_pwd04.png",                  size: "1.9 MB", by: "KB", at: "May 12",      thumb: "plot" },
  { id: "ar_10", type: "image", name: "cell014_assembly.jpg",                  size: "2.4 MB", by: "JR", at: "May 17",      thumb: "photo" },
  { id: "ar_11", type: "pdf",   name: "Safety-review-iter6.pdf",               size: "780 KB", by: "MT", at: "May 18",      thumb: "doc" },
  { id: "ar_12", type: "ipynb", name: "voltage_curve_overlay.ipynb",           size: "96 KB",  by: "JR", at: "May 21",      thumb: "code" },
];

const PEOPLE = {
  MT: { name: "Mei Tanaka",  role: "PI",          color: "#a64a2a" },
  JR: { name: "Jules Reyes", role: "PhD",         color: "#3d6b8a" },
  SP: { name: "Sam Patel",   role: "PhD",         color: "#5a7d3a" },
  KB: { name: "Karim Bah",   role: "Postdoc",     color: "#8a6a3a" },
  DV: { name: "Dara Vance",  role: "MSc",         color: "#7a5aa0" },
  HQ: { name: "Hua Qin",     role: "Collaborator (Caltech)", color: "#6a5a3a" },
};

const EVENTS = [
  { d: "May 28", w: "Wed", t: "Iter-6 → Iter-7 handoff review",       sub: "Standup · 30 min · JR + SP + MT", kind: "milestone" },
  { d: "May 30", w: "Fri", t: "PI weekly · Cycling data debrief",     sub: "Office hours · 45 min · MT",      kind: "meeting" },
  { d: "Jun 02", w: "Mon", t: "Deadline · Quarterly DOE-BES report",  sub: "Hard deadline · all hands",       kind: "deadline" },
  { d: "Jun 05", w: "Thu", t: "Glovebox maintenance window",          sub: "Building 3 · 2 h downtime",       kind: "reminder" },
  { d: "Jun 12", w: "Wed", t: "Iter-7 end · cycling cutoff",          sub: "Auto-marker · iterations",        kind: "milestone" },
  { d: "Jun 15", w: "Sat", t: "Iter-8 start · binder comparison",     sub: "Auto-marker · iterations",        kind: "milestone" },
  { d: "Jun 20", w: "Thu", t: "Hua Qin (Caltech) site visit",         sub: "Meeting · 3 h · MT + JR",         kind: "meeting" },
];

// ──────────────────────────────────────────────────────
// Regular meetings — workspace-scoped notebook of past meetings.
// Historical record + ongoing minutes. Each meeting has attendees,
// agenda, discussion points, decisions, and action items.
// ──────────────────────────────────────────────────────
const MEETINGS = [
  {
    id: "mtg_2026_05_21",
    title: "PI weekly · Week 22",
    kind: "PI weekly",
    date: "May 21, 2026",
    time: "10:00 – 10:45 PT",
    location: "Building 3, Room 207 + Zoom",
    chair: "MT",
    attendees: ["MT","JR","SP","KB","DV","HQ"],
    agenda: [
      "Iter-7 mid-iteration cycling status",
      "cell-016 failure — root cause + safety review",
      "DOE-BES quarterly report — outline review",
      "Iter-8 binder comparison — kickoff",
      "Caltech collaboration: data exchange + visit",
    ],
    discussion: [
      "JR walked through iter-7 cycling data. Cells 014 and 015 are tracking 188+ mAh/g at C/3 through cycle 22. Cell 016 shorted on cycle 4; SEM cross-section showed visible Li dendrite on separator.",
      "SP flagged that the separator-lot QA records for cell 016 are missing. Consensus: separator lot is the likely culprit, not chemistry. Action to follow.",
      "MT recommended pausing 4.30 V cycling on remaining batch 7B until separator validation is complete. Group agreed.",
      "DV presented iter-8 binder comparison protocol. PVDF vs CMC/SBR on 7B cathodes. ICP-MS validation step added based on SP feedback.",
      "HQ shared preliminary 4.25 V results from Caltech — similar Rct shift pattern. Agreed to formalize a data-exchange MOU.",
    ],
    decisions: [
      "Iter-7 cycling continues on cells 014/015 only; cell 016 replacement gated on separator-lot QA.",
      "PI review on cell-016 short closed — root cause: manufacturing defect (separator).",
      "Iter-8 kickoff approved, starts Jun 15.",
      "Quarterly report draft due May 28 (JR lead).",
    ],
    actions: [
      { who: "JR", what: "Draft DOE-BES quarterly report section 3 (cycling).", due: "May 28", status: "open" },
      { who: "SP", what: "Audit separator-lot QA for batch 7B and document findings.", due: "May 25", status: "open" },
      { who: "DV", what: "Confirm aqueous slurry exposure protocol for iter-8.", due: "Jun 03", status: "open" },
      { who: "MT", what: "Sign data-exchange MOU with Caltech (Qin group).", due: "Jun 10", status: "open" },
      { who: "KB", what: "Coater calibration check before iter-8 binder runs.", due: "Jun 12", status: "open" },
    ],
    notes: "Next meeting: May 28 at 10:00 PT. Standing agenda for handoff review iter-6 → iter-7 close-out.",
  },
  {
    id: "mtg_2026_05_14",
    title: "PI weekly · Week 21",
    kind: "PI weekly",
    date: "May 14, 2026",
    time: "10:00 – 10:40 PT",
    location: "Building 3, Room 207",
    chair: "MT",
    attendees: ["MT","JR","SP","KB","DV"],
    agenda: [
      "Iter-6 close-out · 4.20 V baseline",
      "Iter-7 kickoff readiness",
      "Dry-room humidity excursion on May 14 — incident review",
      "Cycling instrument scheduling",
    ],
    discussion: [
      "JR closed iter-6 — capacity retention 94.2% at C/3 over 80 cycles, baseline confirmed.",
      "SP raised the dry-room dewpoint spike to -25°C on May 14 morning. LPSCl precursor was sealed; estimated exposure 12 min before HVAC corrected.",
      "Discussion of whether to re-validate LPSCl batch 22 with FT-IR. SP volunteered to run.",
      "KB confirmed cycling channels 1–8 available for iter-7 starting May 18.",
    ],
    decisions: [
      "Iter-6 baseline accepted as reference for iter-7 comparison.",
      "LPSCl batch 22 will be re-validated; iter-5 drying SOPs reviewed.",
      "Glovebox maintenance window scheduled for Jun 05.",
    ],
    actions: [
      { who: "SP", what: "Run FT-IR re-validation on LPSCl batch 22.", due: "May 17", status: "done" },
      { who: "JR", what: "Post iter-7 cycling kickoff protocol to Pages.", due: "May 18", status: "done" },
      { who: "KB", what: "Reserve cycling channels 1–8 for iter-7.", due: "May 17", status: "done" },
    ],
    notes: "All May-14 action items closed by May 18 standup.",
  },
  {
    id: "mtg_2026_05_07",
    title: "Iter-5 → Iter-6 handoff",
    kind: "Handoff review",
    date: "May 07, 2026",
    time: "14:00 – 14:30 PT",
    location: "Building 3, Room 207",
    chair: "SP",
    attendees: ["SP","JR","KB","MT"],
    agenda: [
      "Iter-5 LPSCl drying results recap",
      "Drying SOP finalization",
      "Iter-6 baseline cycling kickoff",
    ],
    discussion: [
      "SP presented final drying-sweep results. 110°C / 18 h selected based on conductivity 1.7 mS/cm and 4.2% mass loss.",
      "JR aligned iter-6 baseline cell prep to use the selected SOP.",
      "MT signed off on the SOP for downstream cells.",
    ],
    decisions: [
      "LPSCl drying SOP v2 locked: 110°C / 18 h in glovebox.",
      "Iter-6 starts May 09 with 5 baseline cells.",
    ],
    actions: [
      { who: "SP", what: "Publish drying SOP v2 to Pages.", due: "May 09", status: "done" },
      { who: "JR", what: "Build 5 baseline cells for iter-6.", due: "May 11", status: "done" },
    ],
    notes: "Clean handoff. No outstanding items.",
  },
  {
    id: "mtg_2026_05_28",
    title: "Iter-6 → Iter-7 handoff review",
    kind: "Handoff review",
    date: "May 28, 2026",
    time: "10:30 – 11:00 PT",
    location: "Building 3, Room 207",
    chair: "JR",
    attendees: ["JR","SP","MT"],
    agenda: [
      "Iter-6 final numbers",
      "Iter-7 mid-iteration check-in",
      "DOE-BES report status",
    ],
    discussion: ["[Upcoming meeting — agenda preview]"],
    decisions: [],
    actions: [],
    notes: "Scheduled · auto-pulled from project calendar.",
    upcoming: true,
  },
];

const RISK = {
  // Projects
  p_nmc: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 22 · 14:08",
    runBy: "AI · approved by JR",
    flaggedForPI: true,
    flagReason: "Item #2 — likelihood high + impact kills cycle-life claim · PI notified May 22",
    summary: "High-Ni cycling at 4.30 V upper cutoff carries elevated thermal-runaway risk vs the iter-6 4.20 V baseline. Cell-016 short on cycle 4 is a separate handling concern, not chemistry. Two HIGH-likelihood items below; mitigations are in flight.",
    items: [
      {
        risk: {
          title: "High-cutoff Rct growth runs away",
          description: "Cycling at 4.30 V accelerates the cathode/electrolyte interface beyond the iter-6 4.20 V baseline. +12 Ω already at SoC 50% on cell-014.",
        },
        likelihood: "high",
        impact: {
          tone: "warn",
          headline: "Lowers paper rigor",
          description: "Capacity-retention curve diverges from iter-6 by cycle 50; the iter-7 hypothesis weakens and reviewers will flag selection bias.",
        },
        mitigation: "EIS sweep every 20 cycles on cells 014 / 015 to track Rct(cycle). Escalate to 4.35 V only if shift saturates by cycle 50. Pre-register the saturation criterion before we look at the data.",
      },
      {
        risk: {
          title: "Batch-7B separator defect generalizes",
          description: "Cell-016 shorted on cycle 4 with visible Li dendrite on the separator. Separator-lot QA records for the cell were missing.",
        },
        likelihood: "high",
        impact: {
          tone: "bad",
          headline: "Kills the cycle-life claim",
          description: "If batch 7B has systematic separator perforation we cannot defend a fair iter-6 → iter-7 comparison, and the safety story has to be retracted.",
        },
        mitigation: "Quarantine batch 7B coin-cell stack from 4.30 V cycling until the separator-lot QA audit (SP) finishes. Re-build cell-016 replacement only from the validated separator lot.",
      },
      {
        risk: {
          title: "Thermal runaway at elevated cutoff",
          description: "Thermal-runaway probability scales with cutoff; we are at the edge of the validated 4.20 V window without a chamber abort interlock.",
        },
        likelihood: "low",
        impact: {
          tone: "bad",
          headline: "Kills the project",
          description: "Low probability but catastrophic — a thermal event in the dry-room would force a multi-week safety review and likely halt iter-8 / iter-9.",
        },
        mitigation: "Cycling restricted to in-glovebox channels 1–8 only. Per-channel thermistor with auto-abort at +2 °C over chamber baseline. Daily eyes-on inspection on first 10 cycles.",
      },
      {
        risk: {
          title: "Caltech 4.25 V results don't replicate",
          description: "HQ's group reports a similar Rct shift at 4.25 V. We are betting on their data to justify the elevated cutoff in the DOE-BES report.",
        },
        likelihood: "medium",
        impact: {
          tone: "warn",
          headline: "Lowers novelty",
          description: "Without an independent replication our 4.30 V finding is a single-lab result; report falls back to iter-6 baseline framing.",
        },
        mitigation: "MOU with Qin group signed by Jun 10. Data-exchange covers raw cycling CSVs and EIS. Plan B: reframe paper around mechanism (Rct vs cycle) using iter-6 baseline + iter-7 high-cutoff, skip the novelty claim.",
      },
    ],
  },
  p_sulf: {
    workflow: "experimental_risk_v1",
    runAt: "May 18 · 09:30",
    runBy: "AI · approved by SP",
    flaggedForPI: true,
    flagReason: "Dry-room humidity excursion (#1) hits both likelihood high and impact high · PI notified May 18",
    summary: "LPSCl is moisture-sensitive; recent humidity excursion in the dry-room raises handling risk. PI review recommended before next batch.",
    items: [
      {
        risk: {
          title: "Dry-room humidity excursion repeats",
          description: "Dewpoint spike to -25 °C on May 14 morning. LPSCl precursor was sealed; estimated exposure 12 min before HVAC corrected.",
        },
        likelihood: "high",
        impact: {
          tone: "bad",
          headline: "Kills the synthesis batch",
          description: "Decomposed LPSCl evolves H₂S and loses ionic conductivity. Every downstream cell built from a compromised batch must be discarded.",
        },
        mitigation: "Re-validate dry-room dewpoint before next synthesis batch. Install secondary dewpoint logger with alarm. FT-IR validation on every new LPSCl batch before downstream use.",
      },
      {
        risk: {
          title: "H₂S evolution during open-air handling",
          description: "Decomposition products if exposed. Operator PPE adequate inside glovebox but transfer to fume hood is the failure mode.",
        },
        likelihood: "medium",
        impact: {
          tone: "bad",
          headline: "Operator hazard",
          description: "H₂S is acutely toxic at low concentrations; an unmonitored leak in the synthesis area is a building-evac event.",
        },
        mitigation: "Mandatory H₂S monitor in synthesis area. Restrict open-air handling to fume hood with active scrubber. Two-person rule for any open transfer.",
      },
    ],
  },
  p_af: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 11 · 16:42",
    runBy: "AI · approved by MT",
    flaggedForPI: true,
    flagReason: "Inherent dendrite risk in anode-free architecture",
    summary: "Anode-free architecture with lithium plating on copper. High thermal-runaway risk if plating becomes uneven; visually inspect cells after every formation cycle.",
    items: [
      {
        risk: {
          title: "Uneven Li plating → dendrite",
          description: "Inherent to the anode-free architecture; Cu surface prep can only mitigate, not eliminate.",
        },
        likelihood: "high",
        impact: {
          tone: "bad",
          headline: "Kills the project",
          description: "A dendrite short during cycling in the dry-room is the worst-case incident scenario.",
        },
        mitigation: "Visual inspection of Cu surface after every formation cycle. Cycle in thermal chamber with abort on >2 °C delta. Halt at first sign of CE < 99.0%.",
      },
      {
        risk: {
          title: "Cu substrate surface variability",
          description: "Plating uniformity depends on Cu surface energy and roughness. Lot-to-lot variation is hard to control with COTS Cu foil.",
        },
        likelihood: "medium",
        impact: {
          tone: "warn",
          headline: "Lowers reproducibility",
          description: "Sample-to-sample variation will be high; need many cells to argue trends.",
        },
        mitigation: "Source from single Cu lot for paper 1. Document surface treatment SOP. Run 6+ cells per condition.",
      },
    ],
  },
  p_sei: {
    workflow: "experimental_risk_v1",
    runAt: null,
    summary: "Not yet assessed.",
    items: [],
  },
  p_pmm: {
    workflow: "experimental_risk_v1",
    runAt: "Apr 29 · 11:00",
    runBy: "AI · approved by SP",
    flaggedForPI: false,
    summary: "Post-mortem dissection of cycled cells in glovebox. Standard procedures cover most risks.",
    items: [
      {
        risk: {
          title: "Sharp / cut hazards during dissection",
          description: "Razor disassembly of cycled coin cells in glovebox.",
        },
        likelihood: "medium",
        impact: {
          tone: "warn",
          headline: "Operator injury",
          description: "Cut-glove protocol covers most but glovebox dexterity limits make slips more likely.",
        },
        mitigation: "Cut-resistant gloves under glovebox gloves. Single-person dissection only; spotter outside.",
      },
      {
        risk: {
          title: "Residual electrolyte exposure",
          description: "Sealed cells, glovebox dissection. Most risk eliminated by environment.",
        },
        likelihood: "low",
        impact: {
          tone: "warn",
          headline: "Skin / eye irritant",
          description: "LP30 residue can cause mild burns if seal is broken outside glovebox.",
        },
        mitigation: "Discharge any cells > 3.0 V before dissection. PPE protocol unchanged.",
      },
    ],
  },

  // Iterations
  it_7: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 21 · 18:22",
    runBy: "AI · approved by JR",
    flaggedForPI: true,
    flagReason: "Cell-016 short + dendrite finding (#1) · Mei notified May 21 18:24",
    summary: "Cell-016 cycle-4 short combined with the 4.30 V cutoff pushes this iteration into elevated territory. Mei was auto-notified; visual SEM confirmed dendrite on separator. Cycling continues on cells 014 and 015 only.",
    items: [
      {
        risk: {
          title: "Cell-016 short re-occurs in 014 / 015",
          description: "Same batch, same cutoff. If the 016 failure was batch-level, the remaining cells are at risk.",
        },
        likelihood: "medium",
        impact: {
          tone: "bad",
          headline: "Kills this iteration",
          description: "Two more shorts → iter-7 has zero comparable cells against the iter-6 baseline; restart required.",
        },
        mitigation: "Auto-abort if Rct grows > 30 % in any 20-cycle window. Daily eyes-on inspection. Hold cell-016 replacement until separator-lot QA passes.",
      },
      {
        risk: {
          title: "4.30 V cutoff is too aggressive",
          description: "The +12 Ω Rct shift could be the upper-tail of the validated 4.20 V window — we may already be past safe.",
        },
        likelihood: "low",
        impact: {
          tone: "bad",
          headline: "Pulls the iteration result",
          description: "If we have to retreat to 4.25 V mid-cycle, the dataset is no longer apples-to-apples with iter-6.",
        },
        mitigation: "Pre-register the saturation criterion. EIS at every 20-cycle checkpoint. If shift exceeds 50 % over baseline at any point, halt and convert to a 4.25 V iteration.",
      },
      {
        risk: {
          title: "Cycling instrument scheduling slip",
          description: "Channels 1–8 booked through iter-7 close, but glovebox maintenance window (Jun 05) overlaps with cycle 40–50 critical region.",
        },
        likelihood: "medium",
        impact: {
          tone: "warn",
          headline: "Loses 2 days of data",
          description: "Gap in the Rct(cycle) curve right at the saturation inflection. Reviewers will ask about it.",
        },
        mitigation: "Coordinate with KB to extend maintenance window to a low-information segment (cycle 30 plateau). If unavoidable, document gap and interpolate.",
      },
    ],
  },
  it_8: {
    workflow: "battery_safety_risk_v1",
    runAt: "May 24 · 10:15",
    runBy: "AI draft · pending PI approval",
    flaggedForPI: false,
    summary: "Binder swap to CMC/SBR introduces aqueous processing variables. Risk is process-side, not chemistry-side. Approve before iter-8 kickoff.",
    candidate: true,
    items: [
      {
        risk: {
          title: "Aqueous slurry → Ni leaching",
          description: "Ni-rich cathode + water → possible Li/Ni dissolution during slurry-coat exposure window.",
        },
        likelihood: "medium",
        impact: {
          tone: "warn",
          headline: "Lowers novelty",
          description: "If leaching is detectable by ICP-MS, the binder claim becomes 'process-controlled', not 'binder-independent'.",
        },
        mitigation: "Time-limit aqueous slurry exposure to < 30 min before coating. ICP-MS validation after first batch.",
      },
      {
        risk: {
          title: "Coater purge between solvents incomplete",
          description: "PVDF and CMC/SBR slurries have different rheology; residual on the slot-die contaminates the next batch.",
        },
        likelihood: "low",
        impact: {
          tone: "warn",
          headline: "Lowers paper rigor",
          description: "Cross-contamination is a single-blind issue — reviewers will ask.",
        },
        mitigation: "Document purge protocol. Visually inspect die after each switch. Run a sacrificial coat between binders.",
      },
    ],
  },
  it_9: {
    workflow: "battery_safety_risk_v1",
    runAt: null,
    summary: "Scheduled when iter-7 closes.",
    items: [],
  },
};

// ──────────────────────────────────────────────────────
// Block content for the "page editor" screen
// (One sample notebook-style page: "Iteration 7 — Week 22 notes")
// ──────────────────────────────────────────────────────
const SAMPLE_BY_ID = Object.fromEntries(SAMPLES.map(s => [s.id, s]));
const EXP_BY_ID    = Object.fromEntries(EXPERIMENTS.map(e => [e.id, e]));
const ART_BY_ID    = Object.fromEntries(ARTIFACTS.map(a => [a.id, a]));

// ──────────────────────────────────────────────────────
// Inbox — surface for mentions, PI flags, action items, AI proposals
// ──────────────────────────────────────────────────────
const INBOX = [
  { id: "in_01", kind: "pi_flag",   bucket: "today",   from: "Assistant", actor:"AI", title: "Risk register item #2 escalated", subtitle: "Batch-7B separator defect — likelihood HIGH, impact KILLS the cycle-life claim. Mei was notified May 21 · 18:24.", project: "p_nmc", target: { type: "iteration", id: "it_7" }, ts: "8 min ago", unread: true },
  { id: "in_02", kind: "mention",   bucket: "today",   from: "Mei Tanaka", actor:"MT", title: "@you on Iter-7 · Week 22 cycling notes", subtitle: "Watch for the dendrite morphology, not just the voltage curve. The 016 short is a tell.", project: "p_nmc", target: { type:"page", id:"page_iter7_w22" }, ts: "2 h ago", unread: true },
  { id: "in_03", kind: "ai_proposal", bucket: "today", from: "Assistant", actor:"AI", title: "Draft revision proposed: Iter-7 risk-register row #2 update", subtitle: "Adds the separator-lot QA audit findings under mitigations. Awaiting approval (suggest_writes).", project: "p_nmc", target: { type:"iteration", id:"it_7" }, ts: "3 h ago", unread: true },
  { id: "in_04", kind: "action",    bucket: "today",   from: "Mei Tanaka", actor:"MT", title: "Action item due May 28 — DOE-BES report §3 (cycling)", subtitle: "From PI weekly · Week 22 meeting. Draft and circulate by EOD May 28.", project: "p_nmc", target: { type:"meeting", id:"mtg_2026_05_21" }, ts: "yesterday", unread: false },
  { id: "in_05", kind: "comment",   bucket: "earlier", from: "Sam Patel",  actor:"SP", title: "Comment on cell-014 post-mortem", subtitle: "Cathode particles look intact, but check the (003) intensity in the XRD from EX-200 before publishing.", project: "p_nmc", target: { type:"experiment", id:"EX-205" }, ts: "May 22", unread: false },
  { id: "in_06", kind: "ai_proposal", bucket: "earlier", from: "Assistant", actor:"AI", title: "Iter-8 risk register draft ready", subtitle: "Two items: aqueous Ni leaching (MED / Lowers novelty), coater purge (LOW / Lowers paper rigor).", project: "p_nmc", target: { type:"iteration", id:"it_8" }, ts: "May 24", unread: false },
  { id: "in_07", kind: "mention",   bucket: "earlier", from: "Hua Qin",    actor:"HQ", title: "@you on Caltech data-exchange MOU", subtitle: "Sent draft for review. Two paragraphs on data scope — please flag anything I missed.", project: null, target: { type:"page", id:"caltech_mou" }, ts: "May 21", unread: false },
  { id: "in_08", kind: "system",    bucket: "earlier", from: "Halide",     actor:"H",  title: "Calendar subscription URL was rotated", subtitle: "Your previous .ics URL was revoked. Update your Google / Apple / Outlook subscription in Settings.", project: null, target: null, ts: "May 20", unread: false },
  { id: "in_09", kind: "pi_flag",   bucket: "older",   from: "Assistant",  actor:"AI", title: "Sulfide project · risk register item #1 — PI review", subtitle: "Dry-room humidity excursion hits both likelihood HIGH and impact HIGH.", project: "p_sulf", target: { type:"project", id:"p_sulf" }, ts: "May 18", unread: false },
];

// ──────────────────────────────────────────────────────
// Workspace members — extended PEOPLE with role, status, last active
// ──────────────────────────────────────────────────────
const MEMBERS = [
  { id: "MT", name: "Dr. Mei Tanaka",  role: "owner",    title: "PI", email: "mei.tanaka@halide-lab.org", access: "Workspace owner · admin override", since: "Sep 2024", lastActive: "8 min ago", auth: "Entra SSO · entra:tanaka@halide.edu", twofa: true,  projects: ["p_nmc","p_sulf","p_af","p_sei","p_pmm"], status: "active" },
  { id: "JR", name: "Jules Reyes",     role: "admin",    title: "PhD candidate", email: "jules@halide-lab.org", access: "Workspace admin", since: "Jan 2025", lastActive: "now", auth: "Entra SSO", twofa: true,  projects: ["p_nmc","p_pmm"], status: "active" },
  { id: "SP", name: "Sam Patel",       role: "member",   title: "PhD candidate", email: "sam.patel@halide-lab.org", access: "Standard member", since: "Sep 2024", lastActive: "23 min ago", auth: "Entra SSO", twofa: false, projects: ["p_nmc","p_sulf","p_pmm"], status: "active" },
  { id: "KB", name: "Karim Bah",       role: "member",   title: "Postdoc", email: "karim.bah@halide-lab.org", access: "Standard member", since: "Mar 2024", lastActive: "1 h ago", auth: "Entra SSO", twofa: true,  projects: ["p_nmc","p_sulf","p_af"], status: "active" },
  { id: "DV", name: "Dara Vance",      role: "member",   title: "MSc candidate", email: "dara.v@halide-lab.org", access: "Standard member", since: "Sep 2025", lastActive: "yesterday", auth: "Entra SSO", twofa: false, projects: ["p_nmc"], status: "active" },
  { id: "HQ", name: "Hua Qin",         role: "external", title: "Collaborator · Caltech", email: "hua.qin@caltech.edu", access: "External · invited by MT", since: "Apr 2026", lastActive: "May 21", auth: "Local password · invited", twofa: false, projects: ["p_nmc"], status: "active" },
];

// ──────────────────────────────────────────────────────
// Pending invites (external users)
// ──────────────────────────────────────────────────────
const INVITES = [
  { id: "inv_01", email: "rae.kim@stanford.edu",     invitedBy: "MT", workspace: "Halide", project: "p_nmc",  expires: "in 3 days",  sentAt: "May 23" },
  { id: "inv_02", email: "andre.lopes@anl.gov",       invitedBy: "MT", workspace: "Halide", project: "p_sulf", expires: "in 5 days",  sentAt: "May 24" },
  { id: "inv_03", email: "j.nakamura@u-tokyo.ac.jp",  invitedBy: "JR", workspace: "Halide", project: "p_nmc",  expires: "in 6 days",  sentAt: "May 25" },
];

// ──────────────────────────────────────────────────────
// Personal Access Tokens
// ──────────────────────────────────────────────────────
const PATS = [
  { id: "pat_01", name: "Local notebooks (laptop)",       prefix: "pat_3f8a…",  scopes: ["read:projects","read:samples","read:experiments","read:pages","read:artifacts"], created: "Jan 18", lastUsed: "12 min ago", expires: "Jan 18, 2027" },
  { id: "pat_02", name: "Claude Code · MCP",              prefix: "pat_b21c…",  scopes: ["read:*","write:pages","write:samples","ai:converse"], created: "Feb 04", lastUsed: "1 h ago", expires: "never" },
  { id: "pat_03", name: "Cycling rig auto-uploader",      prefix: "pat_d094…",  scopes: ["write:artifacts","write:experiments"], created: "Apr 12", lastUsed: "5 min ago", expires: "Apr 12, 2027" },
  { id: "pat_04", name: "Old laptop · revoked",           prefix: "pat_e54f…",  scopes: ["read:projects"], created: "Mar 02", lastUsed: "Mar 24", expires: "—", revoked: true },
];

// ──────────────────────────────────────────────────────
// Audit log (recent)
// ──────────────────────────────────────────────────────
const AUDIT = [
  { ts: "May 26 · 09:42", actor: "JR",  via: "session",       action: "page.update",        resource: "Iter-7 · Week 22 notes (rev #84)", status: 200 },
  { ts: "May 26 · 09:31", actor: "AI",  via: "iai_4a2f… (JR)", action: "page.candidate.create", resource: "Iter-7 · Week 22 notes (cand #c7)", status: 201 },
  { ts: "May 26 · 08:55", actor: "JR",  via: "pat_b21c…",     action: "experiment.create",  resource: "EX-211 (cycling)",     status: 201 },
  { ts: "May 26 · 08:10", actor: "MT",  via: "session",       action: "admin.override.read", resource: "p_af / pages",        status: 200 },
  { ts: "May 25 · 22:14", actor: "AI",  via: "iai_91b3… (SP)", action: "risk.run",           resource: "p_sulf · battery_safety_risk_v1", status: 201 },
  { ts: "May 25 · 18:02", actor: "KB",  via: "session",       action: "sample.update",      resource: "NMC-7B-cathode-r3",   status: 200 },
  { ts: "May 25 · 17:40", actor: "AI",  via: "iai_91b3… (JR)", action: "page.update",        resource: "p_nmc / risk register", status: 200 },
  { ts: "May 25 · 12:30", actor: "DV",  via: "session",       action: "page.create",        resource: "Iter-8 · binder protocol",   status: 201 },
];

// ──────────────────────────────────────────────────────
// AI usage rollup
// ──────────────────────────────────────────────────────
const AI_USAGE = {
  cap: 200,
  spent: 48.12,
  pctOfCap: 24,
  daysIn: 14,
  daysLeft: 12,
  byUser: [
    { id: "JR", spent: 24.4, calls: 142 },
    { id: "SP", spent: 11.0, calls: 88 },
    { id: "MT", spent: 6.2,  calls: 41 },
    { id: "KB", spent: 4.3,  calls: 36 },
    { id: "DV", spent: 2.2,  calls: 24 },
  ],
  byFeature: [
    { k: "Chat",       v: 18.2 },
    { k: "Workflows",  v: 21.4 },
    { k: "Tool calls", v: 8.5 },
  ],
  daily: [1.1, 2.3, 1.8, 2.6, 3.4, 2.9, 4.1, 3.2, 4.5, 5.1, 4.3, 5.6, 4.8, 4.2], // last 14 days
};

window.LAB = {
  WORKSPACE, PROJECTS, ITERATIONS, SAMPLES, EXPERIMENTS, ARTIFACTS, PEOPLE, EVENTS, RISK, MEETINGS,
  INBOX, INVITES, PATS, AUDIT, AI_USAGE, MEMBERS,
  SAMPLE_BY_ID, EXP_BY_ID, ART_BY_ID,
};
