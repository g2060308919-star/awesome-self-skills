# A23 auxiliary candidate: merges independently failing results

This file is review-only and must never be used as raw generation input.

Defect under review: **合并独立结果**。

Case: 一次验证全部折扣规则

- Preconditions: 可输入订单原价和折扣率。
- Data: 依次输入原价 0、原价 10001、折扣率 -0.01、折扣率 0.51，以及原价 100、折扣率 0.20。
- Steps: 对全部数据逐项提交并执行计算。
- Expected: 所有非法数据均被正确处理，合法数据的折后金额正确。

The Case combines separately failing range restrictions and the calculation result behind one vague expectation, so a partial defect cannot be diagnosed independently.
