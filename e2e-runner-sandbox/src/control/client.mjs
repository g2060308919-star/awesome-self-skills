import { randomUUID } from "node:crypto";
import net from "node:net";

import { SandboxError } from "../shared/errors.mjs";
import { MAX_CONTROL_MESSAGE_BYTES } from "./protocol.mjs";

export function createControlClient(options) {
  return Object.freeze({
    request(command, args = {}) {
      const id = randomUUID();
      const line = `${JSON.stringify({ id, token: options.token, command, args })}\n`;
      if (Buffer.byteLength(line, "utf8") > MAX_CONTROL_MESSAGE_BYTES) {
        return Promise.reject(new SandboxError(
          "CONTROL_MESSAGE_TOO_LARGE",
          "Control message exceeds 1 MiB"
        ));
      }
      return new Promise((resolve, reject) => {
        const socket = net.createConnection(options.socketPath);
        let buffer = "";
        socket.setEncoding("utf8");
        socket.once("error", reject);
        socket.once("connect", () => socket.write(line));
        socket.on("data", (chunk) => {
          buffer += chunk;
          const newline = buffer.indexOf("\n");
          if (newline < 0) return;
          socket.end();
          let response;
          try {
            response = JSON.parse(buffer.slice(0, newline));
          } catch {
            reject(new SandboxError("CONTROL_RESPONSE_INVALID", "Control response was not JSON"));
            return;
          }
          if (response.id !== id) {
            reject(new SandboxError("CONTROL_RESPONSE_INVALID", "Control response correlation failed"));
          } else if (!response.ok) {
            reject(new SandboxError(response.error.code, response.error.message));
          } else {
            resolve(response.result);
          }
        });
      });
    }
  });
}
