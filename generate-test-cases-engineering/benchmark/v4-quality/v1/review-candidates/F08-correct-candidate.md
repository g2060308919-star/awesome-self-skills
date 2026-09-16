# A23 auxiliary candidate: expected to survive review

This file is review-only and must never be used as raw generation input.

Case: 按明确公式计算范围内订单的折后金额

- Preconditions: 可输入订单原价和折扣率。
- Data: 原价 100 元，折扣率 0.20；二者满足已声明范围。示例取值可替换，但本例预期按同一输入计算。
- Steps: 输入本例原价与折扣率；触发折后金额计算；查看同一订单的折后金额。
- Expected after calculation: 同一订单的折后金额为 80.00 元。

This is a valid multi-step, same-object Case with one primary result. Review must not reject it merely for having multiple actions.
