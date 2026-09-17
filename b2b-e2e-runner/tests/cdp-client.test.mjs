import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { CdpClient } from "../scripts/lib/cdp-client.mjs";

class Socket extends EventEmitter {
  sent = [];
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.emit("close"); }
}

for (const event of ["close", "error"]) {
  test(`transport ${event} is terminal before disconnect cleanup can send commands`, async () => {
    const socket = new Socket();
    const client = new CdpClient(socket);
    const pending = client.command("Network.enable").catch(error => error);
    let cleanup;
    let notifications = 0;
    client.on("", "__transport_closed__", () => {
      notifications++;
      cleanup = client.command("Fetch.disable").catch(error => error);
    });
    socket.emit(event, new Error("simulated connection loss"));
    socket.emit("close");
    assert.deepEqual(socket.sent.map(item => item.method), ["Network.enable"]);
    const error = await client.command("Target.detachFromTarget").catch(value => value);
    assert.equal(error.code, "CDP_CLOSED");
    assert.equal((await cleanup).code, "CDP_CLOSED");
    assert.match((await pending).message, /CDP/);
    assert.equal(notifications, 1);
    assert.deepEqual(socket.sent.map(item => item.method), ["Network.enable"]);
    client.close();
  });
}

test("explicit close is idempotent and rejects later commands", async () => {
  const socket = new Socket();
  const client = new CdpClient(socket);
  client.close();
  client.close();
  await assert.rejects(client.command("Fetch.disable"), { code: "CDP_CLOSED" });
  assert.equal(socket.sent.length, 0);
});
