import { chmod, rm } from "node:fs/promises";
import net from "node:net";

import { SandboxError } from "../shared/errors.mjs";
import {
  CONTROL_COMMANDS,
  MAX_CONTROL_MESSAGE_BYTES,
  parseControlMessage,
  tokenMatches
} from "./protocol.mjs";

function errorResponse(id, error) {
  return {
    id: typeof id === "string" ? id : null,
    ok: false,
    error: {
      code: error.code ?? "CONTROL_INTERNAL_ERROR",
      message: error.code ? error.message : "Control command failed"
    }
  };
}

export function createControlServer(options) {
  let listening = false;
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf8") > MAX_CONTROL_MESSAGE_BYTES + 1) {
        socket.end(`${JSON.stringify(errorResponse(null, new SandboxError(
          "CONTROL_MESSAGE_TOO_LARGE",
          "Control message exceeds 1 MiB"
        )))}\n`);
        return;
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handleLine(line).then(
          (response) => socket.write(`${JSON.stringify(response)}\n`),
          (error) => socket.write(`${JSON.stringify(errorResponse(null, error))}\n`)
        );
        newline = buffer.indexOf("\n");
      }
    });
  });

  async function dispatch(command, args) {
    switch (command) {
      case "status":
        return options.coordinator.status();
      case "prepare":
        return options.coordinator.prepare(await options.profileResolver(args.profileId));
      case "reset":
        return options.coordinator.reset(await options.profileResolver(args.profileId));
      case "snapshot":
        if (args.kind === "before") return options.coordinator.status().preSnapshot;
        if (args.kind === "diff") return options.coordinator.diff();
        return options.coordinator.snapshot();
      case "events":
        return options.coordinator.read().oracleEvents;
      case "outbox":
        return options.coordinator.read().outbox;
      case "requests":
        return options.coordinator.businessRequestTrace();
      case "canaries":
        return options.coordinator.oracleRegistry();
      case "fault":
        return options.operations.faultStatus();
      case "expire-session":
        return options.operations.expireSession(args.sessionId);
      case "set-role":
        return options.operations.changeAccountRole(args.accountId, args.role);
      case "external-action":
        return options.operations.completeExternalAction(args);
      case "run-jobs":
        return options.operations.runDueJobs(args.actor);
      case "stop":
        await options.coordinator.abort("evaluator stop");
        await options.onStop?.();
        return { stopped: true };
      default:
        throw new SandboxError("CONTROL_COMMAND_UNKNOWN", "Control command is not allowlisted", {}, 404);
    }
  }

  async function handleLine(line) {
    let message;
    try {
      message = parseControlMessage(line);
      if (!tokenMatches(message.token, options.token)) {
        throw new SandboxError("CONTROL_UNAUTHORIZED", "Control capability is invalid", {}, 401);
      }
      if (!CONTROL_COMMANDS.includes(message.command)) {
        throw new SandboxError("CONTROL_COMMAND_UNKNOWN", "Control command is not allowlisted", {}, 404);
      }
      const result = await dispatch(message.command, message.args);
      return { id: message.id, ok: true, result };
    } catch (error) {
      return errorResponse(message?.id, error);
    }
  }

  return Object.freeze({
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.socketPath, async () => {
          server.off("error", reject);
          await chmod(options.socketPath, 0o600);
          listening = true;
          resolve({ socketPath: options.socketPath });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        const finish = async (error) => {
          listening = false;
          await rm(options.socketPath, { force: true });
          if (error) reject(error);
          else resolve();
        };
        if (!listening) return finish();
        server.close(finish);
      });
    }
  });
}
