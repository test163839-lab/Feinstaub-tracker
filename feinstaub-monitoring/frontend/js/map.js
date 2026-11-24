/**
 * Interactive Leaflet Map Controller
 */
class MapController {
  constructor() {
    this.map = null;
    this.markersLayer = null;
    this.heatmapLayer = null;
    this.routeLayer = null;
    this.allMeasurements = [];
    this.visibleMeasurements = [];
    this.selectedMetric = "pm2_5";
    this.isHeatmapActive = false;
    this.showRoutes = true;
    this.timeSliderActive = false;
    this.animationTimer = null;
    this.bounds = null;
    
    // Dynamic thresholds from settings (defaults)
    this.thresholds = {
      green_max: 10.0,
      yellow_max: 25.0,
      orange_max: 50.0
    };
  }

  init() {
    // Create map instance centered around Berlin default
    this.map = L.map("leaflet-map", {
      center: [52.5200, 13.4050],
      zoom: 13,
      zoomControl: true
    });

    // Standard OpenStreetMap Tile Layer (100% kostenlos, kein API-Key erforderlich)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);

    // Layer groups for markers, routes, and heatmap
    this.markersLayer = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);

    // Listeners for UI toolbar
    this.setupListeners();
  }

  setupListeners() {
    const metricSelect = document.getElementById("map-metric-select");
    if (metricSelect) {
      metricSelect.addEventListener("change", (e) => {
        this.selectedMetric = e.target.value;
        this.render();
      });
    }

    const viewModeSelect = document.getElementById("map-view-mode");
    if (viewModeSelect) {
      viewModeSelect.addEventListener("change", (e) => {
        this.isHeatmapActive = (e.target.value === "heatmap");
        this.render();
      });
    }

    const routeToggle = document.getElementById("map-toggle-routes");
    if (routeToggle) {
      routeToggle.addEventListener("change", (e) => {
        this.showRoutes = e.target.checked;
        this.renderRoutes();
      });
    }

    const centerBtn = document.getElementById("map-center-btn");
    if (centerBtn) {
      centerBtn.addEventListener("click", () => this.fitToPoints());
    }

    const timeSlider = document.getElementById("timeline-slider");
    if (timeSlider) {
      timeSlider.addEventListener("input", (e) => {
        this.handleTimeSlider(parseInt(e.target.value, 10));
      });
    }

    const playBtn = document.getElementById("timeline-play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", () => this.toggleTimeAnimation());
    }
  }

  updateThresholds(newThresholds) {
    if (newThresholds.pm2_5_green_max !== undefined) this.thresholds.green_max = newThresholds.pm2_5_green_max;
    if (newThresholds.pm2_5_yellow_max !== undefined) this.thresholds.yellow_max = newThresholds.pm2_5_yellow_max;
    if (newThresholds.pm2_5_orange_max !== undefined) this.thresholds.orange_max = newThresholds.pm2_5_orange_max;
    this.render();
  }

  getColorForValue(val) {
    if (val <= this.thresholds.green_max) return "#22c55e"; // Green
    if (val <= this.thresholds.yellow_max) return "#eab308"; // Yellow
    if (val <= this.thresholds.orange_max) return "#f97316"; // Orange
    return "#ef4444"; // Red
  }

  getRiskLabel(val) {
    if (val <= this.thresholds.green_max) return "Gut (0–" + this.thresholds.green_max + " µg/m³)";
    if (val <= this.thresholds.yellow_max) return "Mäßig (" + this.thresholds.green_max + "–" + this.thresholds.yellow_max + " µg/m³)";
    if (val <= this.thresholds.orange_max) return "Ungesund (" + this.thresholds.yellow_max + "–" + this.thresholds.orange_max + " µg/m³)";
    return "Sehr hoch / Alarm (> " + this.thresholds.orange_max + " µg/m³)";
  }

  setMeasurements(data) {
    this.allMeasurements = data.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    this.visibleMeasurements = this.allMeasurements.slice();
    this.initTimeSlider();
    this.render();
    if (this.allMeasurements.length > 0) {
      this.fitToPoints();
    }
  }

  addSingleMeasurement(meas) {
    this.allMeasurements.push(meas);
    this.visibleMeasurements.push(meas);
    
    // Add point to map
    if (!this.isHeatmapActive) {
      this.addMarker(meas);
    } else {
      this.renderHeatmap();
    }
    
    if (this.showRoutes) {
      this.renderRoutes();
    }
  }

  render() {
    this.markersLayer.clearLayers();
    if (this.heatmapLayer) {
      this.map.removeLayer(this.heatmapLayer);
      this.heatmapLayer = null;
    }

    if (this.isHeatmapActive) {
      this.renderHeatmap();
    } else {
      this.renderMarkers();
    }

    if (this.showRoutes) {
      this.renderRoutes();
    } else {
      this.routeLayer.clearLayers();
    }
  }

  renderMarkers() {
    this.markersLayer.clearLayers();
    const latLngs = [];

    this.visibleMeasurements.forEach(m => {
      this.addMarker(m);
      latLngs.push([m.latitude, m.longitude]);
    });

    if (latLngs.length > 0) {
      this.bounds = L.latLngBounds(latLngs);
    }
  }

  addMarker(m) {
    const val = m[this.selectedMetric] !== undefined ? m[this.selectedMetric] : m.pm2_5;
    const color = this.getColorForValue(val);

    const marker = L.circleMarker([m.latitude, m.longitude], {
      radius: 7,
      fillColor: color,
      color: "#ffffff",
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.85
    });

    // Popup content with rich formatting
    const formattedDate = new Date(m.timestamp).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    const popupHtml = `
      <div style="font-family: inherit; font-size: 13px; min-width: 230px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:6px; margin-bottom:8px;">
          <strong style="color:#38bdf8; font-size:14px;">🤖 ${m.robot_id}</strong>
          <span style="background:${color}33; color:${color}; font-weight:700; padding:2px 8px; border-radius:12px; font-size:11px; border:1px solid ${color}66;">
            ${val} µg/m³
          </span>
        </div>
        <div style="color:#cbd5e1; margin-bottom:6px;">📍 <strong>${m.street || 'Unbekannte Straße'}</strong></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; background:#0f172a; padding:8px; border-radius:6px; margin-bottom:8px; font-size:12px;">
          <div>PM1.0: <strong>${m.pm1_0} µg</strong></div>
          <div>PM2.5: <strong style="color:${color};">${m.pm2_5} µg</strong></div>
          <div>PM4.0: <strong>${m.pm4_0} µg</strong></div>
          <div>PM10.0: <strong>${m.pm10_0} µg</strong></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; font-size:11px; color:#94a3b8; text-align:center; margin-bottom:8px;">
          <div style="background:#1e293b; padding:4px; border-radius:4px;">🌡️ ${m.temperature}°C</div>
          <div style="background:#1e293b; padding:4px; border-radius:4px;">💧 ${m.humidity}%</div>
          <div style="background:#1e293b; padding:4px; border-radius:4px;">⏲️ ${m.pressure} hPa</div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#64748b; border-top:1px solid #334155; padding-top:6px;">
          <span>⏱️ ${formattedDate}</span>
          <span>Lat: ${m.latitude.toFixed(4)}, Lon: ${m.longitude.toFixed(4)}</span>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, { maxWidth: 300 });
    marker.addTo(this.markersLayer);
  }

  renderHeatmap() {
    if (typeof L.heatLayer !== "function") {
      console.warn("Leaflet.heat Plugin nicht geladen.");
      return;
    }
    if (this.heatmapLayer) {
      this.map.removeLayer(this.heatmapLayer);
    }

    const heatPoints = this.visibleMeasurements.map(m => {
      const val = m[this.selectedMetric] !== undefined ? m[this.selectedMetric] : m.pm2_5;
      // Normalize intensity: higher PM gives higher intensity (0 to 1)
      const intensity = Math.min(1.0, Math.max(0.2, val / 60.0));
      return [m.latitude, m.longitude, intensity];
    });

    this.heatmapLayer = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 18,
      maxZoom: 17,
      gradient: {
        0.1: "#22c55e",
        0.4: "#eab308",
        0.7: "#f97316",
        1.0: "#ef4444"
      }
    }).addTo(this.map);
  }

  renderRoutes() {
    this.routeLayer.clearLayers();
    if (!this.showRoutes) return;

    // Group measurements by robot_id
    const robots = {};
    this.visibleMeasurements.forEach(m => {
      if (!robots[m.robot_id]) robots[m.robot_id] = [];
      robots[m.robot_id].push([m.latitude, m.longitude]);
    });

    const colors = ["#38bdf8", "#a855f7", "#ec4899", "#14b8a6", "#f59e0b"];
    let idx = 0;
    for (const [botId, latlngs] of Object.entries(robots)) {
      if (latlngs.length >= 2) {
        const polyline = L.polyline(latlngs, {
          color: colors[idx % colors.length],
          weight: 3,
          opacity: 0.6,
          dashArray: "4, 6"
        });
        polyline.bindTooltip(`Route: ${botId}`, { sticky: true });
        polyline.addTo(this.routeLayer);
        idx++;
      }
    }
  }

  fitToPoints() {
    if (this.visibleMeasurements.length === 0) return;
    const latLngs = this.visibleMeasurements.map(m => [m.latitude, m.longitude]);
    const bounds = L.latLngBounds(latLngs);
    this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }

  initTimeSlider() {
    const slider = document.getElementById("timeline-slider");
    const info = document.getElementById("timeline-info");
    if (!slider) return;

    slider.min = 0;
    slider.max = Math.max(0, this.allMeasurements.length - 1);
    slider.value = slider.max;

    if (info && this.allMeasurements.length > 0) {
      const latest = this.allMeasurements[this.allMeasurements.length - 1];
      info.textContent = `${this.allMeasurements.length} Punkte | ${new Date(latest.timestamp).toLocaleTimeString()}`;
    }
  }

  handleTimeSlider(index) {
    if (index >= 0 && index < this.allMeasurements.length) {
      this.visibleMeasurements = this.allMeasurements.slice(0, index + 1);
      const curr = this.allMeasurements[index];
      const info = document.getElementById("timeline-info");
      if (info) {
        info.textContent = `Pkt ${index + 1}/${this.allMeasurements.length} | ${new Date(curr.timestamp).toLocaleTimeString()} (${curr.street || ''})`;
      }
      this.render();
    }
  }

  toggleTimeAnimation() {
    const playBtn = document.getElementById("timeline-play-btn");
    const slider = document.getElementById("timeline-slider");
    if (!slider) return;

    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
      if (playBtn) playBtn.innerHTML = "▶ Play";
    } else {
      if (playBtn) playBtn.innerHTML = "⏸ Pause";
      let curr = parseInt(slider.value, 10);
      if (curr >= this.allMeasurements.length - 1) curr = 0;

      this.animationTimer = setInterval(() => {
        curr++;
        if (curr >= this.allMeasurements.length) {
          clearInterval(this.animationTimer);
          this.animationTimer = null;
          if (playBtn) playBtn.innerHTML = "▶ Play";
          return;
        }
        slider.value = curr;
        this.handleTimeSlider(curr);
      }, 350);
    }
  }
}

window.MapCtrl = new MapController();
