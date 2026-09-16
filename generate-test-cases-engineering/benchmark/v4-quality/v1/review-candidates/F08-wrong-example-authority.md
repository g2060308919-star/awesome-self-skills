# A23 auxiliary candidate: upgrades an example into a rule

This file is review-only and must never be used as raw generation input.

Defect under review: **示例升级为规则**。

Case: 只允许示例折扣数据

- Preconditions: 可输入订单原价和折扣率。
- Data: 原价必须为 100 元且折扣率必须为 0.20。
- Steps: 输入不同于 100 元或 0.20 的范围内数据；触发计算。
- Expected: 系统拒绝所有不等于示例值的数据。

The source explicitly labels 100 and 0.20 as replaceable example values, so this candidate invents a closed input rule.
