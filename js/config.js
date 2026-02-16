export const CSV_PATH = "./database-test.csv";

export const COLS = {
  title: "dcterms:title",
  alt: "dcterms:alternative",
  id: "valo:idRNSR",
  axe: "valo:hasAxe",

  // On conserve éventuellement les anciens champs si tu veux les afficher plus tard,
  // mais la dataviz + recherche utilisent désormais uniquement keywords-ia.
  hceres: "valo:domaineHceres",
  erc: "valo:domaineErc",
  keywords: "valo:keywords",

  keywordsIA: "valo:keywords-ia",

  email: "foaf:mbox"
};
