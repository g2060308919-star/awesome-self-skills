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
  if (profileId !== "B01") {
    throw new SandboxError("REFERENCE_CASE_UNSUPPORTED", "The trusted reference driver only implements B01");
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

