// Your travel log. This is the only file you need to edit.
//
// id:        numeric ISO 3166 code as used by the world-atlas map data.
//            Tip: hover any country on the site, the status line shows its id.
// name:      only here so this file stays readable, the map uses its own names.
// continent: one of the keys in CONTINENT_SIZES (app.js), used for the stats.
// status:    "lived", "visited" or "transit". List each country once, using
//            the strongest status (lived beats visited beats transit).

const TRAVEL_LOG = [
  // Lived
  { id: "056", name: "Belgium", continent: "Europe", status: "lived" },
  { id: "276", name: "Germany", continent: "Europe", status: "lived" },

  // Visited: Europe
  { id: "040", name: "Austria", continent: "Europe", status: "visited" },
  { id: "191", name: "Croatia", continent: "Europe", status: "visited" },
  { id: "203", name: "Czechia", continent: "Europe", status: "visited" },
  { id: "208", name: "Denmark", continent: "Europe", status: "visited" },
  { id: "250", name: "France", continent: "Europe", status: "visited" },
  { id: "300", name: "Greece", continent: "Europe", status: "visited" },
  { id: "380", name: "Italy", continent: "Europe", status: "visited" },
  { id: "442", name: "Luxembourg", continent: "Europe", status: "visited" },
  { id: "528", name: "Netherlands", continent: "Europe", status: "visited" },
  { id: "616", name: "Poland", continent: "Europe", status: "visited" },
  { id: "620", name: "Portugal", continent: "Europe", status: "visited" },
  { id: "642", name: "Romania", continent: "Europe", status: "visited" },
  { id: "703", name: "Slovakia", continent: "Europe", status: "visited" },
  { id: "724", name: "Spain", continent: "Europe", status: "visited" },
  { id: "756", name: "Switzerland", continent: "Europe", status: "visited" },
  { id: "826", name: "United Kingdom", continent: "Europe", status: "visited" },
  { id: "352", name: "Iceland", continent: "Europe", status: "visited" },
  { id: "112", name: "Belarus", continent: "Europe", status: "visited" },
  { id: "499", name: "Montenegro", continent: "Europe", status: "visited" },

  // Visited: Africa
  { id: "504", name: "Morocco", continent: "Africa", status: "visited" },
  { id: "788", name: "Tunisia", continent: "Africa", status: "visited" },

  // Visited: Asia
  { id: "764", name: "Thailand", continent: "Asia", status: "visited" },
  { id: "524", name: "Nepal", continent: "Asia", status: "visited" },
  { id: "418", name: "Laos", continent: "Asia", status: "visited" },
  { id: "702", name: "Singapore", continent: "Asia", status: "visited" },
  { id: "116", name: "Cambodia", continent: "Asia", status: "visited" },
  { id: "458", name: "Malaysia", continent: "Asia", status: "visited" },
  // Turkey and Georgia count as Asia in the UN grouping the continent totals are based on
  { id: "792", name: "Turkey", continent: "Asia", status: "visited" },
  { id: "268", name: "Georgia", continent: "Asia", status: "visited" },

  // Transit
  { id: "348", name: "Hungary", continent: "Europe", status: "transit" },
  { id: "144", name: "Sri Lanka", continent: "Asia", status: "transit" },
  { id: "634", name: "Qatar", continent: "Asia", status: "transit" },
  { id: "784", name: "United Arab Emirates", continent: "Asia", status: "transit" },
];
