# Guided 03

## M1 — C

理由：用户已确认原预期错误，实际状态为保持活跃；应记录为 case issue，相关断言不能据此判定通过或失败。

支撑规则：Assertions and Verdicts 规定，用户确认期望错误时记录 `case issue`，相关执行或观察已发生则断言标为 `unverified`。

## M2 — B

理由：线上镜像的环境属性未知，尚无开发、测试或 staging 的肯定证据，因此不能先打开目标页面。

支撑规则：Start Gate 要求浏览器动作前必须有非生产的肯定证据；环境未知或冲突时应先确认，已确认生产则拒绝。

## M3 — B

理由：刷新后显示已批准只能证明下游状态，不能证明未观察到的必需批准交互；交互保持 `unverified`，用例整体 `Inconclusive`。

支撑规则：Pause, Assistance, and Resume 规定，未观察到的必需交互不能由后续可见下游状态证明，相关断言保持 `unverified`。

## M4 — B

理由：Authorization、Cookie 和 token 属于秘密，持久化时只能保留脱敏后的最小摘要，任何位置都不能保留原始秘密。

支撑规则：Maintain the Run Record 要求持久化前脱敏，并明确不得持久化或在其他位置保留密码、cookie、授权值、token 等秘密。

## M5 — B

理由：提交超时使写入结果不明，必须先核查通知、列表、详情及相关请求，确认前不得自动重试可能已成功的变更。

支撑规则：Writes, Destructive Actions, and Cleanup 规定写入结果有歧义时先检查这些来源，绝不自动重复可能已成功的 mutation。

选择串：C-B-B-B-B
