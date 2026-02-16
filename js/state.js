export const state = {
  raw: [],
  nodesAll: [],
  nodes: [],
  links: [],
  linkMode: "erc",
  minShared: 1,
  charge: -180,
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
