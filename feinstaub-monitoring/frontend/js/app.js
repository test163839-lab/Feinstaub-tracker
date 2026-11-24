/**
 * Main Application Controller & State Orchestrator
 */
class MainApp {
  constructor() {
    this.currentTab = "map";
    this.allMeasurements = [];
    this.summary = {};
    this.settings = {};
    this.activeFilters = {};
    this.isSimulatorRunning = false;
  }

  async init() {
    console.log("Initialisiere Feinstaub-Monitoring-Dashboard...");

    // Setup navigation tabs
    this.setupNavigation();

    // Setup filter listeners
    this.setupFilters();

    // Setup header actions (simulator toggle, test data seed)
    this.setupHeaderActions();

    // Setup settings form
    this.setupSettingsForm();

    // Initialize sub-controllers
    if (window.MapCtrl) window.MapCtrl.init();
    if (window.ChartsCtrl) window.ChartsCtrl.init();
    if (window.TableCtrl) window.TableCtrl.init();
    if (window.WSClient) window.WSClient.init();

    // Load initial data
    await this.loadConfig();
    await this.refreshAllData();
    await this.checkSimulatorStatus();

    setTimeout(() => {
      if (window.MapCtrl?.map) {
        window.MapCtrl.map.invalidateSize();
        window.MapCtrl.fitToPoints();
      }
    }, 200);

    // Auto-refresh summary every 15 seconds if WebSocket drops
    setInterval(() => this.loadSummary(), 15000);
  }

  setupNavigation() {
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-tab");
        this.switchTab(target);
      });
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll(".nav-tab").forEach(t => {
      if (t.getAttribute("data-tab") === tabId) {
        t.classList.add("active");
      } else {
        t.classList.remove("active");
      }
    });

    document.querySelectorAll(".tab-pane").forEach(pane => {
      if (pane.id === `tab-${tabId}`) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });

    // Invalidate Leaflet map size when map tab becomes visible
    if (tabId === "map" && window.MapCtrl && window.MapCtrl.map) {
      setTimeout(() => {
        window.MapCtrl.map.invalidateSize();
        window.MapCtrl.fitToPoints();
      }, 150);
    }
  }

  setupHeaderActions() {
    const simBtn = document.getElementById("btn-toggle-simulator");
    if (simBtn) {
      simBtn.addEventListener("click", () => this.toggleSimulator());
    }

    const seedBtn = document.getElementById("btn-seed-testdata");
    if (seedBtn) {
      seedBtn.addEventListener("click", () => this.generateTestData());
    }

    // Clear database button (Direct in-place reset without reloading the page)
    const clearBtn = document.getElementById("btn-clear-database");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        try {
          const resp = await fetch("/api/messungen", { method: "DELETE" });
          if (resp.ok) {
            this.allMeasurements = [];
            this.summary = {
              total_measurements: 0,
              avg_pm2_5: 0,
              min_pm2_5: 0,
              max_pm2_5: 0,
              avg_temperature: 0,
              avg_humidity: 0,
              avg_pressure: 0,
              robot_count: 0,
              active_robots: [],
              last_update: null
            };
            if (window.MapCtrl) window.MapCtrl.setMeasurements([]);
            if (window.ChartsCtrl) window.ChartsCtrl.updateCharts([]);
            if (window.TableCtrl) window.TableCtrl.setMeasurements([]);
            if (window.StreetStatsCtrl) window.StreetStatsCtrl.setData([]);
            this.renderSummaryKPIs();
            const emptyHint = document.getElementById("empty-data-hint");
            if (emptyHint) emptyHint.style.display = "block";
            this.showToast("Datenbank geleert (0 Messungen)", "success");
          }
        } catch (e) {
          this.showToast("Fehler beim Leeren der Daten", "error");
        }
      });
    }

    // Mobile sidebar toggle button
    const mobileToggle = document.getElementById("btn-toggle-mobile-sidebar");
    const sidebar = document.getElementById("map-sidebar");
    if (mobileToggle && sidebar) {
      mobileToggle.addEventListener("click", () => {
        sidebar.classList.toggle("mobile-open");
      });
    }

    // Multi sample seed buttons (Header & Sidebar)
    const handleMultiSeed = async () => {
      try {
        const resp = await fetch("/api/testdaten/generate?count_per_robot=25&clear_existing=false", { method: "POST" });
        if (resp.ok) {
          const data = await resp.json();
          this.showToast("25 Testmessungen erfolgreich hinzugefügt!", "success");
          await this.refreshAllData();
          if (window.MapCtrl) window.MapCtrl.fitToPoints();
        }
      } catch (e) {
        this.showToast("Fehler beim Erzeugen der Testdaten", "error");
      }
    };

    const multiSeedHeader = document.getElementById("btn-seed-multi-sample");
    if (multiSeedHeader) multiSeedHeader.addEventListener("click", handleMultiSeed);

    const multiSeedSide = document.getElementById("btn-seed-multi-sample-side");
    if (multiSeedSide) multiSeedSide.addEventListener("click", handleMultiSeed);
  }

  setupFilters() {
    const applyBtn = document.getElementById("filter-apply-btn");
    const resetBtn = document.getElementById("filter-reset-btn");

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.activeFilters = {
          robot_id: document.getElementById("filter-robot-select")?.value || "",
          start_date: document.getElementById("filter-date-start")?.value || "",
          end_date: document.getElementById("filter-date-end")?.value || "",
          start_time: document.getElementById("filter-time-start")?.value || "",
          end_time: document.getElementById("filter-time-end")?.value || "",
          min_pm2_5: document.getElementById("filter-pm-min")?.value || "",
          max_pm2_5: document.getElementById("filter-pm-max")?.value || "",
          street: document.getElementById("filter-street-input")?.value || ""
        };
        this.refreshMeasurements();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        document.querySelectorAll(".filter-grid input, .filter-grid select").forEach(el => el.value = "");
        this.activeFilters = {};
        this.refreshMeasurements();
      });
    }
  }

  setupSettingsForm() {
    const form = document.getElementById("settings-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
          pm2_5_green_max: parseFloat(document.getElementById("cfg-green-max").value),
          pm2_5_yellow_max: parseFloat(document.getElementById("cfg-yellow-max").value),
          pm2_5_orange_max: parseFloat(document.getElementById("cfg-orange-max").value),
          require_api_key: document.getElementById("cfg-require-auth").checked,
          api_key: document.getElementById("cfg-api-key").value
        };

        try {
          const resp = await fetch("/api/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (resp.ok) {
            const data = await resp.json();
            this.settings = data.settings;
            if (window.MapCtrl) window.MapCtrl.updateThresholds(this.settings);
            this.showToast("Grenzwerte erfolgreich aktualisiert!", "success");
            this.refreshMeasurements();
          } else {
            this.showToast("Fehler beim Speichern der Konfiguration", "error");
          }
        } catch (err) {
          this.showToast("Netzwerkfehler beim Speichern", "error");
        }
      });
    }
  }

  async loadConfig() {
    try {
      const resp = await fetch("/api/config");
      if (resp.ok) {
        this.settings = await resp.json();
        // Populate settings form
        if (document.getElementById("cfg-green-max")) {
          document.getElementById("cfg-green-max").value = this.settings.pm2_5_green_max;
          document.getElementById("cfg-yellow-max").value = this.settings.pm2_5_yellow_max;
          document.getElementById("cfg-orange-max").value = this.settings.pm2_5_orange_max;
          document.getElementById("cfg-require-auth").checked = !!this.settings.require_api_key;
          document.getElementById("cfg-api-key").value = this.settings.api_key || "";
        }
        if (window.MapCtrl) window.MapCtrl.updateThresholds(this.settings);
      }
    } catch (e) {
      console.warn("Konnte Konfiguration nicht laden:", e);
    }
  }

  async refreshAllData() {
    await Promise.all([
      this.refreshMeasurements(),
      this.loadSummary(),
      this.loadStreetStats()
    ]);
  }

  async refreshMeasurements() {
    try {
      // Build query string from activeFilters
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(this.activeFilters)) {
        if (v !== "" && v !== null && v !== undefined) {
          params.append(k, v);
        }
      }
      params.append("limit", "2500");

      const resp = await fetch(`/api/messungen?${params.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        this.allMeasurements = data.measurements || [];

        // Distribute to sub-controllers
        if (window.MapCtrl) window.MapCtrl.setMeasurements(this.allMeasurements);
        if (window.ChartsCtrl) window.ChartsCtrl.updateCharts(this.allMeasurements);
        if (window.TableCtrl) window.TableCtrl.setMeasurements(this.allMeasurements);

        // Show/hide empty state callout
        const emptyHint = document.getElementById("empty-data-hint");
        if (emptyHint) {
          emptyHint.style.display = (this.allMeasurements.length === 0) ? "block" : "none";
        }

        // Update robot filter dropdown options
        this.updateRobotDropdown();
      }
    } catch (e) {
      console.error("Fehler beim Laden der Messungen:", e);
    }
  }

  async loadSummary() {
    try {
      const resp = await fetch("/api/messungen/summary");
      if (resp.ok) {
        this.summary = await resp.json();
        this.renderSummaryKPIs();
      }
    } catch (e) {
      console.warn("Fehler beim Abruf der Zusammenfassung:", e);
    }
  }

  async loadStreetStats() {
    try {
      const resp = await fetch("/api/messungen/streets?min_measurements=1");
      if (resp.ok) {
        const streets = await resp.json();
        if (window.StreetStatsCtrl) window.StreetStatsCtrl.setData(streets);
      }
    } catch (e) {
      console.warn("Fehler beim Abruf der Straßenstatistiken:", e);
    }
  }

  renderSummaryKPIs() {
    const s = this.summary;
    if (!s) return;

    const fmt = (v) => v != null ? String(v) : "0.0";

    // Desktop Sidebar KPI Cards
    this.setText("kpi-total-count", s.total_measurements || 0);
    this.setText("kpi-avg-pm25", fmt(s.avg_pm2_5));
    this.setText("kpi-minmax-pm25", `${s.min_pm2_5 || 0} / ${s.max_pm2_5 || 0} µg`);
    this.setText("kpi-avg-temp", fmt(s.avg_temperature));
    this.setText("kpi-avg-hum", fmt(s.avg_humidity));
    this.setText("kpi-avg-press", fmt(s.avg_pressure));
    this.setText("kpi-robot-count", s.robot_count || 0);

    // Mobile KPI Chips (synchron)
    this.setText("m-kpi-pm25", fmt(s.avg_pm2_5));
    this.setText("m-kpi-count", s.total_measurements || 0);
    this.setText("m-kpi-temp", fmt(s.avg_temperature));
    this.setText("m-kpi-hum", fmt(s.avg_humidity));
    this.setText("m-kpi-press", fmt(s.avg_pressure));

    if (s.last_update) {
      const d = new Date(s.last_update);
      this.setText("kpi-last-update", d.toLocaleTimeString("de-DE"));
    }

    // Set KPI PM card color class depending on level
    const pmCard = document.getElementById("kpi-card-pm25");
    if (pmCard && s.avg_pm2_5 !== undefined) {
      pmCard.className = "kpi-card";
      if (s.avg_pm2_5 <= (this.settings.pm2_5_green_max || 10)) {
        pmCard.classList.add("kpi-green");
      } else if (s.avg_pm2_5 <= (this.settings.pm2_5_yellow_max || 25)) {
        pmCard.classList.add("kpi-yellow");
      } else if (s.avg_pm2_5 <= (this.settings.pm2_5_orange_max || 50)) {
        pmCard.classList.add("kpi-orange");
      } else {
        pmCard.classList.add("kpi-red");
      }
    }
  }

  setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  updateRobotDropdown() {
    const select = document.getElementById("filter-robot-select");
    if (!select || !this.summary.active_robots) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Alle Roboter</option>';
    this.summary.active_robots.forEach(botId => {
      const opt = document.createElement("option");
      opt.value = botId;
      opt.textContent = `🤖 ${botId}`;
      select.appendChild(opt);
    });
    select.value = currentVal;
  }

  filterByStreet(streetName) {
    const streetInput = document.getElementById("filter-street-input");
    if (streetInput) {
      streetInput.value = streetName;
      this.activeFilters.street = streetName;
      this.refreshMeasurements();
      this.switchTab("map");
      this.showToast(`Filter aktiviert: ${streetName}`, "info");
    }
  }

  handleNewMeasurement(measurement) {
    // 1. Update sub controllers
    if (window.MapCtrl) window.MapCtrl.addSingleMeasurement(measurement);
    if (window.TableCtrl) window.TableCtrl.addSingleMeasurement(measurement);
    
    // 2. Incremental summary refresh
    this.summary.total_measurements = (this.summary.total_measurements || 0) + 1;
    this.setText("kpi-total-count", this.summary.total_measurements);
    this.setText("kpi-last-update", new Date(measurement.timestamp).toLocaleTimeString("de-DE"));

    // 3. Update charts
    this.allMeasurements.push(measurement);
    if (window.ChartsCtrl) window.ChartsCtrl.updateCharts(this.allMeasurements);
  }

  async checkSimulatorStatus() {
    try {
      const resp = await fetch("/api/simulator/status");
      if (resp.ok) {
        const status = await resp.json();
        this.isSimulatorRunning = status.running;
        this.updateSimulatorButton();
      }
    } catch (e) {}
  }

  async toggleSimulator() {
    try {
      const resp = await fetch("/api/simulator/toggle", { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        this.isSimulatorRunning = data.running;
        this.updateSimulatorButton();
        this.showToast(data.message, data.running ? "success" : "info");
      }
    } catch (e) {
      this.showToast("Fehler beim Umschalten der Simulation", "error");
    }
  }

  updateSimulatorButton() {
    const btn = document.getElementById("btn-toggle-simulator");
    if (!btn) return;
    if (this.isSimulatorRunning) {
      btn.innerHTML = "⏹ Simulation anhalten";
      btn.className = "btn btn-danger btn-sm";
    } else {
      btn.innerHTML = "▶ Live-Roboter starten";
      btn.className = "btn btn-success btn-sm";
    }
  }

  async generateTestData() {
    if (!confirm("Möchtest du neue realistische Testdaten generieren? Die aktuellen Daten werden neu initialisiert.")) {
      return;
    }
    try {
      const resp = await fetch("/api/testdaten/generate?count_per_robot=50&clear_existing=true", { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        this.showToast(data.message, "success");
        await this.refreshAllData();
      }
    } catch (e) {
      this.showToast("Fehler beim Erzeugen der Testdaten", "error");
    }
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";
    if (type === "warning") icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

window.App = new MainApp();

document.addEventListener("DOMContentLoaded", () => {
  window.App.init();

  // ── Touch Swipe Navigation (links/rechts zwischen Tabs) ──
  const TAB_ORDER = ["map", "analytics", "table", "settings", "api-docs"];
  let swipeStartX = 0;
  let swipeStartY = 0;

  const viewport = document.querySelector(".main-viewport");
  if (viewport) {
    viewport.addEventListener("touchstart", (e) => {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    viewport.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - swipeStartX;
      const dy = e.changedTouches[0].clientY - swipeStartY;

      // Nur horizontale Swipes (dx mindestens 60px, und mehr horizontal als vertikal)
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const curIdx = TAB_ORDER.indexOf(window.App.currentTab);
        if (dx < 0 && curIdx < TAB_ORDER.length - 1) {
          // Swipe links → nächster Tab
          window.App.switchTab(TAB_ORDER[curIdx + 1]);
          // Aktiven Nav-Tab markieren
          document.querySelectorAll(".nav-tab").forEach(t => {
            t.classList.toggle("active", t.getAttribute("data-tab") === TAB_ORDER[curIdx + 1]);
          });
        } else if (dx > 0 && curIdx > 0) {
          // Swipe rechts → vorheriger Tab
          window.App.switchTab(TAB_ORDER[curIdx - 1]);
          document.querySelectorAll(".nav-tab").forEach(t => {
            t.classList.toggle("active", t.getAttribute("data-tab") === TAB_ORDER[curIdx - 1]);
          });
        }
      }
    }, { passive: true });
  }

  // ── Karten-Höhe dynamisch an Viewport anpassen (Handy) ──
  function fixMapHeight() {
    const header = document.querySelector("header.app-header");
    const kpiStrip = document.getElementById("mobile-kpi-strip");
    const headerH = header ? header.offsetHeight : 0;
    const stripH = (kpiStrip && window.innerWidth <= 900) ? kpiStrip.offsetHeight : 0;
    const remaining = window.innerHeight - headerH - stripH;

    const mapArea = document.querySelector(".map-container-area");
    if (mapArea && window.innerWidth <= 900) {
      mapArea.style.height = `${Math.max(300, remaining)}px`;
      const leafletMap = document.getElementById("leaflet-map");
      if (leafletMap) leafletMap.style.height = "100%";
      setTimeout(() => {
        if (window.MapCtrl?.map) window.MapCtrl.map.invalidateSize();
      }, 100);
    }
  }

  window.addEventListener("resize", fixMapHeight);
  setTimeout(fixMapHeight, 300);
});
