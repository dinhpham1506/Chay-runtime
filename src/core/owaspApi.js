export const owaspApiTop10 = [
  {
    id: "API1:2023",
    name: "Broken Object Level Authorization",
    check: "Every API path using an object ID must verify the current user can access that object."
  },
  {
    id: "API2:2023",
    name: "Broken Authentication",
    check: "Authentication tokens, sessions, and identity checks must not be bypassed or logged."
  },
  {
    id: "API3:2023",
    name: "Broken Object Property Level Authorization",
    check: "Request/response properties must be allowlisted; avoid mass assignment and overexposure."
  },
  {
    id: "API4:2023",
    name: "Unrestricted Resource Consumption",
    check: "Add limits, pagination, timeouts, file-size caps, and rate protection where relevant."
  },
  {
    id: "API5:2023",
    name: "Broken Function Level Authorization",
    check: "Privileged functions must check role/permission, not just login state."
  },
  {
    id: "API6:2023",
    name: "Unrestricted Access to Sensitive Business Flows",
    check: "Sensitive flows need anti-abuse controls such as quotas, throttles, or workflow guards."
  },
  {
    id: "API7:2023",
    name: "Server Side Request Forgery",
    check: "User-provided URLs must be validated against allowlists and blocked from internal targets."
  },
  {
    id: "API8:2023",
    name: "Security Misconfiguration",
    check: "Do not weaken CORS, headers, debug settings, error disclosure, or environment config."
  },
  {
    id: "API9:2023",
    name: "Improper Inventory Management",
    check: "Do not expose deprecated, debug, shadow, or undocumented API routes."
  },
  {
    id: "API10:2023",
    name: "Unsafe Consumption of APIs",
    check: "Treat third-party API data as untrusted; validate schema, status, size, and errors."
  }
];

export function owaspChecklist() {
  return owaspApiTop10.map((item) => `${item.id} ${item.name}: ${item.check}`);
}
