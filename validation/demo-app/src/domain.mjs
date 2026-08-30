export function createDemoState() {
  let nextRequestNumber = 5001;
  const state = {
    session: {
      authenticated: false,
      displayName: null,
      role: "analyst"
    },
    requests: [
      {
        id: "REQ-1001",
        title: "Synthetic laptop purchase",
        amount: 1299,
        status: "Pending approval"
      },
      {
        id: "REQ-1003",
        title: "Independent synthetic office supplies",
        amount: 240,
        status: "Draft"
      },
      {
        id: "REQ-2002",
        title: "External security review",
        amount: 880,
        status: "Pending external review"
      },
      {
        id: "REQ-2010",
        title: "Legal review sample",
        amount: 610,
        status: "Pending legal review"
      },
      {
        id: "REQ-4001",
        title: "Reconciliation failure sample",
        amount: 950,
        status: "Ready",
        retentionProtected: true
      },
      {
        id: "REQ-9001",
        title: "Stale sandbox request",
        amount: 75,
        status: "Draft"
      },
      {
        id: "REQ-9002",
        title: "Stale sandbox request",
        amount: 125,
        status: "Draft"
      },
      {
        id: "REQ-9003",
        title: "Retention protected request",
        amount: 310,
        status: "Draft",
        retentionProtected: true
      }
    ],
    audit: []
  };

  return {
    signInManually(displayName) {
      state.session.authenticated = true;
      state.session.displayName = displayName;
    },

    changeRole(role) {
      state.session.role = role;
    },

    approveRequest(requestId) {
      if (state.session.role !== "manager") {
        return {
          ok: false,
          status: 403,
          reason: "Manager permission required"
        };
      }

      const request = state.requests.find(({ id }) => id === requestId);
      if (!request) {
        return {
          ok: false,
          status: 404,
          reason: "Request not found"
        };
      }
      request.status = "Approved";
      return { ok: true, status: 200 };
    },

    submitRequest({ title, amount, simulateAmbiguous = false }) {
      const request = {
        id: `REQ-${nextRequestNumber++}`,
        title,
        amount,
        status: "Pending approval"
      };
      state.requests.push(request);

      if (simulateAmbiguous) {
        return {
          ok: false,
          status: 504,
          outcome: "unknown",
          message: "Submission outcome unknown; inspect current state before retrying"
        };
      }

      return { ok: true, status: 201, request: structuredClone(request) };
    },

    cleanupRequest(requestId, { simulateFailure = false } = {}) {
      if (simulateFailure) {
        return {
          ok: false,
          status: 503,
          residual: true,
          reason: "Synthetic cleanup failure"
        };
      }

      const index = state.requests.findIndex(({ id }) => id === requestId);
      if (index === -1) {
        return {
          ok: false,
          status: 404,
          residual: false,
          reason: "Request not found"
        };
      }
      if (state.requests[index]?.retentionProtected) {
        return {
          ok: false,
          status: 409,
          residual: true,
          reason: "Retention policy prevents deletion"
        };
      }
      state.requests.splice(index, 1);
      return { ok: true, status: 204, residual: false };
    },

    completeExternalReview(requestId) {
      const request = state.requests.find(({ id }) => id === requestId);
      if (!request) {
        return {
          ok: false,
          status: 404,
          reason: "Request not found"
        };
      }
      request.status = "Externally reviewed";
      state.audit.push({
        type: "external-review-completed",
        requestId,
        provenance: "external-person"
      });
      return { ok: true, status: 200 };
    },

    snapshot() {
      return structuredClone(state);
    }
  };
}
