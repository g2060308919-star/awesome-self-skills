import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function lockError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pidExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export class TargetLock {
  constructor({
    root,
    endpoint,
    targetId,
    runId = "runner",
    pid = process.pid,
    ownerToken = crypto.randomUUID(),
    staleAfterMs = 30_000,
    heartbeatMs = 5_000
  }) {
    if (!root || !endpoint || !targetId) throw lockError("LOCK_CONFIG", "锁需要 root、endpoint 和 targetId");
    this.root = path.resolve(root);
    this.endpoint = endpoint;
    this.targetId = targetId;
    this.runId = runId;
    this.pid = pid;
    this.ownerToken = ownerToken;
    this.staleAfterMs = staleAfterMs;
    this.heartbeatMs = heartbeatMs;
    const key = crypto.createHash("sha256").update(endpoint).update("\n").update(targetId).digest("hex");
    this.lockPath = path.join(this.root, key);
    this.ownerFile = path.join(this.lockPath, "owner.json");
    this.timer = null;
    this.acquired = false;
  }

  async acquire() {
    await mkdir(this.root, { recursive: true });
    try {
      await mkdir(this.lockPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = await this.#readOwner().catch(readError => {
        throw lockError("TARGET_ALREADY_OWNED", `无法验证现有锁所有者：${readError.message}`);
      });
      const heartbeat = Date.parse(owner.heartbeatAt);
      const expired = Number.isFinite(heartbeat) && Date.now() - heartbeat > this.staleAfterMs;
      if (!expired || pidExists(owner.pid)) {
        throw lockError("TARGET_ALREADY_OWNED", "Target 已被活跃监听器占用");
      }
      await rm(this.lockPath, { recursive: true, force: true });
      try {
        await mkdir(this.lockPath);
      } catch (retryError) {
        if (retryError.code === "EEXIST") throw lockError("TARGET_ALREADY_OWNED", "Target 锁被并发获取");
        throw retryError;
      }
    }
    const now = new Date().toISOString();
    await this.#writeOwner({
      schema_version: "1.0",
      runId: this.runId,
      endpoint: this.endpoint,
      targetId: this.targetId,
      pid: this.pid,
      ownerToken: this.ownerToken,
      createdAt: now,
      heartbeatAt: now
    });
    this.acquired = true;
    this.timer = setInterval(() => this.#heartbeat().catch(() => {}), this.heartbeatMs);
    this.timer.unref?.();
    return this;
  }

  async release() {
    const owner = await this.#readOwner().catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!owner) {
      this.#stopTimer();
      this.acquired = false;
      return;
    }
    if (owner.pid !== this.pid || owner.ownerToken !== this.ownerToken) {
      throw lockError("LOCK_OWNER_MISMATCH", "只有锁所有者才能释放 Target");
    }
    this.#stopTimer();
    await rm(this.lockPath, { recursive: true, force: true });
    this.acquired = false;
  }

  async #heartbeat() {
    if (!this.acquired) return;
    const owner = await this.#readOwner();
    if (owner.pid !== this.pid || owner.ownerToken !== this.ownerToken) {
      this.#stopTimer();
      this.acquired = false;
      return;
    }
    owner.heartbeatAt = new Date().toISOString();
    await this.#writeOwner(owner);
  }

  async #readOwner() {
    return JSON.parse(await readFile(this.ownerFile, "utf8"));
  }

  async #writeOwner(owner) {
    const temporary = path.join(this.lockPath, `.owner-${this.pid}-${crypto.randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(owner), { mode: 0o600 });
    await rename(temporary, this.ownerFile);
  }

  #stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
