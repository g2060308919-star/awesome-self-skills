export const CURRENT_WORKFLOW = "b2b-e2e-current";

export function assertCurrentWorkflow(log) {
  if (log?.events?.[0]?.type !== "workflow_profile" || log.events[0].profile !== CURRENT_WORKFLOW) {
    const error = new Error("不支持旧 workflow 或旧 Run；请新建 b2b-e2e-current 任务，原数据不会迁移或改写");
    error.code = "UNSUPPORTED_WORKFLOW";
    throw error;
  }
}
