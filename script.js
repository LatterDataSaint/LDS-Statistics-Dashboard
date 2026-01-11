let rawData = [];
let operatingTemplesWorld = [];

const SERIES_A_COLOR = "#1f77b4"; // Plotly default blue
const SERIES_B_COLOR = "#ff7f0e"; // Plotly default orange
const PER_COLOR      = "#2ca02c"; // Plotly default green

// ------------------ NORMALIZATION TOGGLE HELPERS------------------ //

function isNormalizedMode() {
    const cb = document.getElementById("use-normalized");
    return cb ? cb.checked : true; // default to normalized
}

function reportNormalizationState(context = "") {
    const state = isNormalizedMode() ? "ON (normalized)" : "OFF (raw)";
    //console.log(`Normalization ${context}: ${state}`);
}

document.addEventListener("DOMContentLoaded", () => {
    const normalizedCheckbox = document.getElementById("use-normalized");
    if (normalizedCheckbox) {
        normalizedCheckbox.addEventListener("change", () => {
            updateSeriesDropdownsForCurrentSelection(true);
        });
    }

});

const NORMALIZED_SERIES_MAP = {
    "Family History Centers": [
        "Family History Centers",
        "Family Search Centers"
    ],

    "Missionaries": [
        "Missionaries",
        "Full-Time Teaching Missionaries"
    ],

    "Countries with Family History Centers": [
        "Countries with Family History Centers",
        "Countries with Family Search Centers"
    ],

    "Church Materials Languages": [
        "Published Languages",
        "Church Materials Languages"
    ],

    "Seminary Students Enrollment": [
        "Seminary Students Enrollment",
        "Seminary Student Enrollment",
        "Youth Students Enrollment"
    ],

    "Institute Student Enrollment": [
        "Institute Students Enrollment",
        "Institute Student Enrollment",
        "Adult Students Enrollment"
    ],

    "Missionary Training Centers": [
        "Missionary Training Centers",
        "Training Centers"
    ],

    "Welfare Services Missionaries (Incl. Humanitarian Service Missionaries)": [
        "Welfare Services Missionaries (Incl. Humanitarian Service Missionaries)"
    ],

    "Young Service Missionaries": [
        "Young Service Missionaries",
        "Young Church-Service Missionaries"
    ],

    "Senior Service Missionaries": [
        "Senior Service Missionaries",
        "Senior Church-Service Missionaries"
    ],

    "Temples": [
        "Temples",
        "Temples (as of October 2, 2022)",
        "Temples (includes operating and announced)"
    ],

    "Operating Temples": [
        "__OPERATING_TEMPLE_SERIES__"
    ]

};

function getNormalizedSeriesName(rawName) {
    if (!isNormalizedMode()) return rawName;

    for (const [normalized, rawList] of Object.entries(NORMALIZED_SERIES_MAP)) {
        if (rawList.includes(rawName)) {
            return normalized;
        }
    }
    return rawName;
}

function isNormalizedSeries(seriesName) {
    return isNormalizedMode() && NORMALIZED_SERIES_MAP[seriesName];
}

// ------------------ FORMAT LABELS ------------------ //

function roundCustomMetric(v) {
    if (v == null || !isFinite(v)) return null;
    const abs = Math.abs(v);
    if (abs >= 100) return Math.round(v);
    if (abs >= 10) return Math.round(v * 10) / 10;
    return Math.round(v * 100) / 100;
}

function formatLabel(value) {
    if (value == null || !isFinite(value)) return "";

    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + "M";
    }
    if (value >= 10000) {
        return (value / 1000).toFixed(1) + "k";
    }
    return Number(value).toLocaleString();
}

// Per-series formatting rules:
// 0 decimals if >= 100
// 1 decimal if 10..99.999
// 2 decimals if < 10
function formatPerLabel(value) {
    if (value == null || !isFinite(value)) return "";
    const abs = Math.abs(value);

    let digits = 2;
    if (abs >= 100) digits = 0;
    else if (abs >= 10) digits = 1;

    return Number(value).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function isNumeric(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return isFinite(value);
    const s = String(value).trim();
    if (s === "") return false;
    const n = Number(s);
    return !Number.isNaN(n) && isFinite(n);
}

function toNumberOrNull(v) {
    if (!isNumeric(v)) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

// ------------------------- LOAD CSV ------------------------------ //

async function loadData() {
    const response = await fetch("data/lds_fs_countries_latest.csv");
    const text = await response.text();

    rawData = Papa.parse(text, { header: true }).data;

    const HEADER_ALIASES = {
        "universities_colleges": "Universities & Colleges"
    };

    // APPLY ALIASES AFTER PARSING
    rawData.forEach(r => {
        for (const [raw, display] of Object.entries(HEADER_ALIASES)) {
            if (r[raw] !== undefined && r[display] === undefined) {
                r[display] = r[raw];
            }
        }
    });

    rawData.forEach(r => {
        const ts = String(r.timestamp || "");

        const year = ts.substring(0, 4);
        const month = ts.substring(4, 6);
        const day = ts.substring(6, 8);
        const hour = ts.substring(8, 10);
        const minute = ts.substring(10, 12);
        const second = ts.substring(12, 14);

        r.date = ts.length >= 14
            ? new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
            : new Date(`${year}-01-01T00:00:00`);

        r.year = parseInt(year, 10);
    });

    await loadOperatingTemplesWorld();

    populateFilters();

    initSeriesControls();
    updateSeriesDropdownsForCurrentSelection(true);

    updateRegionDisplay();
    updateChart();
    updateTable();
}

async function loadOperatingTemplesWorld() {
    const response = await fetch("data/op_temples_world_latest.csv");
    const text = await response.text();

    operatingTemplesWorld = Papa.parse(text, {
        header: true,
        dynamicTyping: true
    }).data.map(r => ({
        timestamp: r.timestamp,
        value: r.operating_temples
    }));
}

// ------------------------- REGION NAME / IMAGE ------------------------------ //

function getRegionName(continent, country, state) {
    if (continent === "Global") return "World";

    if (country === "United States" || country === "Canada") {
        if (state && state !== "All") return state + ", " + country;
        return country;
    }

    return country || continent || "World";
}

function updateRegionDisplay() {
    const continent = document.getElementById("continent").value;
    const country = document.getElementById("country").value;
    const state = document.getElementById("state").value;

    const regionName = getRegionName(continent, country, state);
    const nameEl = document.getElementById("region-name");
    if (nameEl) nameEl.innerText = regionName;

    const img = document.getElementById("region-image");
    if (!img) return;

    let imgName = null;

    // ------------------------------
    // GLOBAL / WORLD
    // ------------------------------
    if (continent === "Global" && country === "World") {
        imgName = "country_world.png";
    }

    // ------------------------------
    // US / CANADA STATE (future)
    // ------------------------------
    else if (
        (country === "United States" || country === "Canada") &&
        state &&
        state !== "All"
    ) {
        imgName = `state_${state.toLowerCase().replace(/\s+/g, "_")}.png`;
    }

    // ------------------------------
    // COUNTRY
    // ------------------------------
    else if (country && country !== "World") {
        imgName = `country_${country.toLowerCase().replace(/\s+/g, "_")}.png`;
    }

    // ------------------------------
    // FALLBACK
    // ------------------------------
    if (imgName) {
        const imagePath = `images/${imgName}`;

        // Preload before swapping
        const preload = new Image();
        preload.onload = () => {
            img.src = imagePath;
            img.style.display = "block";
        };
        preload.src = imagePath;

    } else {
        img.removeAttribute("src"); // important: no empty src
        img.style.display = "none";
    }

}

function normalizeNameForFilename(name) {
    if (!name) return "";

    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_"); // spaces to underscores
}

function normalizeSeriesHeaders(rawHeaders) {
    if (!isNormalizedMode()) {
        return [...rawHeaders];
    }

    const out = new Set();

    rawHeaders.forEach(h => {
        if (!h) return;

        let normalized = h;

        for (const [canonical, rawList] of Object.entries(NORMALIZED_SERIES_MAP)) {
            if (rawList.includes(h)) {
                normalized = canonical;
                break;
            }
        }

        out.add(normalized);
    });

    return Array.from(out);
}



// ---------------------- FILTER POPULATION ------------------------ //

function populateFilters() {
	let continents = [...new Set(
		rawData
			.map(r => r.continent)
			.filter(c => c && c !== "Global") // remove data Global
	)].sort();

	continents.unshift("Global"); // add exactly once

    fillDropdown("continent", continents);
    document.getElementById("continent").value = "Global";

    const years = [...new Set(rawData.map(r => r.year).filter(y => isFinite(y)))].sort((a, b) => a - b);
    fillDropdown("yearStart", years);
    fillDropdown("yearEnd", years);

    document.getElementById("yearStart").value = years[0];
    document.getElementById("yearEnd").value = years.includes(2026) ? 2026 : years[years.length - 1];

    document.getElementById("continent").addEventListener("change", () => {
        updateCountryDropdown();
        updateStateDropdown();
        updateRegionDisplay();
        updateSeriesDropdownsForCurrentSelection(false);
        updateChart();
		updateTable();
    });

    document.getElementById("country").addEventListener("change", () => {
        updateStateDropdown();
        updateRegionDisplay();
        updateSeriesDropdownsForCurrentSelection(false);
        updateChart();
		updateTable();
    });

    document.getElementById("state").addEventListener("change", () => {
        updateRegionDisplay();
        updateSeriesDropdownsForCurrentSelection(false);
        updateChart();
		updateTable();
    });

    document.getElementById("yearStart").addEventListener("change", () => {
        updateSeriesDropdownsForCurrentSelection(false);
        updateChart();
		updateTable();
    });

    document.getElementById("yearEnd").addEventListener("change", () => {
        updateSeriesDropdownsForCurrentSelection(false);
        updateChart();
		updateTable();
    });

    updateCountryDropdown();
    updateStateDropdown();
}

function fillDropdown(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = "";
    values.forEach(v => {
        el.innerHTML += `<option value="${v}">${v}</option>`;
    });
}

function updateCountryDropdown() {
    const continent = document.getElementById("continent").value;
    const countryEl = document.getElementById("country");

    if (continent === "Global") {
        fillDropdown("country", ["World"]);
        countryEl.value = "World";
        return;
    }

    let countries = [...new Set(
        rawData
            .filter(r => r.continent === continent)
            .map(r => r.country)
            .filter(Boolean)
    )].sort();

    fillDropdown("country", countries);
    countryEl.value = countries[0] || "";
}

function updateStateDropdown() {
    const country = document.getElementById("country").value;
    const stateEl = document.getElementById("state");

    if (country !== "United States" && country !== "Canada") {
        fillDropdown("state", []);
        stateEl.value = "";
        return;
    }

    let states = [...new Set(
        rawData
            .filter(r => r.country === country)
            .map(r => r.state)
            .filter(s => s && s.trim() !== "")
    )].sort();

    states = ["All", ...states];

    fillDropdown("state", states);
    stateEl.value = "All";
}

// ------------------- SERIES CONTROLS (A/B + SWAP) -------------------- //

function initSeriesControls() {
    const selA = document.getElementById("seriesA");
    const selB = document.getElementById("seriesB");
    const btn = document.getElementById("swapSeries");

    if (!selA || !selB || !btn) return;

    selA.addEventListener("change", () => {
        // Prevent A == B
        if (selA.value === selB.value) {
            // pick first different option
            const opts = [...selB.options].map(o => o.value);
            const replacement = opts.find(v => v !== selA.value);
            if (replacement) selB.value = replacement;
        }
        updateChart();
		updateTable();
    });

    selB.addEventListener("change", () => {
        if (selA.value === selB.value) {
            const opts = [...selA.options].map(o => o.value);
            const replacement = opts.find(v => v !== selB.value);
            if (replacement) selA.value = replacement;
        }
        updateChart();
		updateTable();
    });

    btn.addEventListener("click", () => {
        const a = selA.value;
        const b = selB.value;
        selA.value = b;
        selB.value = a;
        updateChart();
		updateTable();
    });
}

// Returns rows filtered by region (and optionally year range)
function getFilteredRowsForCurrentSelection(includeYearRange) {
    const continent = document.getElementById("continent").value;
    const country = document.getElementById("country").value;
    const state = document.getElementById("state").value;

    let yearStart = null;
    let yearEnd = null;

    if (includeYearRange) {
        yearStart = parseInt(document.getElementById("yearStart").value, 10);
        yearEnd = parseInt(document.getElementById("yearEnd").value, 10);
    }

    return rawData.filter(r =>
        (continent === "Global" ? r.continent === "Global" : r.continent === continent) &&
        (country === "World" ? r.country === "World" : r.country === country) &&
        (
            ((country === "United States" || country === "Canada") &&
                state === "All" &&
                (r.state === "" || r.state == null)
            ) ||
            (state && state !== "All" && r.state === state) ||
            (!(country === "United States" || country === "Canada"))
        ) &&
        (!includeYearRange || (r.year >= yearStart && r.year <= yearEnd))
    );
}

function getNumericHeadersForRows(rows) {
    if (!rows || rows.length === 0) return [];

    const exclude = new Set([
        "timestamp", "date", "year",
        "continent", "country", "state", ""
    ]);

    const headers = Object.keys(rows[0]).filter(h => !exclude.has(h));

    // Keep headers that have at least one numeric value in these rows
    return headers.filter(h => rows.some(r => isNumeric(r[h])));
}

// Populates Series A/B based on numeric headers available for the selection.
// If resetToDefaults is true, force defaults if current selection isn't valid.
function updateSeriesDropdownsForCurrentSelection(resetToDefaults) {
    const selA = document.getElementById("seriesA");
    const selB = document.getElementById("seriesB");

    if (!selA || !selB) return;

    const isWorld =
        document.getElementById("country")?.value === "World" &&
        document.getElementById("continent")?.value === "Global";
    const isSubWorldRegion = !isWorld;


    // Use region rows (ignoring year range) to decide what "exists" for that region
    const regionRows = getFilteredRowsForCurrentSelection(false);
    const rawHeaders = getNumericHeadersForRows(regionRows);
    let numericHeaders = normalizeSeriesHeaders(rawHeaders);

    // For all non-World regions, Temples ALWAYS means Operating Temples
    if (isSubWorldRegion) {
        numericHeaders = numericHeaders.filter(h =>
            ![
                "Temples",
                "Temples (as of October 2, 2022)",
                "Temples (includes operating and announced)"
            ].includes(h)
        );

        // Only add Operating Temples if there is temple data at all
        const hasAnyTempleData = rawHeaders.some(h =>
            [
                "Temples",
                "Temples (as of October 2, 2022)",
                "Temples (includes operating and announced)"
            ].includes(h)
        );

        if (hasAnyTempleData) {
            numericHeaders.push("Operating Temples");
        }
    }

    if (isNormalizedMode() && isWorld) {
        // Remove all temple-related raw headers
        numericHeaders = numericHeaders.filter(h =>
            ![
                "Temples",
                "Temples (as of October 2, 2022)",
                "Temples (includes operating and announced)"
            ].includes(h)
        );

        // Add normalized series
        numericHeaders.push("Operating Temples");
    }


    // Keep prior selections if possible
    const prevA = selA.value;
    const prevB = selB.value;

    selA.innerHTML = "";
    selB.innerHTML = "";

    numericHeaders.forEach(h => {
        const o1 = document.createElement("option");
        o1.value = h;
        o1.textContent = h;
        selA.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = h;
        o2.textContent = h;
        selB.appendChild(o2);
    });

    const defaultA = "Total Church Membership";
    const defaultB = "Congregations";

    function has(h) {
        return numericHeaders.includes(h);
    }

    // Decide A
    if (!resetToDefaults && prevA && has(prevA)) selA.value = prevA;
    else if (has(defaultA)) selA.value = defaultA;
    else selA.value = numericHeaders[0] || "";

    // Decide B
    if (!resetToDefaults && prevB && has(prevB)) selB.value = prevB;
    else if (has(defaultB)) selB.value = defaultB;
    else selB.value = numericHeaders[1] || numericHeaders[0] || "";

    // Prevent A == B
    if (selA.value && selA.value === selB.value) {
        const replacement = numericHeaders.find(v => v !== selA.value);
        if (replacement) selB.value = replacement;
    }

    // If we still ended up missing required defaults for a weird region, force safe fallback
    if (!selA.value || !selB.value) {
        if (has(defaultA) && has(defaultB) && defaultA !== defaultB) {
            selA.value = defaultA;
            selB.value = defaultB;
        }
    }
}

// ------------------- DYNAMIC LABEL POSITIONING -------------------- //

// ------------------- DYNAMIC LABEL POSITIONING -------------------- //

function computeLabelPositions(gd) {
    const cd = gd.calcdata;
    if (!cd || !cd.length) return;

    // Identify text traces by presence of .text
    const textTraces = gd.data
        .map((trace, i) => ({ trace, i }))
        .filter(o => Array.isArray(o.trace.text));

    if (textTraces.length < 2) return;

    function safePixels(calcTrace) {
        if (!calcTrace || !calcTrace.length) return null;

        const pt = calcTrace[0];
        if (!pt.ya || typeof pt.ya.l2p !== "function") return null;

        return calcTrace.map(p => p.ya.l2p(p.yp));
    }

    // Expect: A text, B text, Per text — but do not assume
    const aIdx = textTraces[0].i;
    const bIdx = textTraces[1].i;
    const perIdx = textTraces[2]?.i;

    const aPixels = safePixels(cd[aIdx]);
    const bPixels = safePixels(cd[bIdx]);
    const perPixels = perIdx != null ? safePixels(cd[perIdx]) : null;

    if (!aPixels || !bPixels) return;

    const posA = [];
    const posB = [];
    const posPer = [];

    const len = Math.min(aPixels.length, bPixels.length);

    for (let i = 0; i < len; i++) {
        if (perPixels) posPer.push("top center");

        const aHasText = gd.data[aIdx].text[i] !== "";
        const bHasText = gd.data[bIdx].text[i] !== "";

        if (!aHasText && !bHasText) {
            posA.push("none");
            posB.push("none");
            continue;
        }

        const pairs = [
            { s: "a", p: aPixels[i], has: aHasText },
            { s: "b", p: bPixels[i], has: bHasText }
        ]
            .filter(o => o.has)
            .sort((x, y) => x.p - y.p);

        let pA = "middle center";
        let pB = "middle center";

        if (pairs.length === 1) {
            if (pairs[0].s === "a") pA = "top center";
            if (pairs[0].s === "b") pB = "top center";
        } else {
            const top = pairs[0].s;
            const bottom = pairs[1].s;

            if (top === "a") pA = "top center";
            if (top === "b") pB = "top center";

            if (bottom === "a") pA = "bottom center";
            if (bottom === "b") pB = "bottom center";
        }

        posA.push(pA);
        posB.push(pB);
    }

    const restylePayload = {};
    restylePayload["textposition"] = [
        posA,
        posB,
        perPixels ? posPer : undefined
    ];

    Plotly.restyle(gd, restylePayload);
}


// --------------------------- CHART ------------------------------- //
function getSeriesData(rows, seriesName) {
    if (!rows || !rows.length) return [];

    const isWorld =
        rows[0].country === "World" &&
        rows[0].continent === "Global";

    // ------------------------------------------------
    // Operating Temples — World (normalized, special)
    // ------------------------------------------------
    if (
        seriesName === "Operating Temples" &&
        isNormalizedMode() &&
        isWorld
    ) {
        const lookup = new Map(
            operatingTemplesWorld.map(o => [
                String(o.timestamp),
                Number(o.value)
            ])
        );

        return rows.map(r => {
            const v = lookup.get(String(r.timestamp));
            return Number.isFinite(v) ? v : null;
        });
    }

    // ------------------------------------------------
    // Operating Temples — non-World (alias to Temples)
    // ------------------------------------------------
    if (seriesName === "Operating Temples" && !isWorld) {
        return rows.map(r => {
            const v = r["Temples"];
            return isNumeric(v) ? Number(v) : null;
        });
    }

    // ------------------------------------------------
    // Welfare Services Missionaries (legacy + split)
    // ------------------------------------------------
    if (seriesName === "Welfare Services Missionaries (Incl. Humanitarian Service Missionaries)") {
        return rows.map(r => {
            const legacy = r["Welfare Services Missionaries (Incl. Humanitarian Service Missionaries)"];

            if (isNumeric(legacy) && Number(legacy) > 0) {
                return Number(legacy);
            }

            const senior =
                toNumberOrNull(r["Senior Service Missionaries"]) ??
                toNumberOrNull(r["Senior Church-Service Missionaries"]);

            const young =
                toNumberOrNull(r["Young Service Missionaries"]) ??
                toNumberOrNull(r["Young Church-Service Missionaries"]);

            if (senior == null && young == null) return null;

            return (senior ?? 0) + (young ?? 0);
        });
    }

    // ------------------------------------------------
    // GENERIC normalized-series resolver (THIS WAS MISSING)
    // ------------------------------------------------
    if (isNormalizedMode() && NORMALIZED_SERIES_MAP[seriesName]) {
        const candidates = NORMALIZED_SERIES_MAP[seriesName]
            .filter(h => !h.startsWith("__"));

        return rows.map(r => {
            for (const h of candidates) {
                if (isNumeric(r[h])) {
                    return Number(r[h]);
                }
            }
            return null;
        });
    }

    // ------------------------------------------------
    // Default CSV-backed behavior (raw mode)
    // ------------------------------------------------
    return rows.map(r => {
        const v = r[seriesName];
        return isNumeric(v) ? Number(v) : null;
    });
}


function updateChart() {
    const continent = document.getElementById("continent").value;
    const country = document.getElementById("country").value;
    const state = document.getElementById("state").value;
    const yearStart = parseInt(document.getElementById("yearStart").value, 10);
    const yearEnd = parseInt(document.getElementById("yearEnd").value, 10);

    // Read current series selections, enforce safety fallbacks
    const selA = document.getElementById("seriesA");
    const selB = document.getElementById("seriesB");

    let seriesAField = selA ? selA.value : "Total Church Membership";
    let seriesBField = selB ? selB.value : "Congregations";

    // Filter rows using your trusted logic + year range
    const filtered = rawData.filter(r =>
        (continent === "Global" ? r.continent === "Global" : r.continent === continent) &&
        (country === "World" ? r.country === "World" : r.country === country) &&
        (
            ((country === "United States" || country === "Canada") &&
                state === "All" &&
                (r.state === "" || r.state == null)
            ) ||
            (state && state !== "All" && r.state === state) ||
            (!(country === "United States" || country === "Canada"))
        ) &&
        r.year >= yearStart &&
        r.year <= yearEnd
    );
	
	filtered.sort((a, b) => a.date - b.date);

	

    const regionName = getRegionName(continent, country, state);

    // If either selected field has no numeric values in THIS filtered range, force defaults
    function fieldHasAnyNumeric(field) {
        // Operating Temples (normalized, world-only series)
        if (field === "Operating Temples" && isNormalizedMode()) {
            const isWorld = (continent === "Global" && country === "World");
            return isWorld
                ? operatingTemplesWorld.length > 0
                : filtered.some(r => isNumeric(r["Temples"]));
        }

        // Normalized multi-source series
        if (isNormalizedMode() && NORMALIZED_SERIES_MAP[field]) {
            const rawCandidates = NORMALIZED_SERIES_MAP[field];
            return filtered.some(r =>
                rawCandidates.some(h => isNumeric(r[h]) && Number(r[h]) > 0)
            );
        }

        // Default
        return filtered.some(r => isNumeric(r[field]));
    }




    const defaultA = "Total Church Membership";
    const defaultB = "Congregations";

    if (!fieldHasAnyNumeric(seriesAField) || !fieldHasAnyNumeric(seriesBField) || seriesAField === seriesBField) {
        seriesAField = defaultA;
        seriesBField = defaultB;

        // Also reflect that in UI if possible
        if (selA && [...selA.options].some(o => o.value === seriesAField)) selA.value = seriesAField;
        if (selB && [...selB.options].some(o => o.value === seriesBField)) selB.value = seriesBField;
        if (selA && selB && selA.value === selB.value) {
            // last resort: pick first different
            const replacement = [...selB.options].map(o => o.value).find(v => v !== selA.value);
            if (replacement) selB.value = replacement;
            seriesBField = selB.value;
        }
    }

    const dates = filtered.map(r => r.date);

    // ---------------- Year Tick Generation ----------------
    const yearsList = [...new Set(filtered.map(r => r.year))].sort((a, b) => a - b);
    const yearTickVals = yearsList.map(y => new Date(`${y}-01-01T00:00:00`));
    const yearTickText = yearsList.map(y => String(y));

    // Extract Series A and B
    const seriesA = getSeriesData(filtered, seriesAField);
    const seriesB = getSeriesData(filtered, seriesBField);

    if (!Array.isArray(seriesA)) {
        console.error("seriesA is not an array:", seriesAField, seriesA);
    }

    // A per B (bottom chart)
    const per = seriesA.map((a, i) => {
        const b = seriesB[i];
        if (a == null || b == null || b === 0) return null;
        return a / b;
    });

    // Labels: show first, last, or when value changes
    const seriesALabels = seriesA.map((v, i) =>
        i === 0 || i === seriesA.length - 1 || v !== seriesA[i - 1]
            ? formatLabel(v)
            : ""
    );

    const seriesBLabels = seriesB.map((v, i) =>
        i === 0 || i === seriesB.length - 1 || v !== seriesB[i - 1]
            ? formatLabel(v)
            : ""
    );

    const perLabels = per.map((v, i) =>
        i === 0 || i === per.length - 1 || v !== per[i - 1]
            ? formatPerLabel(v)
            : ""
    );

    const hovertext = filtered.map((r, i) => {
        const a = seriesA[i];
        const b = seriesB[i];
        const p = per[i];

        const aText = (a == null || isNaN(a)) ? "-" : a.toLocaleString();
        const bText = (b == null || isNaN(b)) ? "-" : b.toLocaleString();
        const pText = (p == null || isNaN(p)) ? "-" : p.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const dateStr = new Date(r.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
        return (
            `${dateStr}<br>` +
            `${seriesAField}: ${aText}<br>` +
            `${seriesBField}: ${bText}<br>` +
            `${seriesAField} per ${seriesBField}: ${pText}`
        );
    });

    const traceA_line = {
        x: dates,
        y: seriesA,
        mode: "lines+markers",
        name: seriesAField,
        yaxis: "y",
        xaxis: "x",
        connectgaps: false,

        /*customdata,*/
        hovertext,
        hoverinfo: "text",

        line:   { color: SERIES_A_COLOR },
        marker: { color: SERIES_A_COLOR },

    };
    const traceA_text = {
        x: dates,
        y: seriesA,
        mode: "text+markers",
        text: seriesALabels,
        textposition: "top left",
        yaxis: "y",
        xaxis: "x",

        textfont: { color: SERIES_A_COLOR, size: 11 },
        marker: { size: 12, opacity: 0 },

        hoverinfo: "skip",
        showlegend: false
    };
    const traceB_line = {
        x: dates,
        y: seriesB,
        mode: "lines+markers",
        name: seriesBField,
        yaxis: "y2",
        xaxis: "x",
        connectgaps: false,

        line:   { color: SERIES_B_COLOR },
        marker: { color: SERIES_B_COLOR },

        hoverinfo: "skip"
    };
    const traceB_text = {
        x: dates,
        y: seriesB,
        mode: "text+markers",
        text: seriesBLabels,
        textposition: "bottom right",
        yaxis: "y2",
        xaxis: "x",

        textfont: { color: SERIES_B_COLOR, size: 11 },
        marker: { size: 12, opacity: 0 },

        hoverinfo: "skip",
        showlegend: false
    };
    const tracePer_line = {
        x: dates,
        y: per,
        mode: "lines+markers",
        name: `${seriesAField} per ${seriesBField}`,
        yaxis: "y3",
        xaxis: "x2",
        connectgaps: false,

        line:   { color: PER_COLOR },
        marker: { color: PER_COLOR },

        hovertemplate:
            "Date: %{x}<br>" +
            `%{y:,.2f}<br>` +
            "<extra></extra>"
    };
    const tracePer_text = {
        x: dates,
        y: per,
        mode: "text+markers",
        text: perLabels,
        textposition: "top center",
        yaxis: "y3",
        xaxis: "x2",

        textfont: { color: PER_COLOR, size: 11 },
        marker: { size: 12, opacity: 0 },

        hoverinfo: "skip",
        showlegend: false
    };

    // --- Prevent label cutoff on PER (bottom chart) ---
    const perVals = per.filter(v => v != null && isFinite(v));
    const perMin = perVals.length ? Math.min(...perVals) : 0;
    const perMax = perVals.length ? Math.max(...perVals) : 1;
    const perRange = [
        perMin * 0.95,
        perMax * 1.1
    ];

    const layout = {
        legend: {
            orientation: "h",
            x: 0.55,
            y: 1.05,
            xanchor: "center",
            yanchor: "bottom",
            xref: "paper",
            yref: "paper"
        },

        hovermode: "x",

        margin: {
            t: 0,
            b: 0,
            l: 110,
            r: 110
        },

        xaxis: {
            type: "date",
            domain: [0, 1],
            tickmode: "array",
            tickvals: yearTickVals,
            ticktext: yearTickText,
            tickangle: 0,
			zeroline: false,
			showline: false
        },

        yaxis: {
            title: seriesAField,
            domain: [0.5, 1],
			zeroline: false,
			showline: false
        },
        yaxis2: {
            title: seriesBField,
            overlaying: "y",
            side: "right",
			zeroline: false,
			showline: false,
            showgrid: false,
            layer: "below traces"
        },

        xaxis2: {
            type: "date",
            domain: [0, 1],
            tickmode: "array",
            tickvals: yearTickVals,
            ticktext: yearTickText,
            tickangle: 0,
			zeroline: false,
			showline: false,
            anchor: "y3"
        },

		yaxis3: {
			title: {
				text: `${seriesAField}<br>per ${seriesBField}`,
				standoff: 10
			},
			domain: [0.15, 0.40],
			range: perRange,
			automargin: true
		},

        height: 1000,

        shapes: [
			// full layout border
			{
				type: "rect",
				xref: "paper",
				yref: "paper",
				x0: 0,
				x1: 1,
				y0: 0,
				y1: 1,
				line: {
					color: "red",
					width: 0
				},
				fillcolor: "rgba(0,0,0,0)",
				layer: "above"
			},
			// top border
			{
                type: "rect",
                xref: "paper",
                yref: "paper",
                x0: 0.0,
                x1: 1,
                y0: 0.47,
                y1: 1,
                line: { color: "black", width: 1 },
                fillcolor: "rgba(0,0,0,0)",
                layer: "above"
            },
			// bottom border
            {
                type: "rect",
                xref: "paper",
                yref: "paper",
                x0: 0,
                x1: 1,
                y0: 0.12,
                y1: 0.4,
                line: { color: "black", width: 1 },
                fillcolor: "rgba(0,0,0,0)",
                layer: "above"
            }
        ],

        annotations: [
            {
                text: `${seriesAField} and ${seriesBField} - ${regionName}`,
                x: 0,
                y: 1,
                xanchor: "left",
                yanchor: "bottom",
                xref: "paper",
                yref: "paper",
                showarrow: false,
                font: { size: 20, family: "Arial", weight: "bold" }
            },
            {
                text: `${seriesAField} per ${seriesBField} - ${regionName}`,
                x: 0,
                y: 0.4,
                xanchor: "left",
                yanchor: "bottom",
                xref: "paper",
                yref: "paper",
                showarrow: false,
                font: { size: 20, family: "Arial", weight: "bold" }
            }
        ]
    };

    Plotly.newPlot(
        "chart",
        [
            traceA_line,
            traceB_line,
            traceA_text,
            traceB_text,
            tracePer_line,
            tracePer_text
        ],
        layout
    ).then(gd => computeLabelPositions(gd));

	updateTable();
}

window.onload = loadData;