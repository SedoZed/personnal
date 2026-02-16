export const state = {
  raw: [],
  nodesAll: [],
  nodes: [],
  links: [],

  // plus de linkMode : source unique = keywords-ia
  minShared: 1,
  charge: -300,

  // filtre unique : keywords-ia
  selected: {
    keywords: new Set(),
  },

  values: {
    keywords: []
  },

  // autocomplete uniquement sur keywords-ia
  themeCounts: new Map(), // themeLower -> { label, count }
};
