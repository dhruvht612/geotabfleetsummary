/**
 * Fleet Summary — Geotab Custom Page Add-In
 * ─────────────────────────────────────────
 * Shows a live summary of all vehicles in the account:
 *   • Stat cards: total vehicles, active (driving), idle, stopped
 *   • Vehicle table: name, serial, live status, speed, last-seen time
 *   • Search filter by vehicle name or serial number
 *   • "View on map" button per vehicle using state.gotoPage()
 *   • Refresh button re-runs the data fetch without a page reload
 *
 * API objects used:
 *   • DeviceStatusInfo — live status for every vehicle (speed, driving state, lat/lng, dateTime)
 *   • Device          — vehicle names and serial numbers
 *
 * Lifecycle:
 *   initialize → store api reference, wire up UI events, call callback()
 *   focus      → fetch data, render stats + table
 *   blur       → nothing needed (read-only add-in, no state to save)
 */

geotab.addin.fleetSummary = function (api, state) {

  // ── DOM refs ───────────────────────────────────────────────────
  const statsGrid    = document.getElementById("statsGrid");
  const tableSection = document.getElementById("tableSection");
  const vehicleBody  = document.getElementById("vehicleBody");
  const vehicleCount = document.getElementById("vehicleCount");
  const searchInput  = document.getElementById("searchInput");
  const refreshBtn   = document.getElementById("refreshBtn");
  const errorBox     = document.getElementById("errorBox");
  const lastUpdated  = document.getElementById("lastUpdated");
  const noResults    = document.getElementById("noResults");

  // ── Module-level state ─────────────────────────────────────────
  let _api       = null;   // stored api reference
  let _allRows   = [];     // full vehicle dataset for client-side search

  // ── Helper: show an error message ─────────────────────────────
  function showError(message) {
    errorBox.textContent = "⚠ " + message;
    errorBox.style.display = "block";
  }

  function clearError() {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  }

  // ── Helper: show loading state ─────────────────────────────────
  function showLoading() {
    statsGrid.innerHTML = `
      <div class="state-box" style="grid-column:1/-1">
        <div class="spinner" role="status" aria-label="Loading fleet data"></div>
        <p>Loading fleet data…</p>
      </div>`;
    tableSection.style.display = "none";
    refreshBtn.disabled = true;
  }

  // ── Helper: format a date as "today at HH:MM" or "Mon DD HH:MM"
  function formatTime(dateStr) {
    if (!dateStr) return "—";
    const d    = new Date(dateStr);
    const now  = new Date();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const sameDay =
      d.getDate()     === now.getDate()  &&
      d.getMonth()    === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) return "Today " + time;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
  }

  // ── Helper: derive a simple status from DeviceStatusInfo ──────
  //   isDeviceCommunicating  true = device recently sent data
  //   currentStateDuration   seconds in current state
  //   speed                  km/h
  function getStatus(info) {
    if (!info.isDeviceCommunicating) return { label: "No signal", cls: "badge-stopped" };
    const speed = info.speed || 0;
    if (speed > 2)  return { label: "Driving",  cls: "badge-active"  };
    if (info.currentStateDuration !== undefined && info.currentStateDuration < 600 && speed <= 2) {
      // Stopped for less than 10 minutes with ignition likely still on
      return { label: "Idle",     cls: "badge-idle"    };
    }
    return { label: "Stopped",  cls: "badge-stopped" };
  }

  // ── Render stat cards ─────────────────────────────────────────
  function renderStats(rows) {
    const total   = rows.length;
    const driving = rows.filter(r => r.status.label === "Driving").length;
    const idle    = rows.filter(r => r.status.label === "Idle").length;
    const stopped = rows.filter(r => ["Stopped","No signal"].includes(r.status.label)).length;

    statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total vehicles</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Driving now</div>
        <div class="stat-value">${driving}</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-label">Idle</div>
        <div class="stat-value">${idle}</div>
      </div>
      <div class="stat-card gray">
        <div class="stat-label">Stopped / offline</div>
        <div class="stat-value">${stopped}</div>
      </div>`;
  }

  // ── Render one table row ───────────────────────────────────────
  function rowHTML(row) {
    const speed = (row.info.speed && row.info.speed > 2)
      ? Math.round(row.info.speed) + " km/h"
      : "—";

    return `
      <tr data-search="${(row.name + " " + row.serial).toLowerCase()}">
        <td>
          <div class="vehicle-name">${escapeHTML(row.name)}</div>
          <div class="vehicle-serial">${escapeHTML(row.serial)}</div>
        </td>
        <td><span class="badge ${row.status.cls}">${row.status.label}</span></td>
        <td>${speed}</td>
        <td>${formatTime(row.info.dateTime)}</td>
        <td>
          <button
            class="map-link"
            data-device-id="${escapeHTML(row.id)}"
            aria-label="View ${escapeHTML(row.name)} on map"
          >View on map →</button>
        </td>
      </tr>`;
  }

  // ── Render the full vehicle table ─────────────────────────────
  function renderTable(rows) {
    vehicleCount.textContent = rows.length;
    vehicleBody.innerHTML    = rows.map(rowHTML).join("");
    tableSection.style.display = "block";

    // Attach map-link click handlers
    vehicleBody.querySelectorAll(".map-link").forEach(btn => {
      btn.addEventListener("click", () => {
        state.gotoPage("map", { liveVehicleIds: [btn.dataset.deviceId] });
      });
    });
  }

  // ── Client-side search filter ─────────────────────────────────
  function applyFilter(query) {
    const q = query.toLowerCase().trim();
    vehicleBody.querySelectorAll("tr").forEach(tr => {
      const match = !q || tr.dataset.search.includes(q);
      tr.style.display = match ? "" : "none";
    });

    // Show/hide "no results" message
    const visible = [...vehicleBody.querySelectorAll("tr")]
      .filter(tr => tr.style.display !== "none");
    noResults.style.display = visible.length === 0 ? "block" : "none";
  }

  // ── Escape HTML to avoid XSS ──────────────────────────────────
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Main data fetch + render ───────────────────────────────────
  function loadData() {
    clearError();
    showLoading();

    // Batch both calls into a single multiCall round trip
    _api.multiCall(
      [
        // Call 1: Get all devices (vehicles) — name + serial number
        ["Get", { typeName: "Device", resultsLimit: 500 }],

        // Call 2: Get live status for all devices
        // DeviceStatusInfo gives us: speed, isDeviceCommunicating, dateTime, currentStateDuration
        ["Get", { typeName: "DeviceStatusInfo" }],
      ],
      function (results) {
        const devices    = results[0] || [];
        const statusList = results[1] || [];

        // Index DeviceStatusInfo by device ID for fast lookup
        const statusById = {};
        statusList.forEach(s => {
          if (s.device && s.device.id) statusById[s.device.id] = s;
        });

        // Build a merged row per vehicle
        _allRows = devices
          .filter(d => d.id && d.name && !d.name.startsWith("*"))  // skip archived devices
          .map(d => {
            const info   = statusById[d.id] || {};
            const status = getStatus(info);
            return {
              id:     d.id,
              name:   d.name,
              serial: d.serialNumber || "—",
              info,
              status,
            };
          })
          // Sort: driving first, then idle, then stopped
          .sort((a, b) => {
            const order = { "Driving": 0, "Idle": 1, "Stopped": 2, "No signal": 3 };
            return (order[a.status.label] ?? 4) - (order[b.status.label] ?? 4);
          });

        renderStats(_allRows);
        renderTable(_allRows);
        applyFilter(searchInput.value);

        lastUpdated.textContent = "Last updated: " + new Date().toLocaleTimeString();
        refreshBtn.disabled = false;
      },
      function (err) {
        showError("Could not load fleet data. " + (err.message || err));
        statsGrid.innerHTML = "";
        refreshBtn.disabled = false;
      }
    );
  }

  // ── Geotab lifecycle ───────────────────────────────────────────
  return {

    initialize(api, state, callback) {
      _api = api;

      // Wire up search input
      searchInput.addEventListener("input", () => applyFilter(searchInput.value));

      // Wire up refresh button
      refreshBtn.addEventListener("click", loadData);

      // Done — tell Geotab to call focus()
      callback();
    },

    focus(api, state) {
      // Re-fetch data every time the user navigates to this page
      // (also fires when the org filter changes)
      loadData();
    },

    blur(api, state) {
      // Nothing to save — this is a read-only dashboard
    },

  };
};
