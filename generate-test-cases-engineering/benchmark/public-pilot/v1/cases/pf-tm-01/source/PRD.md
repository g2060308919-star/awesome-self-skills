# Kandji MCP Server PRD

> **Note:** Kandji has been rebranded as **Iru**. This documentation references "Kandji" as that remains the current API naming convention. All functionality works identically with the Iru platform.

**Version:** 1.0.0

**Date:** October 2025

**Author:** Simon Tin-Yul Kok

**Baseline:** [FastMCP GitHub Project](https://github.com/modelcontextprotocol/fastmcp)  

**Integration:** Based on MCP Best Practices Guide 2025  

---

## Executive Summary

The **Kandji MCP Server** extends the FastMCP framework to provide a local, secure, and AI-interpretable bridge between **Anthropic Claude Desktop** and the **Kandji MDM API**.  

This MCP Server enables natural-language device management, compliance reporting, and automation actions directly from a conversational interface — following industry-aligned MCP and security best practices.

### Objectives
- Seamlessly integrate Kandji API into the Model Context Protocol ecosystem.  
- Enable AI-driven device management queries with 90%+ semantic accuracy.  
- Ensure privacy, compliance, and audit traceability for all API interactions.  
- Deliver sub-2s latency (P95) on standard device queries.  

---

## 1. Architecture Overview

The Kandji MCP Server leverages **FastMCP**, a TypeScript-based reference framework for Model Context Protocol servers. It implements reusable MCP tools, resources, and schemas that encapsulate the Kandji REST API.

### Directory Structure
```
/kandji-mcp-server
├── src/
│   ├── tools/
│   │   ├── get_device_details.ts
│   │   ├── search_devices_by_criteria.ts
│   │   └── get_compliance_summary.ts
│   ├── resources/
│   │   ├── kandji.schema.json
│   │   └── blueprints.schema.json
│   ├── utils/
│   │   ├── client.ts
│   │   └── cache.ts
│   ├── index.ts
├── .env
├── package.json
└── README.md
```

### FastMCP Integration Example

```ts
import { defineTool, startServer } from "fastmcp";
import { KandjiClient } from "./utils/client";
import dotenv from "dotenv";

dotenv.config();

const kandji = new KandjiClient(process.env.KANDJI_API_TOKEN!, process.env.KANDJI_SUBDOMAIN!);

const getDeviceDetails = defineTool({
  name: "get_device_details",
  description: "Fetch detailed information about a specific device by its ID.",
  parameters: {
    id: { type: "string", description: "Device ID (UUID)" }
  },
  async run({ id }) {
    const device = await kandji.getDeviceDetails(id);
    return {
      success: true,
      summary: `Device ${device.device_name} status: ${device.compliance_status}`,
      table: {
        columns: ["Device", "User", "OS", "Compliance"],
        rows: [
          {
            Device: device.device_name,
            User: device.user_email,
            OS: device.os_version,
            Compliance: device.compliance_status
          }
        ]
      },
      metadata: { source: "Kandji API", cached: false, elapsedMs: 182 }
    };
  }
});

startServer({ tools: [getDeviceDetails] });
```

---

## 2. Authentication and Configuration

### Environment Variables (.env)
```
KANDJI_API_TOKEN=your_api_key_here
KANDJI_SUBDOMAIN=your_subdomain_here
KANDJI_API_URL=https://{subdomain}.api.kandji.io/api/v1
```

### Security Notes
- Never commit `.env` to Git.  
- Store production secrets in macOS Keychain or a secure vault when applicable.  
- Each session validates token presence before startup.  

---

## 3. Tooling and Resource Model

Each Kandji MCP tool follows **FastMCP best practices** and **MCP Best Practices 2025 guidelines**:

| Tool Name | Description | Example Query |
|------------|-------------|---------------|
| `search_devices_by_criteria` | Filter devices by name, OS, or compliance status. | “Show me all MacBooks that are non-compliant.” |
| `get_device_details` | Retrieve hardware, software, and compliance data. | “Show details for John’s MacBook Air.” |
| `get_compliance_summary` | Summarize organization-wide device compliance. | “Summarize FileVault compliance across all devices.” |
| `list_blueprints` | List all device blueprints and associated profiles. | “List all blueprints used for Engineering team.” |
| `execute_device_action` | Run lock, restart, or wipe commands (confirmation required). | “Lock device A12B34C after confirmation.” |

Each tool includes:
- Strict **Zod-based parameter validation**  
- Return structure adhering to **MCP Response Envelope**  
- Built-in **privacy toggle** for PII masking  
- Local audit logging (no emoji, JSON format)  

---

## 4. MCP Response Envelope

All tools follow the **standardized response envelope**:

```json
{
  "success": true,
  "summary": "12 devices found, 3 non-compliant",
  "table": {
    "columns": ["Device", "User", "Status"],
    "rows": [
      { "Device": "MacBook-Pro-01", "User": "alex@company.com", "Status": "Compliant" }
    ]
  },
  "metadata": {
    "totalCount": 12,
    "limit": 25,
    "offset": 0,
    "elapsedMs": 184,
    "cached": false,
    "source": "Kandji API"
  },
  "suggestions": [
    "Filter to blueprint=Engineering",
    "Sort by updated_at desc"
  ]
}
```

---

## 5. Validation and Error Handling

### Error Taxonomy
| Category | Description | Recovery Strategy |
|-----------|-------------|-------------------|
| `validation` | Bad or missing parameters | Correct input; re-run query |
| `auth` | Invalid or expired API token | Regenerate `.env` token |
| `rate_limit` | API throttle | Retry with exponential backoff |
| `network` | Timeout or DNS error | Retry or check connectivity |
| `server` | 5xx Kandji API error | Graceful fail + retry later |

### Recovery Structure Example
```json
{
  "success": false,
  "errors": [
    {
      "category": "validation",
      "message": "Device ID is missing or invalid.",
      "recovery": ["Provide a valid Kandji device UUID"]
    }
  ]
}
```

---

## 6. Security and Privacy

- **PII toggle** at first-use prompt (session-based).
- **No emoji** in logs or console output.
- **Device erase actions** logged to stdout for accountability.
- **Read-only mode** by default; destructive operations require `confirm: true`.
- **Security Best Practices:** Secure credential storage via .env (gitignored), input validation with Zod schemas, HTTPS-only API calls.  

---

## 7. Caching and Performance

| Entity | TTL | Cache Key Pattern |
|---------|-----|------------------|
| Devices | 5 min | `device:{id}` |
| Compliance | 2 min | `compliance:{deviceId}` |
| Blueprints | 30 min | `blueprint:{id}` |

**Performance Targets**
| Metric | Target |
|---------|--------|
| P95 latency | < 2 s |
| Cache hit rate | ≥ 40% |
| Error rate | < 5% |

---

## 8. Development and Testing

### Local Development
```bash
npm install
npm run dev
fastmcp serve
```

### Testing
- **Jest + Supertest** for endpoint and envelope validation.  
- **Mock Kandji responses** for offline tests.  
- 100% coverage target for validation, cache, and errors.  

### Example Test
```ts
test("get_device_details returns valid envelope", async () => {
  const res = await request(app).get("/tools/get_device_details?id=123");
  expect(res.body.success).toBe(true);
  expect(res.body.table.columns).toContain("Device");
});
```

---

## 9. Logging and Monitoring

| Metric | Description |
|---------|--------------|
| `kandji_api_calls_total` | Count of outbound Kandji API calls |
| `error_rate` | % of failed calls per minute |
| `response_time` | Average ms per request |
| `cache_hit_rate` | Cache efficiency |
| `privacy_mode_active` | Boolean state of redaction toggle |

Alerts:
- Error Rate > 5%  
- Cache Hit < 40%  
- P95 latency > 2.5 s  

---

## 10. Implementation Timeline

| Phase | Duration | Deliverables |
|--------|-----------|--------------|
| **Foundation** | Weeks 1–2 | Auth, Error Handler, Basic Tools |
| **Core Tools** | Weeks 3–4 | Device Mgmt, Compliance, Blueprints |
| **Integration Testing** | Weeks 5–6 | Caching, Validation, Envelope Format |
| **Optimization & Docs** | Weeks 7–8 | Final QA, Audit Logging, Confluence PRD |

---

## 11. References

- [Kandji API Docs](https://api-docs.kandji.io)  
- [FastMCP GitHub Project](https://github.com/modelcontextprotocol/fastmcp)  
- [MCP Best Practices Guide 2025]  
- [Model Context Protocol Specification](https://modelcontextprotocol.io)  
