/**
 * Street Evaluation & Hotspot Rankings Controller
 */
class StreetStatsController {
  constructor() {
    this.streetData = [];
  }

  init() {
    // Initialized
  }

  setData(data) {
    this.streetData = data || [];
    this.render();
  }

  render() {
    const container = document.getElementById("street-ranking-container");
    if (!container) return;
    container.innerHTML = "";

    if (this.streetData.length === 0) {
      container.innerHTML = `<p style="color:#64748b; font-size:13px; text-align:center; padding:1.5rem;">Keine straßenbezogenen Daten verfügbar.</p>`;
      return;
    }

    this.streetData.forEach((st, idx) => {
      const card = document.createElement("div");
      card.className = "street-rank-card";
      const levelClass = st.risk_level ? `badge-${st.risk_level}` : "badge-green";

      card.innerHTML = `
        <div class="street-info">
          <div class="street-rank-num">#${idx + 1}</div>
          <div>
            <div class="street-name">${st.street}</div>
            <div class="street-sub">
              ${st.measurement_count} Messungen | Max: ${st.max_pm2_5} µg/m³ | 🌡️ ${st.avg_temperature}°C
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:#94a3b8;">Ø PM2.5</div>
            <div style="font-weight:700; font-size:1rem; color:#f8fafc;">${st.avg_pm2_5} <span style="font-size:11px; color:#64748b;">µg/m³</span></div>
          </div>
          <span class="badge ${levelClass}" style="min-width:65px;">${st.risk_level.toUpperCase()}</span>
        </div>
      `;

      // Click on street rank card -> filter on map and switch to map tab!
      card.addEventListener("click", () => {
        if (window.App && typeof window.App.filterByStreet === "function") {
          window.App.filterByStreet(st.street);
        }
      });

      container.appendChild(card);
    });
  }
}

window.StreetStatsCtrl = new StreetStatsController();
