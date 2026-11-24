/**
 * Measurements Table & Detail Modal Controller
 */
class TableController {
  constructor() {
    this.measurements = [];
    this.filtered = [];
    this.currentPage = 1;
    this.pageSize = 15;
    this.sortColumn = "timestamp";
    this.sortAsc = false;
    this.searchQuery = "";
    this.levelFilter = "all";
  }

  init() {
    this.setupListeners();
  }

  setupListeners() {
    const searchInput = document.getElementById("table-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.applyFilterAndRender();
      });
    }

    const levelSelect = document.getElementById("table-level-filter");
    if (levelSelect) {
      levelSelect.addEventListener("change", (e) => {
        this.levelFilter = e.target.value;
        this.applyFilterAndRender();
      });
    }

    const pageSizeSelect = document.getElementById("table-page-size");
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener("change", (e) => {
        this.pageSize = parseInt(e.target.value, 10);
        this.currentPage = 1;
        this.render();
      });
    }

    const prevBtn = document.getElementById("table-prev-page");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.render();
        }
      });
    }

    const nextBtn = document.getElementById("table-next-page");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const totalPages = Math.ceil(this.filtered.length / this.pageSize);
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.render();
        }
      });
    }

    // Export buttons
    const exportCsvBtn = document.getElementById("btn-export-csv");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => this.exportCSV());
    }

    const exportJsonBtn = document.getElementById("btn-export-json");
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener("click", () => this.exportJSON());
    }

    // Table sorting listeners
    document.querySelectorAll("table.data-table th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.getAttribute("data-sort");
        if (this.sortColumn === col) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortColumn = col;
          this.sortAsc = false;
        }
        this.sortAndRender();
      });
    });

    // Close modal listener
    const modalClose = document.getElementById("detail-modal-close");
    const modalBackdrop = document.getElementById("detail-modal-backdrop");
    if (modalClose && modalBackdrop) {
      modalClose.addEventListener("click", () => modalBackdrop.classList.remove("open"));
      modalBackdrop.addEventListener("click", (e) => {
        if (e.target === modalBackdrop) modalBackdrop.classList.remove("open");
      });
    }
  }

  setMeasurements(data) {
    this.measurements = data.slice();
    this.applyFilterAndRender();
  }

  addSingleMeasurement(meas) {
    this.measurements.unshift(meas);
    this.applyFilterAndRender();
  }

  applyFilterAndRender() {
    this.filtered = this.measurements.filter(m => {
      // Search text match
      const textMatch = !this.searchQuery ||
        (m.robot_id && m.robot_id.toLowerCase().includes(this.searchQuery)) ||
        (m.street && m.street.toLowerCase().includes(this.searchQuery));

      // Level match
      const levelMatch = (this.levelFilter === "all") || (m.level === this.levelFilter);

      return textMatch && levelMatch;
    });

    this.sortAndRender();
  }

  sortAndRender() {
    this.filtered.sort((a, b) => {
      let valA = a[this.sortColumn];
      let valB = b[this.sortColumn];

      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      if (typeof valA === "string") {
        return this.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return this.sortAsc ? valA - valB : valB - valA;
      }
    });

    this.render();
  }

  render() {
    const tbody = document.getElementById("measurements-table-body");
    const pageInfo = document.getElementById("table-page-info");
    const prevBtn = document.getElementById("table-prev-page");
    const nextBtn = document.getElementById("table-next-page");

    if (!tbody) return;
    tbody.innerHTML = "";

    const totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pageItems = this.filtered.slice(startIdx, startIdx + this.pageSize);

    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem; color:#64748b;">Keine Messungen gefunden</td></tr>`;
    } else {
      pageItems.forEach(m => {
        const tr = document.createElement("tr");
        const formattedDate = new Date(m.timestamp).toLocaleString("de-DE", {
          day: "2-digit", month: "2-digit", year: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        });

        const levelClass = m.level ? `badge-${m.level}` : "badge-green";

        tr.innerHTML = `
          <td><strong>#${m.id}</strong></td>
          <td style="color:#94a3b8; font-size:12px;">${formattedDate}</td>
          <td><span style="color:#38bdf8; font-weight:600;">🤖 ${m.robot_id}</span></td>
          <td>📍 ${m.street || 'Unbekannt'}</td>
          <td><span class="badge ${levelClass}">${m.pm2_5} µg/m³</span></td>
          <td>${m.pm10_0} µg/m³</td>
          <td>${m.temperature}°C</td>
          <td>${m.humidity}%</td>
          <td>${m.pressure} hPa</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.TableCtrl.showDetail(${m.id})">
              Details
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    if (pageInfo) {
      pageInfo.textContent = `Seite ${this.currentPage} von ${totalPages} (${this.filtered.length} Messungen)`;
    }
    if (prevBtn) prevBtn.disabled = (this.currentPage <= 1);
    if (nextBtn) nextBtn.disabled = (this.currentPage >= totalPages);
  }

  showDetail(id) {
    const item = this.measurements.find(m => m.id === id);
    if (!item) return;

    const modalBackdrop = document.getElementById("detail-modal-backdrop");
    const container = document.getElementById("detail-modal-content");
    if (!modalBackdrop || !container) return;

    const formattedDate = new Date(item.timestamp).toLocaleString("de-DE", {
      dateStyle: "full", timeStyle: "medium"
    });

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
        <div>
          <h2 style="font-size:1.2rem; color:#38bdf8;">Messung #${item.id}</h2>
          <span style="font-size:0.85rem; color:#94a3b8;">${formattedDate}</span>
        </div>
        <span class="badge badge-${item.level || 'green'}" style="font-size:0.9rem; padding:4px 12px;">
          ${item.pm2_5} µg/m³ PM2.5
        </span>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Roboter</div>
          <div class="detail-value">🤖 ${item.robot_id}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Straße / Ort</div>
          <div class="detail-value">📍 ${item.street || 'Unbekannt'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">GPS-Koordinaten</div>
          <div class="detail-value" style="font-size:0.85rem; font-family:monospace;">
            ${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Feinstaub PM1.0</div>
          <div class="detail-value" style="color:#38bdf8;">${item.pm1_0} µg/m³</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Feinstaub PM2.5</div>
          <div class="detail-value" style="color:#eab308;">${item.pm2_5} µg/m³</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Feinstaub PM4.0</div>
          <div class="detail-value" style="color:#f97316;">${item.pm4_0} µg/m³</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Feinstaub PM10.0</div>
          <div class="detail-value" style="color:#ef4444;">${item.pm10_0} µg/m³</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Temperatur</div>
          <div class="detail-value">🌡️ ${item.temperature} °C</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Luftfeuchtigkeit</div>
          <div class="detail-value">💧 ${item.humidity} %</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Luftdruck</div>
          <div class="detail-value">⏲️ ${item.pressure} hPa</div>
        </div>
      </div>
    `;

    modalBackdrop.classList.add("open");
  }

  exportCSV() {
    if (this.filtered.length === 0) {
      alert("Keine Daten zum Exportieren vorhanden.");
      return;
    }
    const headers = ["ID", "Robot_ID", "Latitude", "Longitude", "Street", "PM1_0", "PM2_5", "PM4_0", "PM10_0", "Temperature", "Humidity", "Pressure", "Timestamp", "RiskLevel"];
    const rows = this.filtered.map(m => [
      m.id,
      `"${m.robot_id}"`,
      m.latitude,
      m.longitude,
      `"${(m.street || '').replace(/"/g, '""')}"`,
      m.pm1_0,
      m.pm2_5,
      m.pm4_0,
      m.pm10_0,
      m.temperature,
      m.humidity,
      m.pressure,
      `"${m.timestamp}"`,
      m.level
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `feinstaub_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportJSON() {
    if (this.filtered.length === 0) {
      alert("Keine Daten zum Exportieren vorhanden.");
      return;
    }
    const jsonStr = JSON.stringify(this.filtered, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `feinstaub_export_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

window.TableCtrl = new TableController();
