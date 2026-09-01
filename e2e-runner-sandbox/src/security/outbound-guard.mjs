import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import tls from "node:tls";

const INSTALLATION = Symbol.for("e2e-runner-sandbox.outbound-guard");

function denied(target, destination = null) {
  const error = new Error("Outbound network access is denied");
  error.code = "OUTBOUND_NETWORK_DENIED";
  error.targetClass = target;
  error.destination = destination;
  return error;
}

function hostFromNetworkArguments(args) {
  const first = args[0];
  if (Array.isArray(first)) return hostFromNetworkArguments(first);
  if (typeof first === "object" && first !== null) {
    if (first.path) return { socketPath: first.path };
    return { host: first.host ?? first.hostname ?? "localhost" };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { socketPath: first };
  return { host: typeof args[1] === "string" ? args[1] : "localhost" };
}

function destinationFromRequestArguments(args) {
  const first = args[0];
  if (typeof first === "string" || first instanceof URL) {
    const url = new URL(first);
    return { host: url.hostname };
  }
  if (first?.socketPath) return { socketPath: first.socketPath };
  return { host: first?.hostname ?? first?.host ?? "localhost" };
}

export function installOutboundGuard(options = {}) {
  if (globalThis[INSTALLATION]) return globalThis[INSTALLATION];
  const allowedHosts = new Set(options.allowedHosts ?? ["127.0.0.1", "::1"]);
  const allowedSocketPaths = new Set(options.allowedSocketPaths ?? []);
  const allow = (destination) => {
    if (destination.socketPath) return allowedSocketPaths.has(destination.socketPath);
    return allowedHosts.has(String(destination.host).replace(/^\[|\]$/g, ""));
  };
  const requireAllowed = (destination, targetClass) => {
    if (!allow(destination)) throw denied(targetClass, destination);
  };

  const originals = {
    dnsLookup: dns.lookup,
    dnsResolve: dns.resolve,
    dnsResolve4: dns.resolve4,
    dnsResolve6: dns.resolve6,
    dnsPromisesLookup: dns.promises.lookup,
    dnsPromisesResolve: dns.promises.resolve,
    netConnect: net.connect,
    netCreateConnection: net.createConnection,
    socketConnect: net.Socket.prototype.connect,
    tlsConnect: tls.connect,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    dgramCreateSocket: dgram.createSocket,
    fetch: globalThis.fetch,
    WebSocket: globalThis.WebSocket
  };

  const guardedDns = (original) => function guardedDnsCall(hostname, ...args) {
    requireAllowed({ host: hostname }, "dns");
    return original.call(this, hostname, ...args);
  };
  dns.lookup = guardedDns(originals.dnsLookup);
  dns.resolve = guardedDns(originals.dnsResolve);
  dns.resolve4 = guardedDns(originals.dnsResolve4);
  dns.resolve6 = guardedDns(originals.dnsResolve6);
  dns.promises.lookup = guardedDns(originals.dnsPromisesLookup);
  dns.promises.resolve = guardedDns(originals.dnsPromisesResolve);

  const guardedNetwork = (original, targetClass) => function guardedNetworkCall(...args) {
    requireAllowed(hostFromNetworkArguments(args), targetClass);
    return original.apply(this, args);
  };
  net.connect = guardedNetwork(originals.netConnect, "tcp");
  net.createConnection = guardedNetwork(originals.netCreateConnection, "tcp");
  net.Socket.prototype.connect = guardedNetwork(originals.socketConnect, "tcp");
  tls.connect = guardedNetwork(originals.tlsConnect, "tls");

  const guardedRequest = (original, targetClass) => function guardedRequestCall(...args) {
    requireAllowed(destinationFromRequestArguments(args), targetClass);
    return original.apply(this, args);
  };
  http.request = guardedRequest(originals.httpRequest, "http");
  http.get = guardedRequest(originals.httpGet, "http");
  https.request = guardedRequest(originals.httpsRequest, "https");
  https.get = guardedRequest(originals.httpsGet, "https");
  dgram.createSocket = () => { throw denied("udp"); };

  if (originals.fetch) {
    globalThis.fetch = async function guardedFetch(resource, init) {
      const url = new URL(typeof resource === "string" || resource instanceof URL ? resource : resource.url);
      requireAllowed({ host: url.hostname }, "fetch");
      return originals.fetch.call(this, resource, init);
    };
  }
  if (originals.WebSocket) {
    globalThis.WebSocket = class GuardedWebSocket extends originals.WebSocket {
      constructor(url, protocols) {
        requireAllowed({ host: new URL(url).hostname }, "websocket");
        super(url, protocols);
      }
    };
  }
  syncBuiltinESMExports();

  const installation = Object.freeze({
    restore() {
      dns.lookup = originals.dnsLookup;
      dns.resolve = originals.dnsResolve;
      dns.resolve4 = originals.dnsResolve4;
      dns.resolve6 = originals.dnsResolve6;
      dns.promises.lookup = originals.dnsPromisesLookup;
      dns.promises.resolve = originals.dnsPromisesResolve;
      net.connect = originals.netConnect;
      net.createConnection = originals.netCreateConnection;
      net.Socket.prototype.connect = originals.socketConnect;
      tls.connect = originals.tlsConnect;
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
      dgram.createSocket = originals.dgramCreateSocket;
      if (originals.fetch) globalThis.fetch = originals.fetch;
      if (originals.WebSocket) globalThis.WebSocket = originals.WebSocket;
      delete globalThis[INSTALLATION];
      syncBuiltinESMExports();
    }
  });
  globalThis[INSTALLATION] = installation;
  return installation;
}
