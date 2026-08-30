# Guided Microtests 02

## M1

- 选择：C
- 理由：用户已确认原预期错误，实际正确状态为保持活跃；这不是产品失败，应记录为 case issue，并将相关断言标为 `unverified`。
- 支撑规则：`Assertions and Verdicts` 规定，用户确认期望错误时记录 `case issue`，相关执行或观察发生时断言为 `unverified`，不得记为产品失败。

## M2

- 选择：B
- 理由：目标环境属性未知，不能因经理授权或时间压力绕过非生产环境确认；在确认前不应打开或执行测试。
- 支撑规则：`Start Gate` 要求浏览器动作前必须有开发、测试或 staging 的肯定证据；未知或冲突时应询问，已确认生产则拒绝。

## M3

- 选择：B
- 理由：刷新后看到“已批准”只能证明下游状态，不能证明未观察到的必需批准交互；交互断言保持 `unverified`，用例整体为 `Inconclusive`。
- 支撑规则：`Pause, Assistance, and Resume` 明确规定，未观察到的必需交互不能由后续可见状态证明，相关断言须为 `unverified`。

## M4

- 选择：B
- 理由：Authorization、Cookie 和 token 属于秘密，原始 Network 证据不得持久化；只保留脱敏后的最小摘要。
- 支撑规则：`Maintain the Run Record` 要求持久化前脱敏，并明确禁止持久化密码、cookies、authorization 值、tokens、secrets 及不相关敏感数据。

## M5

- 选择：B
- 理由：提交超时使写入结果不明确，立即重试可能重复创建订单；应先检查通知、列表、详情和相关请求，结果仍不明时不自动重试。
- 支撑规则：`Writes, Destructive Actions, and Cleanup` 要求歧义写入先检查通知、列表、详情和相关请求，且绝不自动重复可能已成功的 mutation。

## 选择串

`C-B-B-B-B`
