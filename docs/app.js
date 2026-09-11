// travel.log: interactive globe, regional map and stats, driven by TRAVEL_LOG in countries.js.

const STATUS_LABELS = { lived: "lived", visited: "visited", transit: "transit" };

// Number of sovereign states per continent (193 UN members + 2 observers = 195).
// These are the denominators for the percentages; boundaries between continents
// are debatable, so treat the numbers as a rough yardstick rather than truth.
const CONTINENT_SIZES = {
  "Europe": 44,
  "Asia": 48,
  "Africa": 54,
  "North America": 23,
  "South America": 12,
  "Oceania": 14,
};
const WORLD_COUNTRY_COUNT = 195;

// Bounds are [[west, south], [east, north]] in degrees.
const REGION_PRESETS = [
  { name: "europe",   bounds: [[-12, 34], [40, 71]] },
  { name: "africa",   bounds: [[-20, -36], [55, 38]] },
  { name: "mid-east", bounds: [[25, 12], [62, 44]] },
  { name: "asia",     bounds: [[25, -10], [150, 60]] },
  { name: "se-asia",  bounds: [[90, -11], [130, 29]] },
  { name: "s-asia",   bounds: [[60, 5], [98, 37]] },
  { name: "americas", bounds: [[-170, -56], [-30, 72]] },
  { name: "oceania",  bounds: [[110, -48], [180, 0]] },
];
const DEFAULT_PRESET = REGION_PRESETS[0];

// The regional map starts fitted to its region, so pinching out below 1 is what
// lets you pull back far enough to see the neighbouring continents.
const MIN_MAP_ZOOM = 0.2;

// Globe motion, all in degrees per second.
const IDLE_SPIN_DEGREES_PER_SECOND = 5;
const MAX_FLICK_DEGREES_PER_SECOND = 240;
// Time constant of the slowdown: after a flick the globe is back to a lazy
// drift within a couple of seconds.
const MOMENTUM_DECAY_SECONDS = 0.8;

const travelStatusById = new Map(TRAVEL_LOG.map((entry) => [entry.id, entry.status]));

// ---------- small helpers ----------

function countryClassName(countryId) {
  const status = travelStatusById.get(countryId);
  return status ? `country ${status}` : "country";
}

function describeCountry(feature) {
  const name = feature.properties.name ?? "unknown";
  const status = travelStatusById.get(feature.id);
  const statusText = status ? STATUS_LABELS[status] : "not yet";
  const idText = feature.id ? ` #${feature.id}` : "";
  return `> ${name.toLowerCase()}${idText} :: ${statusText}`;
}

// France, Norway, the US and friends include far-flung territories. Using only the
// biggest landmass keeps a click on France from zooming out to the Caribbean.
function largestLandmass(feature) {
  if (feature.geometry.type !== "MultiPolygon") return feature;

  const polygons = feature.geometry.coordinates.map((coordinates) => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates },
  }));
  return polygons.reduce((largest, candidate) =>
    d3.geoArea(candidate) > d3.geoArea(largest) ? candidate : largest
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function boundsAroundCountry(feature) {
  let [[west, south], [east, north]] = d3.geoBounds(largestLandmass(feature));
  if (east < west) east += 360; // the country straddles the antimeridian

  // Small countries get a minimum window so their neighbours give context
  const lonSpan = Math.max(east - west, 10);
  const latSpan = Math.max(north - south, 7);
  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const contextFactor = 0.9;

  return [
    [centerLon - lonSpan * contextFactor, clamp(centerLat - latSpan * contextFactor, -80, 80)],
    [centerLon + lonSpan * contextFactor, clamp(centerLat + latSpan * contextFactor, -80, 80)],
  ];
}

function boundsCenter([[west, south], [east, north]]) {
  if (east < west) east += 360;
  return [(west + east) / 2, (south + north) / 2];
}

// Rotating from 170° to -170° should take the short way round, not spin 340°
function shortestLongitudeTarget(fromLongitude, toLongitude) {
  const difference = (((toLongitude - fromLongitude) % 360) + 540) % 360 - 180;
  return fromLongitude + difference;
}

function asciiBar(fraction, width) {
  const filledCells = Math.round(clamp(fraction, 0, 1) * width);
  return "█".repeat(filledCells) + "░".repeat(width - filledCells);
}

function percent(part, whole) {
  return `${Math.round((part / whole) * 100)}%`.padStart(4);
}

function watchSize(element, onResize) {
  new ResizeObserver(() => onResize(element.getBoundingClientRect())).observe(element);
}

// ---------- overseas territories ----------

function isInsideBounds([longitude, latitude], [[west, south], [east, north]]) {
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function polygonFeature(coordinates) {
  return { type: "Feature", geometry: { type: "Polygon", coordinates } };
}

// Groups a country's polygons per territory, so France keeps only its European
// parts and French Guiana becomes a country feature of its own.
function splitOffTerritories(feature) {
  const territories = OVERSEAS_TERRITORIES.filter((territory) => territory.parent === feature.id);
  if (territories.length === 0 || feature.geometry.type !== "MultiPolygon") return [feature];

  const polygonsByOwner = new Map();
  for (const coordinates of feature.geometry.coordinates) {
    const center = d3.geoCentroid(polygonFeature(coordinates));
    const territory = territories.find((candidate) => isInsideBounds(center, candidate.bounds));
    const owner = territory ?? feature;
    if (!polygonsByOwner.has(owner)) polygonsByOwner.set(owner, []);
    polygonsByOwner.get(owner).push(coordinates);
  }

  return [...polygonsByOwner].map(([owner, coordinates]) => ({
    type: "Feature",
    id: owner.id,
    properties: { name: owner === feature ? feature.properties.name : owner.name },
    geometry: { type: "MultiPolygon", coordinates },
  }));
}

function withSeparateTerritories(features) {
  return features.flatMap(splitOffTerritories);
}

// ---------- globe ----------

function createGlobe(container, countries, { onCountryClick, onHover }) {
  const svg = d3.select(container).append("svg");
  const projection = d3.geoOrthographic().rotate([-10, -35]); // start facing Europe
  const pathGenerator = d3.geoPath(projection);
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const spherePath = svg.append("path").datum({ type: "Sphere" }).attr("class", "sphere");
  const graticulePath = svg.append("path").datum(d3.geoGraticule10()).attr("class", "graticule");
  const countryPaths = svg.append("g")
    .selectAll("path")
    .data(countries)
    .join("path")
    .attr("class", (feature) => countryClassName(feature.id))
    .on("pointerenter", (event, feature) => onHover(feature))
    .on("pointerleave", () => onHover(null))
    .on("click", (event, feature) => onCountryClick(feature));

  function render() {
    spherePath.attr("d", pathGenerator);
    graticulePath.attr("d", pathGenerator);
    countryPaths.attr("d", pathGenerator);
  }

  // The globe always drifts: after a flick it keeps the speed you gave it and
  // slows down to the idle drift rather than to a standstill.
  let longitudeSpeed = IDLE_SPIN_DEGREES_PER_SECOND; // degrees per second, sign is the direction
  let latitudeSpeed = 0;
  let spinTimer = null;
  let lastFrameTime = 0;

  function minimumSpeedInCurrentDirection() {
    const direction = longitudeSpeed < 0 ? -1 : 1;
    return IDLE_SPIN_DEGREES_PER_SECOND * direction;
  }

  function decayTowards(speed, target, elapsedSeconds) {
    const remaining = Math.exp(-elapsedSeconds / MOMENTUM_DECAY_SECONDS);
    return target + (speed - target) * remaining;
  }

  function startSpinning() {
    if (prefersReducedMotion || spinTimer) return;
    lastFrameTime = 0;
    spinTimer = d3.timer((elapsed) => {
      const elapsedSeconds = (elapsed - lastFrameTime) / 1000;
      lastFrameTime = elapsed;

      longitudeSpeed = decayTowards(longitudeSpeed, minimumSpeedInCurrentDirection(), elapsedSeconds);
      latitudeSpeed = decayTowards(latitudeSpeed, 0, elapsedSeconds);

      const [longitude, latitude] = projection.rotate();
      projection.rotate([
        longitude + longitudeSpeed * elapsedSeconds,
        clamp(latitude + latitudeSpeed * elapsedSeconds, -85, 85),
      ]);
      render();
    });
  }

  function stopSpinning() {
    spinTimer?.stop();
    spinTimer = null;
  }

  svg.call(
    d3.drag()
      .on("start", () => {
        stopSpinning();
        lastDragTime = 0; // so the first move of this drag is not read as a flick
      })
      .on("drag", (event) => {
        const [longitude, latitude] = projection.rotate();
        // Scale drag speed by globe size so a small globe doesn't spin wildly
        const degreesPerPixel = 75 / projection.scale();
        const longitudeChange = event.dx * degreesPerPixel;
        const latitudeChange = -event.dy * degreesPerPixel;

        projection.rotate([longitude + longitudeChange, clamp(latitude + latitudeChange, -85, 85)]);
        render();
        rememberFlickSpeed(longitudeChange, latitudeChange);
      })
      .on("end", startSpinning)
  );

  // The drag event has no velocity of its own, so measure how fast the pointer
  // moved between the last two drag events and cap it to keep the flick sane.
  let lastDragTime = 0;
  function rememberFlickSpeed(longitudeChange, latitudeChange) {
    const now = performance.now();
    const elapsedSeconds = (now - lastDragTime) / 1000;
    lastDragTime = now;
    // On the first move of a drag, or after the pointer paused mid drag, there is
    // no flick to carry over: let go and the globe just resumes its idle drift.
    if (elapsedSeconds <= 0 || elapsedSeconds > 0.1) {
      longitudeSpeed = minimumSpeedInCurrentDirection();
      latitudeSpeed = 0;
      return;
    }

    longitudeSpeed = clamp(longitudeChange / elapsedSeconds, -MAX_FLICK_DEGREES_PER_SECOND, MAX_FLICK_DEGREES_PER_SECOND);
    latitudeSpeed = clamp(latitudeChange / elapsedSeconds, -MAX_FLICK_DEGREES_PER_SECOND, MAX_FLICK_DEGREES_PER_SECOND);
  }

  // Picking a country or region parks the globe on it: the drift only comes back
  // once the visitor spins it themselves.
  function rotateTo([longitude, latitude]) {
    stopSpinning();
    const [currentLongitude, currentLatitude] = projection.rotate();
    const targetLongitude = shortestLongitudeTarget(currentLongitude, -longitude);
    const interpolateRotation = d3.interpolate(
      [currentLongitude, currentLatitude],
      [targetLongitude, -latitude]
    );

    svg.transition()
      .duration(prefersReducedMotion ? 0 : 900)
      .tween("rotate", () => (t) => {
        projection.rotate(interpolateRotation(t));
        render();
      });
  }

  function markSelected(countryId) {
    countryPaths.classed("selected", (feature) => feature.id === countryId);
  }

  watchSize(container, ({ width, height }) => {
    const padding = 8;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    projection.fitExtent([[padding, padding], [width - padding, height - padding]], { type: "Sphere" });
    render();
  });

  startSpinning();
  return { rotateTo, markSelected };
}

// ---------- regional map ----------

function createRegionMap(container, countries, { onHover, onCountryClick }) {
  const svg = d3.select(container).append("svg");
  const zoomLayer = svg.append("g");
  const projection = d3.geoMercator();
  const pathGenerator = d3.geoPath(projection);

  const countryPaths = zoomLayer.append("g")
    .selectAll("path")
    .data(countries)
    .join("path")
    .attr("class", (feature) => countryClassName(feature.id))
    .on("pointerenter", (event, feature) => onHover(feature))
    .on("pointerleave", () => onHover(null))
    .on("click", (event, feature) => onCountryClick(feature));

  const zoom = d3.zoom()
    .scaleExtent([MIN_MAP_ZOOM, 16])
    .on("zoom", (event) => zoomLayer.attr("transform", event.transform));
  svg.call(zoom);

  let viewSize = { width: 0, height: 0 };
  let currentView = { bounds: DEFAULT_PRESET.bounds, selectedId: null };

  function draw() {
    const { width, height } = viewSize;
    if (width === 0 || height === 0) return;

    const [[west, south], [east, north]] = currentView.bounds;
    const [centerLongitude] = boundsCenter(currentView.bounds);
    const padding = 12;

    // Rotating the projection to the view's centre keeps regions that cross
    // the antimeridian (Fiji, eastern Russia, Alaska) in one piece
    projection.rotate([-centerLongitude, 0]).fitExtent(
      [[padding, padding], [width - padding, height - padding]],
      { type: "MultiPoint", coordinates: [[west, south], [east, north], [west, north], [east, south]] }
    );

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    countryPaths
      .attr("d", pathGenerator)
      .classed("selected", (feature) => feature.id === currentView.selectedId);
    svg.call(zoom.transform, d3.zoomIdentity);
  }

  function showBounds(bounds, selectedId = null) {
    currentView = { bounds, selectedId };
    draw();
  }

  watchSize(container, ({ width, height }) => {
    viewSize = { width, height };
    draw();
  });

  return { showBounds };
}

// ---------- stats ----------

function renderSummary(element) {
  const countByStatus = d3.rollup(TRAVEL_LOG, (entries) => entries.length, (entry) => entry.status);
  const lived = countByStatus.get("lived") ?? 0;
  const visited = countByStatus.get("visited") ?? 0;
  const transit = countByStatus.get("transit") ?? 0;
  // Lived countries were obviously also visited; transit doesn't count as having been there
  const beenThere = lived + visited;

  element.textContent = [
    `lived in      ${String(lived).padStart(3)}`,
    `visited       ${String(visited).padStart(3)}`,
    `transit only  ${String(transit).padStart(3)}`,
    ``,
    `world ${asciiBar(beenThere / WORLD_COUNTRY_COUNT, 14)}${percent(beenThere, WORLD_COUNTRY_COUNT)}`,
    `      ${beenThere}/${WORLD_COUNTRY_COUNT} countries`,
  ].join("\n");
}

function renderContinentBreakdown(element) {
  const visitedByContinent = d3.rollup(
    TRAVEL_LOG.filter((entry) => entry.status !== "transit"),
    (entries) => entries.length,
    (entry) => entry.continent
  );

  const nameWidth = Math.max(...Object.keys(CONTINENT_SIZES).map((name) => name.length));
  const rows = Object.entries(CONTINENT_SIZES).map(([continent, total]) => {
    const visited = visitedByContinent.get(continent) ?? 0;
    const label = continent.toLowerCase().padEnd(nameWidth);
    return `${label} ${asciiBar(visited / total, 8)} ${visited}/${total}`;
  });

  element.textContent = [...rows, "", "transit stops not counted"].join("\n");
}

// ---------- wiring ----------

async function loadCountryShapes() {
  // Coarse shapes keep the globe smooth while spinning; the regional map
  // needs the detailed set so small countries like Singapore and Malta exist
  const [coarseWorld, detailedWorld] = await Promise.all([
    d3.json("data/countries-110m.json"),
    d3.json("data/countries-50m.json"),
  ]);
  return {
    globeCountries: withSeparateTerritories(topojson.feature(coarseWorld, coarseWorld.objects.countries).features),
    mapCountries: withSeparateTerritories(topojson.feature(detailedWorld, detailedWorld.objects.countries).features),
  };
}

function buildPresetButtons(container, onSelect) {
  const buttons = REGION_PRESETS.map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.name;
    button.addEventListener("click", () => onSelect(preset));
    container.append(button);
    return { preset, button };
  });

  return function markActivePreset(activePreset) {
    buttons.forEach(({ preset, button }) =>
      button.setAttribute("aria-pressed", String(preset === activePreset))
    );
  };
}

async function main() {
  const readout = document.getElementById("readout");
  const regionName = document.getElementById("region-name");
  const idleReadout = "> hover or click a country";

  renderSummary(document.getElementById("summary"));
  renderContinentBreakdown(document.getElementById("continents"));
  const beenThereCount = TRAVEL_LOG.filter((entry) => entry.status !== "transit").length;
  document.getElementById("title-count").textContent = `${beenThereCount} countries logged`;

  let shapes;
  try {
    shapes = await loadCountryShapes();
  } catch (error) {
    readout.textContent = "> map data failed to load. serve this folder over http (see readme), opening index.html directly won't work";
    console.error(error);
    return;
  }

  const showHover = (feature) => {
    readout.textContent = feature ? describeCountry(feature) : idleReadout;
  };

  let globe;
  let regionMap;
  let markActivePreset;

  function focusCountry(feature) {
    const bounds = boundsAroundCountry(feature);
    globe.rotateTo(d3.geoCentroid(largestLandmass(feature)));
    globe.markSelected(feature.id);
    regionMap.showBounds(bounds, feature.id);
    regionName.textContent = (feature.properties.name ?? "").toLowerCase();
    markActivePreset(null);
  }

  function focusPreset(preset) {
    globe.rotateTo(boundsCenter(preset.bounds));
    globe.markSelected(null);
    regionMap.showBounds(preset.bounds);
    regionName.textContent = preset.name;
    markActivePreset(preset);
  }

  globe = createGlobe(document.getElementById("globe"), shapes.globeCountries, {
    onCountryClick: focusCountry,
    onHover: showHover,
  });
  regionMap = createRegionMap(document.getElementById("region-map"), shapes.mapCountries, {
    onCountryClick: focusCountry,
    onHover: showHover,
  });
  markActivePreset = buildPresetButtons(document.getElementById("region-presets"), focusPreset);

  // Start on the default region without yanking the globe away from its idle spin
  regionMap.showBounds(DEFAULT_PRESET.bounds);
  regionName.textContent = DEFAULT_PRESET.name;
  markActivePreset(DEFAULT_PRESET);
  readout.textContent = idleReadout;
}

main();
