/*************************************************************
 *  Table helpers & state
 *************************************************************/

let tableSort = {
    key: "ratio",
    dir: "desc"
};

let activeTableTab = "comparison"; // default

// Blue wins over orange
function getCellClass(rowIsSelected, colKey) {
    if (rowIsSelected && tableSort.key === colKey) {
        return "selected-row";
    }
    if (tableSort.key === colKey) {
        return "sorted-col";
    }
    return "";
}

function fmtInt(v) {
    if (v == null || !isFinite(v)) return "-";
    return Math.round(v).toLocaleString();
}

function fmtFixed2(v) {
    if (v == null || !isFinite(v)) return "-";
    return Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatTimestampToLongDate(ts) {
    if (!ts || String(ts).length < 8) return "-";

    const s = String(ts);

    const year = Number(s.slice(0, 4));
    const month = Number(s.slice(4, 6)) - 1; // 0-based
    const day = Number(s.slice(6, 8));

    const d = new Date(year, month, day);
    if (isNaN(d)) return "-";

    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

function pctChange(start, end) {
    if (start == null || end == null || start === 0) return null;
    return ((end - start) / start) * 100;
}

function attachTableRowHandlers() {
    const rows = document.querySelectorAll("#stats table tbody tr");

    rows.forEach(row => {
        row.addEventListener("click", () => {
            const continent = row.dataset.continent;
            const country = row.dataset.country;
            const state = row.dataset.state;

            const continentSel = document.getElementById("continent");
            const countrySel = document.getElementById("country");
            const stateSel = document.getElementById("state");

            if (!continentSel || !countrySel || !stateSel) return;

            // --- Set continent ---
            continentSel.value = continent;
            continentSel.dispatchEvent(new Event("change"));

            // --- Set country after continent dropdown repopulates ---
            setTimeout(() => {
                const allLabel = `${continent} (all countries)`;
                const targetCountry = (country === allLabel) ? allLabel : country;

                const trySetCountry = () => {
                    const options = [...countrySel.options];
                    const match = options.find(o =>
                        o.value === targetCountry || o.text === targetCountry
                    );

                    if (!match) {
                        // dropdown may still be rebuilding
                        setTimeout(trySetCountry, 10);
                        return;
                    }

                    countrySel.value = match.value;
                    countrySel.dispatchEvent(new Event("change"));

                    // --- Set state after country dropdown/state dropdown updates ---
                    setTimeout(() => {
                        if (state && state !== "-") {
                            stateSel.value = state;
                        } else {
                            stateSel.value = "";
                        }

                        stateSel.dispatchEvent(new Event("change"));
                    }, 0);
                };

                trySetCountry();
            }, 0);
        });
    });
}

function updateTableHintVisibility() {
    const hint = document.getElementById("comparison-hint");
    if (!hint) return;

	hint.style.visibility =
		activeTableTab === "comparison" ? "visible" : "hidden";
}

/*************************************************************
 *  Selected region key (for row highlighting)
 *************************************************************/

function getSelectedRegionKey() {
    const c = document.getElementById("continent").value;
    const k = document.getElementById("country").value;
    const s = document.getElementById("state").value;

    // 🔥 Handle "(all countries)"
    if (k && k.includes("(all countries)")) {
        return `${c}|ALL|-`;
    }

    let statePart = "-";
    if ((k === "United States" || k === "Canada") && s && s !== "All") {
        statePart = s;
    }

    return `${c}|${k}|${statePart}`;
}

/*************************************************************
 *  Build table data
 *************************************************************/

function buildTableData() {
    const aField = document.getElementById("seriesA").value;
    const bField = document.getElementById("seriesB").value;

    const yearStart = parseInt(document.getElementById("yearStart").value, 10);
    const yearEnd   = parseInt(document.getElementById("yearEnd").value, 10);

    const filtered = rawData.filter(r =>
        r.year >= yearStart &&
        r.year <= yearEnd
    );

    const groups = new Map();

    for (const r of filtered) {
        if (!r || !r.continent || !r.country || !isFinite(r.year)) continue;

        let stateVal = "-";
        if (r.country === "United States" || r.country === "Canada") {
            stateVal = (r.state && r.state.trim()) ? r.state : "-";
        }

        const key = `${r.continent}|${r.country}|${stateVal}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }

    const rows = [];

    // ---------------- CONTINENT AGGREGATION ----------------
    const continentAggregates = new Map();

    for (const r of filtered) {
        if (!r || !r.continent || !isFinite(r.year)) continue;

        if (r.continent === "Global") continue;
        if (r.state && r.state.trim() !== "") continue;
        if (r.country && r.country.includes("(all countries)")) continue;

        const key = r.continent;

        if (!continentAggregates.has(key)) {
            continentAggregates.set(key, []);
        }

        continentAggregates.get(key).push(r);
    }

    // ---------------- COUNTRY / STATE ROWS ----------------
    for (const [key, records] of groups.entries()) {
        const [continent, country, state] = key.split("|");

        records.sort((a, b) => a.date - b.date);

        const aSeries = records.map(r =>
            isNumeric(r[aField]) ? Number(r[aField]) : null
        );

        const bSeries = records.map(r =>
            isNumeric(r[bField]) ? Number(r[bField]) : null
        );

        const startYearRows = records.filter(r => r.year === yearStart);

        const startYearRecord = startYearRows.length
            ? startYearRows.reduce((latest, r) =>
                (!latest || r.timestamp > latest.timestamp) ? r : latest
            , null)
            : null;

        const endIdx   = [...records].map(r => r.year).lastIndexOf(yearEnd);

        const aStart =
            startYearRecord && isNumeric(startYearRecord[aField])
                ? Number(startYearRecord[aField])
                : null;

        const bStart =
            startYearRecord && isNumeric(startYearRecord[bField])
                ? Number(startYearRecord[bField])
                : null;

        const aEnd   = endIdx   >= 0 ? aSeries[endIdx]   ?? null : null;
        const bEnd   = endIdx   >= 0 ? bSeries[endIdx]   ?? null : null;

        //const endYearRecord = records.find(r => r.year === yearEnd);
        const endYearRows = records.filter(r => r.year === yearEnd);

        const endYearRecord = endYearRows.length
            ? endYearRows.reduce((latest, r) =>
                (!latest || r.timestamp > latest.timestamp) ? r : latest
            , null)
            : null;

        const membershipLatest =
            endYearRecord && isNumeric(endYearRecord["Total Church Membership"])
                ? Number(endYearRecord["Total Church Membership"])
                : null;

        const ratio =
            aEnd != null && bEnd != null && bEnd !== 0
                ? aEnd / bEnd
                : null;

        rows.push({
            key,
            continent,
            country,
            state,
            membershipLatest,
            aStart,
            aEnd,
            aPct: pctChange(aStart, aEnd),
            bStart,
            bEnd,
            bPct: pctChange(bStart, bEnd),
            ratio
        });
    }

    // ---------------- CONTINENT TOTAL ROWS ----------------
    for (const [continent, records] of continentAggregates.entries()) {

        // ✅ USE SHARED FUNCTION (THIS IS THE FIX)
        const aggRecords = aggregateByYearCountry(records, aField, bField);

        const startRow = aggRecords.find(r => r.year === yearStart);
        const endRow   = aggRecords.find(r => r.year === yearEnd);

        const aStart = startRow ? startRow.aVal : null;
        const aEnd   = endRow   ? endRow.aVal   : null;

        const bStart = startRow ? startRow.bVal : null;
        const bEnd   = endRow   ? endRow.bVal   : null;

        const ratio =
            aEnd != null && bEnd != null && bEnd !== 0
                ? aEnd / bEnd
                : null;

        const endYearRecord = aggRecords.find(r => r.year === yearEnd);

        const membershipLatest =
            endYearRecord ? endYearRecord.membershipVal : null;

        rows.push({
            key: `${continent}|ALL|-`,
            continent,
            country: `${continent} (all countries)`,
            state: "-",
            membershipLatest,
            aStart,
            aEnd,
            aPct: pctChange(aStart, aEnd),
            bStart,
            bEnd,
            bPct: pctChange(bStart, bEnd),
            ratio,
            isAggregate: true
        });
    }

    return { rows };
}

/*************************************************************
 *  Render table
 *************************************************************/

function renderStatsTable({ rows }) {
    const container = document.getElementById("stats");
    if (!container) return;

    const aField = document.getElementById("seriesA").value;
    const bField = document.getElementById("seriesB").value;

    const selectedKey = getSelectedRegionKey();
    const startYear = document.getElementById("yearStart").value;
    const endYear   = document.getElementById("yearEnd").value;

    const columns = [
        { key: "__rownum__", label: "#" },
        { key: "continent", label: "Continent" },
        { key: "country", label: "Country" },
        { key: "state", label: "State / Province" },
        { key: "membershipLatest", label: `Membership (${endYear})` },

		{ key: "aStart", label: startYear },
		{ key: "aEnd",   label: endYear },
        { key: "aPct",   label: "% Change" },

		{ key: "bStart", label: startYear },
		{ key: "bEnd",   label: endYear },
        { key: "bPct",   label: "% Change" },
        { key: "ratio",  label: `${aField} per ${bField}` }
    ];

    // ---- sort rows ----
    rows.sort((x, y) => {
        const a = x[tableSort.key];
        const b = y[tableSort.key];

        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;

        // 🔑 Handle strings vs numbers differently
        if (typeof a === "string" && typeof b === "string") {
            return tableSort.dir === "asc"
                ? a.localeCompare(b)
                : b.localeCompare(a);
        }

        // Default numeric sort
        return tableSort.dir === "asc" ? a - b : b - a;
    });

    let html = "<table>";

    /* =======================
       HEADER ROW 1 (GROUPS)
       ======================= */
    html += "<thead><tr>";
    html += "<th colspan='5'></th>";
    html += `<th colspan="3" class="group-header">${aField}</th>`;
    html += `<th colspan="3" class="group-header">${bField}</th>`;
    html += "<th></th>";
    html += "</tr>";

    /* =======================
       HEADER ROW 2 (COLUMNS)
       ======================= */
    html += "<tr>";
    for (const c of columns) {
        if (c.key === "__rownum__") {
            html += `<th>${c.label}</th>`;
            continue;
        }

        const arrow =
            tableSort.key === c.key
                ? (tableSort.dir === "asc" ? "▲" : "▼")
                : "↕";

        html += `
            <th>
                ${c.label}
                <button class="sort-btn" data-key="${c.key}">${arrow}</button>
            </th>
        `;
    }
    html += "</tr></thead><tbody>";

    /* =======================
       TABLE BODY
       ======================= */
    rows.forEach((r, idx) => {
        const isSelected = r.key === selectedKey;

        html += `
            <tr class="${isSelected ? "selected-row" : ""}"
                data-continent="${r.continent}"
                data-country="${r.country}"
                data-state="${r.state !== "-" ? r.state : ""}">
        `;

        for (const c of columns) {
            if (c.key === "__rownum__") {
                html += `<td class="center">${idx + 1}</td>`;
                continue;
            }

            const cls = getCellClass(isSelected, c.key);
            let val = r[c.key];

            if (c.key.endsWith("Pct") || c.key === "ratio") {
                val = fmtFixed2(val);
            } else if (typeof val === "number") {
                val = fmtInt(val);
            } else if (val == null || val === "") {
                val = "-";
            }

            html += `<td class="center ${cls}">${val}</td>`;
        }

        html += "</tr>";
    });

    html += "</tbody></table>";

    /* =======================
       INJECT INTO DOM
       ======================= */
    container.innerHTML = html;

    /* =======================
       ATTACH HANDLERS
       ======================= */
    attachTableRowHandlers();

    container.querySelectorAll(".sort-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.key;
            if (tableSort.key === key) {
                tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
            } else {
                tableSort.key = key;
                tableSort.dir = "desc";
            }
            updateTable();
        });
    });
}

function buildChartDataTable() {
    return buildTimeSeries().map(r => ({
        timestamp: r.timestamp,
        year: r.year,
        month: r.date ? r.date.getMonth() + 1 : null,
        day: r.date ? r.date.getDate() : null,
        aVal: r.aVal,
        bVal: r.bVal,
        ratio: r.ratio
    }));
}

function renderChartDataTable(rows) {
    const container = document.getElementById("stats");
    if (!container) return;

    const selA = document.getElementById("seriesA").value;
    const selB = document.getElementById("seriesB").value;

    let html = `
        <table class="chart-data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>${selA}</th>
                    <th>${selB}</th>
                    <th>${selA} per ${selB}</th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(r => {
        const dateText = formatTimestampToLongDate(r.timestamp);

        html += `
            <tr>
                <td>${dateText}</td>
                <td>${r.aVal != null ? r.aVal.toLocaleString() : "-"}</td>
                <td>${r.bVal != null ? r.bVal.toLocaleString() : "-"}</td>
                <td>${r.ratio != null ? r.ratio.toFixed(2) : "-"}</td>
            </tr>
        `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

function copyVisibleTableToClipboard() {
    const table = document.querySelector("#stats table");
    if (!table) {
        alert("No table to copy.");
        return;
    }

    let output = [];

    // ---- headers ----
    const headerRows = table.querySelectorAll("thead tr");
    headerRows.forEach(tr => {
        const cells = [...tr.querySelectorAll("th")];
        const row = cells.map(c =>
            c.innerText.replace(/\s+/g, " ").trim()
        );
        output.push(row.join("\t"));
    });

    // ---- body ----
    const bodyRows = table.querySelectorAll("tbody tr");
    bodyRows.forEach(tr => {
        const cells = [...tr.querySelectorAll("td")];
        const row = cells.map(c =>
            c.innerText.replace(/\s+/g, " ").trim()
        );
        output.push(row.join("\t"));
    });

    const text = output.join("\n");

    navigator.clipboard.writeText(text)
        .then(() => {
            flashCopySuccess();
        })
        .catch(err => {
            console.error(err);
            alert("Failed to copy table to clipboard.");
        });
}

function flashCopySuccess() {
    const btn = document.getElementById("copy-table-btn");
    if (!btn) return;

    const original = btn.innerText;
    btn.innerText = "✓ Copied";
    btn.disabled = true;

    setTimeout(() => {
        btn.innerText = original;
        btn.disabled = false;
    }, 1200);
}

/*************************************************************
 *  Public entry point
 *************************************************************/

function updateTable() {
    if (activeTableTab === "comparison") {
		const tableData = buildTableData();
		renderStatsTable(tableData);
    } else {
        const rows = buildChartDataTable();
        renderChartDataTable(rows);
    }

    updateTableHintVisibility();
}


document.addEventListener("click", (e) => {
    const btn = e.target.closest(".table-tab");
    if (!btn) return;

    document.querySelectorAll(".table-tab").forEach(b =>
        b.classList.toggle("active", b === btn)
    );

    activeTableTab = btn.dataset.tab;
    updateTable();
    updateTableHintVisibility();
});


document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("copy-table-btn");
    if (btn) {
        btn.addEventListener("click", copyVisibleTableToClipboard);
    }

    updateTableHintVisibility(); // ensure correct initial state
});