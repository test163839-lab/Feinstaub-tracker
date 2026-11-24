/**
 * WebSocket Real-Time Connection Manager
 */
class WebSocketClient {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;
    this.reconnectInterval = 3000;
    this.pingInterval = null;
    this.statusBadge = null;
    this.statusDot = null;
    this.statusText = null;
  }

  init() {
    this.statusBadge = document.getElementById("ws-status-badge");
    this.statusDot = document.getElementById("ws-pulse-dot");
    this.statusText = document.getElementById("ws-status-text");
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus(true, "Echtzeit aktiv");
        this.startPing();
        console.log("WebSocket verbunden:", wsUrl);
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleMessage(payload);
        } catch (e) {
          // Plain text response like 'pong'
        }
      };

      this.socket.onclose = (event) => {
        this.updateStatus(false, "Verbindung getrennt (Neuverbindung...)");
        this.stopPing();
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn("WebSocket Fehler:", err);
        this.socket.close();
      };
    } catch (e) {
      this.updateStatus(false, "Verbindungsfehler");
      this.scheduleReconnect();
    }
  }

  handleMessage(msg) {
    if (msg.event === "new_measurement") {
      const measurement = msg.data;
      if (window.App && typeof window.App.handleNewMeasurement === "function") {
        window.App.handleNewMeasurement(measurement);
      }
    } else if (msg.event === "batch_measurements") {
      if (window.App && typeof window.App.refreshAllData === "function") {
        window.App.refreshAllData();
      }
    }
  }

  updateStatus(isConnected, text) {
    if (this.statusDot) {
      if (isConnected) {
        this.statusDot.classList.remove("disconnected");
      } else {
        this.statusDot.classList.add("disconnected");
      }
    }
    if (this.statusText) {
      this.statusText.textContent = text;
    }
  }

  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send("ping");
      }
    }, 20000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const timeout = Math.min(10000, this.reconnectInterval * Math.min(this.reconnectAttempts, 3));
      setTimeout(() => this.connect(), timeout);
    }
  }
}

window.WSClient = new WebSocketClient();
