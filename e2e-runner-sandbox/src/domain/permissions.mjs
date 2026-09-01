export const ROLE_PERMISSIONS = Object.freeze({
  Viewer: Object.freeze([
    "customer.read",
    "project.read",
    "approval.read",
    "business-audit.read"
  ]),
  Operator: Object.freeze([
    "customer.read",
    "customer.create",
    "customer.update",
    "customer.delete",
    "project.read",
    "project.status.update",
    "project.description.update",
    "approval.read",
    "approval.submit",
    "business-audit.read"
  ]),
  Approver: Object.freeze([
    "customer.read",
    "project.read",
    "approval.read",
    "approval.decide",
    "business-audit.read"
  ]),
  Administrator: Object.freeze(["*"])
});

export function authorize(account, permission) {
  if (!account || typeof permission !== "string") return false;
  const permissions = ROLE_PERMISSIONS[account.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}
