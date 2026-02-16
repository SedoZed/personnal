export const state = {
  raw: [],
  nodesAll: [],
  nodes: [],
  links: [],

  // On fixe le “mode” : keywords IA partout
  linkMode: "kwia",
  minShared: 1,
  charge: -300,

  selected: {
    kwia: new Set(),
  },

  values: {
    kwia: []
  },

  // autocomplete (keywords IA uniquement)
  themeCounts: new Map(), // themeLower -> { label, count }
};
