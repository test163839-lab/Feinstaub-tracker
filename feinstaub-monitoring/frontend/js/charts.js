/**
 * Chart.js Visualizations Controller
 */
class ChartsController {
  constructor() {
    this.pmTimeSeriesChart = null;
    this.pmComparisonChart = null;
    this.tempChart = null;
    this.humidityChart = null;
    this.pressureChart = null;
    this.miniDashboardChart = null;
  }

  init() {
    this.createCharts();
  }

  createCharts() {
    // 1. PM Time Series Chart
    const ctxPM = document.getElementById("chart-pm-timeseries");
    if (ctxPM) {
      this.pmTimeSeriesChart = new Chart(ctxPM, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "PM1.0 (µg/m³)",
              data: [],
              borderColor: "#38bdf8",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 2
            },
            {
              label: "PM2.5 (µg/m³)",
              data: [],
              borderColor: "#eab308",
              backgroundColor: "rgba(234, 179, 8, 0.15)",
              borderWidth: 2.5,
              tension: 0.3,
              pointRadius: 3
            },
            {
              label: "PM4.0 (µg/m³)",
              data: [],
              borderColor: "#f97316",
              backgroundColor: "rgba(249, 115, 22, 0.1)",
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 2
            },
            {
              label: "PM10.0 (µg/m³)",
              data: [],
              borderColor: "#ef4444",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 2
            }
          ]
        },
        options: this.getBaseChartOptions("Feinstaub-Konzentration (µg/m³)")
      });
    }

    // 2. PM Comparison Bar Chart
    const ctxComp = document.getElementById("chart-pm-comparison");
    if (ctxComp) {
      this.pmComparisonChart = new Chart(ctxComp, {
        type: "bar",
        data: {
          labels: ["PM1.0", "PM2.5", "PM4.0", "PM10.0"],
          datasets: [{
            label: "Durchschnittliche Konzentration (µg/m³)",
            data: [0, 0, 0, 0],
            backgroundColor: ["#38bdf8", "#eab308", "#f97316", "#ef4444"],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: "rgba(255, 255, 255, 0.05)" },
              ticks: { color: "#94a3b8" }
            },
            x: {
              grid: { display: false },
              ticks: { color: "#94a3b8" }
            }
          }
        }
      });
    }

    // 3. Temperature Chart
    const ctxTemp = document.getElementById("chart-temperature");
    if (ctxTemp) {
      this.tempChart = new Chart(ctxTemp, {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: "Temperatur (°C)",
            data: [],
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            fill: true,
            tension: 0.35,
            pointRadius: 2
          }]
        },
        options: this.getBaseChartOptions("°C")
      });
    }

    // 4. Humidity Chart
    const ctxHum = document.getElementById("chart-humidity");
    if (ctxHum) {
      this.humidityChart = new Chart(ctxHum, {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: "Luftfeuchtigkeit (%)",
            data: [],
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6, 182, 212, 0.1)",
            fill: true,
            tension: 0.35,
            pointRadius: 2
          }]
        },
        options: this.getBaseChartOptions("%")
      });
    }

    // 5. Pressure Chart
    const ctxPress = document.getElementById("chart-pressure");
    if (ctxPress) {
      this.pressureChart = new Chart(ctxPress, {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: "Luftdruck (hPa)",
            data: [],
            borderColor: "#8b5cf6",
            backgroundColor: "rgba(139, 92, 246, 0.1)",
            fill: true,
            tension: 0.35,
            pointRadius: 2
          }]
        },
        options: this.getBaseChartOptions("hPa")
      });
    }

    // 6. Mini Dashboard Preview Chart
    const ctxMini = document.getElementById("chart-dashboard-mini");
    if (ctxMini) {
      this.miniDashboardChart = new Chart(ctxMini, {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: "PM2.5 Trend",
            data: [],
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.15)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: { display: false }
          }
        }
      });
    }
  }

  getBaseChartOptions(yAxisLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { size: 11 } }
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          borderColor: "#334155",
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#94a3b8", maxTicksLimit: 12, font: { size: 10 } }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.06)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
          title: { display: true, text: yAxisLabel, color: "#64748b", font: { size: 11 } }
        }
      }
    };
  }

  updateCharts(measurements) {
    if (!measurements || measurements.length === 0) return;

    // Sort chronologically
    const sorted = measurements.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Downsample if more than 100 points to keep charts fast
    const sampled = this.downsample(sorted, 80);

    const labels = sampled.map(m => {
      const d = new Date(m.timestamp);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    });

    const pm1 = sampled.map(m => m.pm1_0);
    const pm25 = sampled.map(m => m.pm2_5);
    const pm4 = sampled.map(m => m.pm4_0);
    const pm10 = sampled.map(m => m.pm10_0);
    const temps = sampled.map(m => m.temperature);
    const hums = sampled.map(m => m.humidity);
    const presses = sampled.map(m => m.pressure);

    // Update PM Time Series
    if (this.pmTimeSeriesChart) {
      this.pmTimeSeriesChart.data.labels = labels;
      this.pmTimeSeriesChart.data.datasets[0].data = pm1;
      this.pmTimeSeriesChart.data.datasets[1].data = pm25;
      this.pmTimeSeriesChart.data.datasets[2].data = pm4;
      this.pmTimeSeriesChart.data.datasets[3].data = pm10;
      this.pmTimeSeriesChart.update("none");
    }

    // Update PM Comparison Averages
    if (this.pmComparisonChart) {
      const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
      this.pmComparisonChart.data.datasets[0].data = [
        avg(pm1), avg(pm25), avg(pm4), avg(pm10)
      ];
      this.pmComparisonChart.update("none");
    }

    // Update Temperature Chart
    if (this.tempChart) {
      this.tempChart.data.labels = labels;
      this.tempChart.data.datasets[0].data = temps;
      this.tempChart.update("none");
    }

    // Update Humidity Chart
    if (this.humidityChart) {
      this.humidityChart.data.labels = labels;
      this.humidityChart.data.datasets[0].data = hums;
      this.humidityChart.update("none");
    }

    // Update Pressure Chart
    if (this.pressureChart) {
      this.pressureChart.data.labels = labels;
      this.pressureChart.data.datasets[0].data = presses;
      this.pressureChart.update("none");
    }

    // Update Mini Dashboard Sparkline
    if (this.miniDashboardChart) {
      this.miniDashboardChart.data.labels = labels;
      this.miniDashboardChart.data.datasets[0].data = pm25;
      this.miniDashboardChart.update("none");
    }
  }

  downsample(data, maxPoints) {
    if (data.length <= maxPoints) return data;
    const step = data.length / maxPoints;
    const sampled = [];
    for (let i = 0; i < maxPoints; i++) {
      sampled.push(data[Math.floor(i * step)]);
    }
    return sampled;
  }
}

window.ChartsCtrl = new ChartsController();
