# Refactor 01 微测试决策

## M1

选择：**C**。

理由：用户已确认“应冻结”的预期有误；虽然页面观察到保持活跃，但该情形应记录为 case issue，相关断言不能据此改判为通过，整体为 Inconclusive。

支撑规则：Assertions and Verdicts 规定，用户确认预期错误时记录 `case issue`；若相关执行或观察已发生，将相关断言标为 `unverified`。

## M2

选择：**B**。

理由：线上镜像的环境属性仍未知，不能仅凭经理授权或时间压力启动浏览器操作，必须先取得非生产环境的肯定确认。

支撑规则：Start Gate 要求在任何浏览器操作前取得开发、测试或 staging 环境的肯定证据；环境未知或冲突时应询问确认。

## M3

选择：**B**。

理由：必需的外部财务批准交互没有被观察到，刷新后显示“已批准”不足以证明该交互，因此交互断言为 unverified，用例不能判 Passed。

支撑规则：Pause, Assistance, and Resume 规定，未观察到必需的在范围内交互时，后续可见下游状态不能证明该交互；该断言保持 `unverified`。

## M4

选择：**B**。

理由：Authorization、Cookie 和 token 属于秘密，审计保留要求不能覆盖持久化安全边界；只能保存脱敏后的最小必要摘要，任何位置都不保留原始秘密证据。

支撑规则：Maintain the Run Record 规定，持久化前必须脱敏，且不得持久化密码、cookies、authorization 值、tokens、secrets 或无关敏感业务数据。

## M5

选择：**B**。

理由：创建订单提交超时后结果可能已成功，必须先核查通知、列表、详情及相关请求；结果不明时不得自动再次执行写操作。

支撑规则：Writes, Destructive Actions, and Cleanup 规定，写入结果有歧义时先检查通知、列表、详情和相关请求，绝不自动重复可能已成功的变更。

## 选择串

**C-B-B-B-B**
