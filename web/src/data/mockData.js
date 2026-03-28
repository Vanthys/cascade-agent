export const MOCK_GRAPH = {
  nodes: [
    {
      id: "gene_TP53",
      type: "gene",
      label: "TP53",
      meta: {
        aliases: ["P53", "BCC7"],
        organism: "human",
        summary:
          "TP53 (Tumor Protein P53) is one of the most studied tumor suppressor genes in cancer biology. It encodes a transcription factor that responds to cellular stress signals — including DNA damage, oncogene activation, and hypoxia — by inducing cell cycle arrest, DNA repair, or apoptosis. TP53 is mutated in approximately 50% of all human cancers, making it a central target in oncology research. It acts as a guardian of the genome, preventing proliferation of cells with damaged DNA.",
        pathways: ["DNA damage response", "Apoptosis", "Cell cycle regulation"],
        disease_relevance: "Mutated in ~50% of all cancers. Li-Fraumeni syndrome.",
      },
    },
    {
      id: "gene_MDM2",
      type: "gene",
      label: "MDM2",
      meta: {
        aliases: ["HDM2"],
        organism: "human",
        summary:
          "MDM2 (Mouse Double Minute 2) is the primary negative regulator of TP53. It binds directly to the TP53 transactivation domain, inhibiting its transcriptional activity and promoting its proteasomal degradation via E3 ubiquitin ligase activity. MDM2 is itself a transcriptional target of TP53, forming a negative feedback loop that tightly controls TP53 protein levels under normal conditions.",
        pathways: ["TP53 regulation", "Ubiquitin-mediated proteolysis"],
        disease_relevance: "Amplified in sarcomas and other cancers. MDM2 inhibitors (e.g. Nutlins) are in clinical trials.",
      },
    },
    {
      id: "gene_CDKN1A",
      type: "gene",
      label: "CDKN1A",
      meta: {
        aliases: ["p21", "CIP1", "WAF1"],
        organism: "human",
        summary:
          "CDKN1A encodes the cyclin-dependent kinase inhibitor p21, a key effector of TP53-mediated cell cycle arrest. Upon DNA damage, TP53 transcriptionally activates CDKN1A, leading to inhibition of CDK2 and CDK4/6 complexes and consequent G1/S arrest. p21 also has roles in DNA repair, differentiation, and apoptosis suppression in certain contexts.",
        pathways: ["Cell cycle arrest", "DNA damage response", "Senescence"],
        disease_relevance: "Reduced expression in many cancers. Associated with resistance to chemotherapy.",
      },
    },
    {
      id: "gene_BAX",
      type: "gene",
      label: "BAX",
      meta: {
        aliases: ["BCL2L4"],
        organism: "human",
        summary:
          "BAX (BCL2-Associated X Protein) is a pro-apoptotic member of the BCL-2 family. It is a direct transcriptional target of TP53 and promotes mitochondrial outer membrane permeabilization (MOMP), leading to cytochrome c release and caspase activation. The balance between BAX and anti-apoptotic BCL-2 family members determines whether a cell undergoes apoptosis in response to stress.",
        pathways: ["Intrinsic apoptosis", "Mitochondrial pathway", "TP53 signaling"],
        disease_relevance: "Downregulated in many cancers. Mutations in colorectal cancers.",
      },
    },
    {
      id: "gene_PUMA",
      type: "gene",
      label: "PUMA",
      meta: {
        aliases: ["BBC3"],
        organism: "human",
        summary:
          "PUMA (p53-upregulated modulator of apoptosis) is a BH3-only BCL-2 family member and a critical mediator of TP53-dependent apoptosis. PUMA binds and neutralizes anti-apoptotic BCL-2 proteins, freeing BAX and BAK to initiate MOMP. It is considered one of the most potent pro-apoptotic proteins downstream of TP53.",
        pathways: ["Intrinsic apoptosis", "TP53 signaling"],
        disease_relevance: "Loss of PUMA contributes to chemotherapy resistance in lymphomas and colorectal cancers.",
      },
    },
    {
      id: "gene_ATM",
      type: "gene",
      label: "ATM",
      meta: {
        aliases: ["TEL1", "ATAXIA"],
        organism: "human",
        summary:
          "ATM (Ataxia Telangiectasia Mutated) is a serine/threonine kinase that acts as a master regulator of the DNA double-strand break (DSB) response. Upon DSB detection, ATM phosphorylates numerous substrates including TP53 (at Ser15), MDM2, BRCA1, and H2AX, activating the DNA damage checkpoint cascade. ATM is upstream of TP53 and essential for TP53 stabilization and activation.",
        pathways: ["DNA damage response", "DSB repair", "Cell cycle checkpoint"],
        disease_relevance: "Germline mutations cause Ataxia-Telangiectasia. Somatic mutations in lymphoid malignancies.",
      },
    },
    {
      id: "gene_BRCA1",
      type: "gene",
      label: "BRCA1",
      meta: {
        aliases: ["BRCA1/BRCA2-containing complex"],
        organism: "human",
        summary:
          "BRCA1 is a tumor suppressor involved in DNA damage repair, particularly homologous recombination (HR). It functions in the same DNA damage response pathway as ATM and TP53. BRCA1 is phosphorylated by ATM upon DNA damage and interacts with several repair factors. It also participates in transcriptional regulation and chromatin remodeling.",
        pathways: ["Homologous recombination", "DNA damage response", "Cell cycle checkpoint"],
        disease_relevance: "Germline mutations cause hereditary breast and ovarian cancer (HBOC).",
      },
    },
  ],
  edges: [
    {
      id: "edge_TP53_MDM2",
      source: "gene_TP53",
      target: "gene_MDM2",
      relation: "activates",
      direction: "directed",
      confidence: 0.97,
      evidence_count: 12,
      evidence_summary:
        "TP53 directly transcribes MDM2 as part of a negative autoregulatory feedback loop. Elevated TP53 activity leads to MDM2 upregulation, which in turn degrades TP53 via ubiquitination.",
    },
    {
      id: "edge_MDM2_TP53",
      source: "gene_MDM2",
      target: "gene_TP53",
      relation: "inhibits",
      direction: "directed",
      confidence: 0.97,
      evidence_count: 15,
      evidence_summary:
        "MDM2 binds the N-terminal transactivation domain of TP53, blocking its transcriptional activity and targeting it for proteasomal degradation via E3 ubiquitin ligase activity.",
    },
    {
      id: "edge_TP53_CDKN1A",
      source: "gene_TP53",
      target: "gene_CDKN1A",
      relation: "activates",
      direction: "directed",
      confidence: 0.95,
      evidence_count: 20,
      evidence_summary:
        "CDKN1A (p21) is a canonical transcriptional target of TP53. TP53 binds p53 response elements in the CDKN1A promoter and drives its expression in response to DNA damage, leading to CDK inhibition and G1 arrest.",
    },
    {
      id: "edge_TP53_BAX",
      source: "gene_TP53",
      target: "gene_BAX",
      relation: "activates",
      direction: "directed",
      confidence: 0.91,
      evidence_count: 8,
      evidence_summary:
        "TP53 transcriptionally activates BAX expression. BAX promoter contains TP53 response elements. Induction of BAX by TP53 promotes cytochrome c release and apoptotic cell death.",
    },
    {
      id: "edge_TP53_PUMA",
      source: "gene_TP53",
      target: "gene_PUMA",
      relation: "activates",
      direction: "directed",
      confidence: 0.93,
      evidence_count: 9,
      evidence_summary:
        "PUMA is a direct transcriptional target of TP53. Upon genotoxic stress, TP53 binds p53 response elements in the PUMA promoter and induces its expression, triggering mitochondrial apoptosis.",
    },
    {
      id: "edge_ATM_TP53",
      source: "gene_ATM",
      target: "gene_TP53",
      relation: "activates",
      direction: "directed",
      confidence: 0.94,
      evidence_count: 11,
      evidence_summary:
        "ATM phosphorylates TP53 at Ser15 in response to DNA double-strand breaks, stabilizing TP53 by reducing MDM2 binding affinity and activating its transcriptional program.",
    },
    {
      id: "edge_ATM_MDM2",
      source: "gene_ATM",
      target: "gene_MDM2",
      relation: "inhibits",
      direction: "directed",
      confidence: 0.82,
      evidence_count: 6,
      evidence_summary:
        "ATM phosphorylates MDM2 at multiple sites, reducing its ability to ubiquitinate and degrade TP53, thereby amplifying the TP53 response to DNA damage.",
    },
    {
      id: "edge_ATM_BRCA1",
      source: "gene_ATM",
      target: "gene_BRCA1",
      relation: "activates",
      direction: "directed",
      confidence: 0.88,
      evidence_count: 7,
      evidence_summary:
        "ATM phosphorylates BRCA1 at Ser1387 and Ser1524 following DNA double-strand breaks, activating BRCA1's role in homologous recombination repair.",
    },
  ],
};

export const SEED_SUMMARY =
  "TP53 is a central tumor suppressor that functions as a transcription factor activated by cellular stress. Upon DNA damage, ATM kinase stabilizes and activates TP53 by phosphorylating it at Ser15 — simultaneously disabling its negative regulator MDM2. Active TP53 then drives transcription of downstream targets: CDKN1A (p21) enforces cell cycle arrest, while BAX and PUMA initiate the mitochondrial apoptosis pathway. MDM2 is itself a TP53 target, forming a critical negative feedback loop that dampens TP53 activity once damage is resolved. This network is disrupted in approximately 50% of all human cancers.";

// Simulates streaming text word by word
export function simulateSSEStream(text, onChunk, onComplete, delayMs = 40) {
  const words = text.split(" ");
  let i = 0;
  const interval = setInterval(() => {
    if (i < words.length) {
      onChunk(words[i] + (i < words.length - 1 ? " " : ""));
      i++;
    } else {
      clearInterval(interval);
      onComplete?.();
    }
  }, delayMs);
  return () => clearInterval(interval);
}
