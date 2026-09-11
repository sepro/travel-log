// Overseas territories that the world-atlas data lumps into their parent country.
// Without this, colouring France also colours French Guiana, Guadeloupe and friends,
// which is not what a travel log means by "visited France".
//
// Every entry is split off into its own country feature at load time, so it can be
// hovered, clicked and listed separately in countries.js.
//
// id:     numeric ISO 3166 code of the territory itself.
// parent: numeric ISO 3166 code of the country it is stored under in the map data.
// bounds: [[west, south], [east, north]] box used to recognise the territory's
//         polygons. Generous is fine, it only has to exclude the parent's other parts.
const OVERSEAS_TERRITORIES = [
  { id: "254", parent: "250", name: "French Guiana", bounds: [[-55, 1], [-51, 7]] },
  { id: "312", parent: "250", name: "Guadeloupe", bounds: [[-62, 15.7], [-61, 16.6]] },
  { id: "474", parent: "250", name: "Martinique", bounds: [[-61.4, 14.2], [-60.7, 15]] },
  { id: "638", parent: "250", name: "Réunion", bounds: [[55, -21.6], [56, -20.7]] },
  { id: "175", parent: "250", name: "Mayotte", bounds: [[44.8, -13.2], [45.4, -12.5]] },
  // Bonaire, Saba and Sint Eustatius: the Dutch Caribbean municipalities
  { id: "535", parent: "528", name: "Caribbean Netherlands", bounds: [[-69, 11.8], [-62.5, 17.8]] },
];
