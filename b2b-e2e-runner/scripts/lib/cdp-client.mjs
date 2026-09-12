export class CdpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CdpError";
    Object.assign(this, details);
  }
}

function listen(socket, event, handler) {
  if (typeof socket.addEventListener === "function") socket.addEventListener(event, handler);
  else socket.on(event, handler);
}

export class CdpClient {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();
  #closed = false;

  constructor(socket) {
    this.#socket = socket;
    listen(socket, "message", event => this.#receive(JSON.parse(typeof event === "string" ? event : event.data)));
    listen(socket, "close", () => {
      this.#emit("", "__transport_closed__", { reason: "close" });
      this.#closePending("CDP 连接已关闭");
    });
    listen(socket, "error", error => {
      this.#emit("", "__transport_closed__", { reason: error?.message ?? "error" });
      this.#closePending(`CDP 连接错误：${error?.message ?? "unknown"}`);
    });
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      listen(socket, "open", resolve);
      listen(socket, "error", reject);
    });
    return new CdpClient(socket);
  }

  command(method, params = {}, sessionId) {
    if (this.#closed) return Promise.reject(new CdpError("CDP 连接已关闭", { code: "CDP_CLOSED" }));
    const id = this.#nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new CdpError(`CDP 命令超时：${method}`, { code: "CDP_TIMEOUT" }));
      }, 10_000);
      timeout.unref?.();
      this.#pending.set(id, { resolve, reject, timeout, method });
      this.#socket.send(JSON.stringify(message));
    });
  }

  on(sessionId, method, handler) {
    const key = `${sessionId ?? ""}\0${method}`;
    const handlers = this.#listeners.get(key) ?? new Set();
    handlers.add(handler);
    this.#listeners.set(key, handlers);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) this.#listeners.delete(key);
    };
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#closePending("CDP 连接已关闭");
    try { this.#socket.close(); } catch { /* transport close race */ }
  }

  #receive(message) {
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new CdpError(message.error.message, { code: message.error.code, method: pending.method }));
      else pending.resolve(message.result ?? {});
      return;
    }
    this.#emit(message.sessionId ?? "", message.method, message.params ?? {});
  }

  #emit(sessionId, method, params) {
    const key = `${sessionId}\0${method}`;
    for (const handler of this.#listeners.get(key) ?? []) handler(params);
  }

  #closePending(message) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new CdpError(message));
    }
    this.#pending.clear();
  }
}

export async function fetchCdpJson(endpoint, pathname) {
  const response = await fetch(new URL(pathname, endpoint));
  if (!response.ok) throw new CdpError(`CDP endpoint HTTP ${response.status}`, { code: "CDP_HTTP_ERROR" });
  return response.json();
}
