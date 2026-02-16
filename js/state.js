export const state = {
  raw: [],
  nodesAll: [],
  nodes: [],
  links: [],
  linkMode: "erc",     // erc | hceres | keywords
  minShared: 1,
  charge: -260,
  selected: {
    erc: new Set(),
    hceres: new Set(),
    keywords: new Set(),
  },
  values: {
    erc: [],
    hceres: [],
    keywords: []
  }
};
