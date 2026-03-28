// ─── Mock what-if results ─────────────────────────────────────────────────────
// Keyed by `${nodeId}__${type}`. Falls back to a generic template.

const DETAILED_RESULTS = {
  "gene_MDM2__inhibit": {
    confidence: "high",
    known_context: [
      "MDM2 is the primary E3 ubiquitin ligase for TP53, targeting it for proteasomal degradation.",
      "Small-molecule MDM2 inhibitors (e.g. Nutlin-3a, AMG-232) block the MDM2–TP53 binding interface, stabilising TP53.",
      "MDM2 inhibition is most effective in tumours with wild-type TP53 — mutant TP53 does not respond.",
      "Haematological toxicity (neutropenia, thrombocytopenia) is the primary dose-limiting factor in clinical trials.",
    ],
    hypotheses: [
      "Stabilised TP53 is expected to transcriptionally activate **CDKN1A (p21)**, enforcing G1 cell cycle arrest.",
      "Elevated TP53 activity may upregulate **BAX** and **PUMA**, shifting the apoptotic balance toward mitochondrial cell death.",
      "TP53 itself transcribes MDM2, creating a delayed compensatory feedback that may limit the duration of TP53 activation.",
      "In ATM-proficient cells, concurrent DNA damage signals may synergise with MDM2 inhibition to amplify the TP53 response.",
    ],
    downstream_candidates: ["TP53", "CDKN1A", "BAX", "PUMA"],
    affected_nodes: [
      { id: "gene_TP53",   effect: "increase" },
      { id: "gene_CDKN1A", effect: "increase" },
      { id: "gene_BAX",    effect: "increase" },
      { id: "gene_PUMA",   effect: "increase" },
    ],
    affected_edge_ids: ["edge_MDM2_TP53", "edge_TP53_CDKN1A", "edge_TP53_BAX", "edge_TP53_PUMA"],
    existing_therapeutics: [
      { name: "Nutlin-3a",               type: "MDM2 inhibitor", status: "Preclinical" },
      { name: "AMG-232 (Navtemadlin)",    type: "MDM2 inhibitor", status: "Phase II/III" },
      { name: "RG7112",                   type: "MDM2 inhibitor", status: "Phase I completed" },
      { name: "Idasanutlin",              type: "MDM2 inhibitor", status: "Phase III (AML)" },
    ],
    uncertainty_notes: [
      "Effect magnitude is highly dependent on TP53 mutation status — verify before applying.",
      "MDMX (MDM4), a related E3 ligase, may partially compensate for MDM2 loss.",
    ],
  },

  "gene_TP53__downregulate": {
    confidence: "high",
    known_context: [
      "TP53 loss is one of the most frequent events in human cancer (~50% of all tumours).",
      "Reduced TP53 activity impairs DNA damage checkpoints, allowing damaged cells to continue proliferating.",
      "TP53 deficiency is associated with resistance to many genotoxic chemotherapies that rely on p53-mediated apoptosis.",
    ],
    hypotheses: [
      "Reduced TP53 transcriptional output is expected to lower **CDKN1A (p21)** levels, releasing CDK-mediated G1 arrest.",
      "**BAX** and **PUMA** expression may fall, shifting the BCL-2 family balance toward survival.",
      "**MDM2** levels may decrease as a consequence, since MDM2 is itself a TP53 transcriptional target.",
      "Cells may become more dependent on alternative survival pathways (PI3K/AKT, RAS/MAPK).",
    ],
    downstream_candidates: ["CDKN1A", "BAX", "PUMA", "MDM2"],
    affected_nodes: [
      { id: "gene_MDM2",   effect: "decrease" },
      { id: "gene_CDKN1A", effect: "decrease" },
      { id: "gene_BAX",    effect: "decrease" },
      { id: "gene_PUMA",   effect: "decrease" },
    ],
    affected_edge_ids: ["edge_TP53_MDM2", "edge_TP53_CDKN1A", "edge_TP53_BAX", "edge_TP53_PUMA"],
    existing_therapeutics: [],
    uncertainty_notes: [
      "Context-dependent: some tumours with partial TP53 loss retain residual activity.",
      "Gain-of-function TP53 mutations behave differently from simple loss — distinguish carefully.",
    ],
  },

  "gene_ATM__inhibit": {
    confidence: "medium",
    known_context: [
      "ATM kinase is the master sensor of DNA double-strand breaks (DSBs). Inhibition abolishes the DSB checkpoint.",
      "ATM inhibitors (e.g. AZD0156, M3814) are in clinical development primarily as radio/chemosensitisers.",
      "ATM loss alone is generally tolerated but creates dependency on alternative DNA repair pathways.",
    ],
    hypotheses: [
      "Without ATM-mediated phosphorylation at Ser15, **TP53** stabilisation in response to DNA damage will be impaired.",
      "**MDM2** phosphorylation by ATM (which normally stabilises TP53 by reducing MDM2 activity) will also be lost.",
      "**BRCA1** activation following DSBs will be attenuated, potentially compromising homologous recombination repair.",
      "Cells may become highly sensitive to DSB-inducing agents (ionising radiation, PARP inhibitors, platinum drugs).",
    ],
    downstream_candidates: ["TP53", "MDM2", "BRCA1"],
    affected_nodes: [
      { id: "gene_TP53",   effect: "decrease" },
      { id: "gene_MDM2",   effect: "decrease" },
      { id: "gene_BRCA1",  effect: "decrease" },
    ],
    affected_edge_ids: ["edge_ATM_TP53", "edge_ATM_MDM2", "edge_ATM_BRCA1"],
    existing_therapeutics: [
      { name: "AZD0156", type: "ATM inhibitor", status: "Phase I" },
      { name: "M3814 (Peposertib)", type: "DNA-PKcs inhibitor (related)", status: "Phase II" },
    ],
    uncertainty_notes: [
      "Tumour ATM status strongly predicts response — ATM-deficient tumours may not respond to inhibition.",
      "Combination with DSB-inducing agents is more studied than ATM inhibition alone.",
    ],
  },
};

// Generic fallback for any node/type combination not covered above
function buildGenericResult(nodeLabel, type) {
  const isInhibit     = type === "inhibit"      || type === "downregulate";
  const actionWord    = { inhibit: "inhibition", activate: "activation", downregulate: "downregulation", upregulate: "upregulation" }[type];
  const effectWord    = isInhibit ? "reduced" : "increased";
  const confidence    = "low";

  return {
    confidence,
    known_context: [
      `${nodeLabel} ${actionWord} is not yet specifically modelled — the following is based on general pathway reasoning.`,
      `Direct ${actionWord} of ${nodeLabel} would be expected to alter the activity of its immediate interaction partners.`,
    ],
    hypotheses: [
      `Downstream partners that ${nodeLabel} **activates** would show ${isInhibit ? "reduced" : "increased"} activity.`,
      `Downstream partners that ${nodeLabel} **inhibits** would show ${isInhibit ? "increased" : "reduced"} activity.`,
      `Compensatory feedback loops may partially buffer the effect over time.`,
    ],
    downstream_candidates: [],
    affected_nodes: [],
    affected_edge_ids: [],
    existing_therapeutics: [],
    uncertainty_notes: [
      "No curated result for this perturbation — treat this as a starting hypothesis only.",
      "Run the full what-if agent with backend connected for evidence-backed analysis.",
    ],
  };
}

export function getMockWhatIfResult(nodeId, nodeLabel, type) {
  const key = `${nodeId}__${type}`;
  return DETAILED_RESULTS[key] ?? buildGenericResult(nodeLabel, type);
}

// ─── Streaming helper ─────────────────────────────────────────────────────────
/**
 * simulateSSEStream — typewriter animation helper.
 * Feeds text word-by-word with a small delay. Used to animate summaries
 * that arrive as a complete string rather than a live stream.
 * Returns a stop() function.
 */
export function simulateSSEStream(text, onChunk, onDone, delayMs = 30) {
  const words = text.split(" ");
  let i = 0;
  let stopped = false;

  function tick() {
    if (stopped || i >= words.length) {
      if (!stopped) onDone?.();
      return;
    }
    onChunk(words[i] + (i < words.length - 1 ? " " : ""));
    i++;
    setTimeout(tick, delayMs);
  }

  setTimeout(tick, 0);
  return () => {
    stopped = true;
  };
}
