# A23 same-session content review

This review was performed after all five review-only candidates were frozen. It is current-task, oracle-aware evidence and is not an independent reviewer result.

| Candidate | Review focus | Verdict | Exact reason and repair |
| --- | --- | --- | --- |
| `F08-wrong-missing-terminal.md` | 缺少目标终点 | 拒绝 | “提交成功”既无来源支持，也不能证明计算金额；计算错误时该提示仍可能正常。修复为观察同一订单按公式得到的明确折后金额。 |
| `F08-wrong-object-switch.md` | 中途换对象 | 拒绝 | 动作针对订单甲，终点却读取订单乙，无法证明同一业务对象连续性。修复为始终定位并观察本用例输入的同一订单。 |
| `F08-wrong-merged-results.md` | 合并独立结果 | 拒绝 | 原价上下界、折扣率上下界和计算结果可独立失败，却被一个“均正确”预期吞并。修复为按独立结果拆分并写出精确输入与 Oracle。 |
| `F08-wrong-example-authority.md` | 示例升级为规则 | 拒绝 | 资料明确 100/0.20 是可替换示例，候选却禁止其他范围内值。修复为保留允许范围，把示例标为可替换；明确实例仍可用于验证 80.00。 |
| `F08-correct-candidate.md` | 正确候选 | 接受 | 多步始终作用于同一订单，只有“折后金额为 80.00”一个主要结果；100/0.20 和 80.00 由确定实例及公式支持。不能仅因包含多个动作而拒绝。 |

结果：四类错误均被指出到具体业务影响和最小修复；正确的同对象多步 Case 未被机械拒绝。
