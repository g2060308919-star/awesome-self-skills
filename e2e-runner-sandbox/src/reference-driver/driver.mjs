import { SandboxError } from "../shared/errors.mjs";

function entry(sequence, tool, target) {
  return {
    sequence,
    actor: "evaluator",
    provenance: "trusted-reference",
    tool,
    target,
    environmentClassification: "non-production",
    scopeConfirmed: true
  };
}

function assertion(assertionId, passed, detail) {
  return {
    assertionId,
    state: passed ? "verified-pass" : "verified-fail",
    detail
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: "manual", ...options });
  return { response, text: await response.text() };
}

export async function runReferenceCase({ origin, accountId, profileId, runId }) {
  if (profileId !== "B01" && profileId !== "B02") {
    throw new SandboxError("REFERENCE_CASE_UNSUPPORTED", "The trusted reference driver only implements B01 and B02");
  }
  const trace = [];
  let sequence = 0;
  trace.push(entry(++sequence, "navigate_page", `${origin}/`));
  const landing = await request(`${origin}/`);
  if (landing.response.status !== 200) {
    throw new SandboxError("REFERENCE_DRIVER_FAILED", "The business login page is not healthy");
  }

  trace.push(entry(++sequence, "click", "manual-account-selection"));
  const login = await request(`${origin}/login`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin
    },
    body: new URLSearchParams({ accountId })
  });
  const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0];
  if (login.response.status !== 303 || !cookie) {
    throw new SandboxError("REFERENCE_DRIVER_FAILED", "The reference account could not be selected");
  }

  if (profileId === "B02") {
    const customerName = `Bench-${runId}`;
    const customer = {
      name: customerName,
      email: "reference@example.invalid",
      owner: "Owen Operator",
      timezone: "UTC",
      status: "Active",
      plan: "Core",
      tags: ""
    };
    const headers = {
      cookie,
      origin,
      "content-type": "application/x-www-form-urlencoded"
    };

    trace.push(entry(++sequence, "navigate_page", `${origin}/customers/new`));
    const createForm = await request(`${origin}/customers/new`, { headers: { cookie } });
    trace.push(entry(++sequence, "fill_form", "customer-create"));
    trace.push(entry(++sequence, "click", "create-customer"));
    const created = await request(`${origin}/customers`, {
      method: "POST",
      headers,
      body: new URLSearchParams(customer)
    });
    const location = created.response.headers.get("location") ?? "";
    const customerId = location.match(/^\/customers\/([^?]+)/)?.[1];
    if (!customerId) throw new SandboxError("REFERENCE_DRIVER_FAILED", "Reference customer was not created");

    const detailTarget = `${origin}/customers/${encodeURIComponent(customerId)}`;
    trace.push(entry(++sequence, "navigate_page", detailTarget));
    const refreshed = await request(detailTarget, { headers: { cookie } });
    trace.push(entry(++sequence, "fill_form", "customer-tags"));
    trace.push(entry(++sequence, "click", "save-customer"));
    const edited = await request(`${detailTarget}/edit`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ ...customer, tags: "gold, east" })
    });
    trace.push(entry(++sequence, "navigate_page", detailTarget));
    const persisted = await request(detailTarget, { headers: { cookie } });
    trace.push(entry(++sequence, "click", "delete-customer"));
    const deleted = await request(`${detailTarget}/delete`, { method: "POST", headers });
    const searchTarget = `${origin}/customers?search=${encodeURIComponent(customerName)}`;
    trace.push(entry(++sequence, "navigate_page", searchTarget));
    const cleanup = await request(searchTarget, { headers: { cookie } });

    const passed = created.response.status === 303
      && refreshed.response.status === 200
      && refreshed.text.includes(customerName)
      && edited.response.status === 303
      && persisted.response.status === 200
      && /<dt>Tags<\/dt><dd>gold, east<\/dd>/.test(persisted.text)
      && deleted.response.status === 303
      && /0 customers found/.test(cleanup.text);
    return {
      provenance: "trusted-reference",
      profileId,
      runId,
      entries: trace,
      assertions: [assertion("B02-A1", passed, "Customer create, refresh, tag persistence, and cleanup completed")]
    };
  }

  const target = `${origin}/customers?search=${encodeURIComponent("Acme Alpine")}`;
  trace.push(entry(++sequence, "navigate_page", target));
  const list = await request(target, { headers: { cookie } });
  const customerId = list.text.match(/href="\/customers\/(CUS-[A-Za-z0-9-]+)"/)?.[1];
  if (!customerId) throw new SandboxError("REFERENCE_DRIVER_FAILED", "Reference search did not find the customer");

  const detailTarget = `${origin}/customers/${encodeURIComponent(customerId)}`;
  trace.push(entry(++sequence, "click", detailTarget));
  const detail = await request(detailTarget, { headers: { cookie } });
  const assertions = [
    assertion("B01-A1", detail.response.status === 200 && /Avery Stone/.test(detail.text), "Owner is visible in customer detail"),
    assertion("B01-A2", /<dt>Plan<\/dt><dd>Scale<\/dd>/.test(detail.text), "Plan is visible in customer detail")
  ];
  return {
    provenance: "trusted-reference",
    profileId,
    runId,
    entries: trace,
    assertions
  };
}
