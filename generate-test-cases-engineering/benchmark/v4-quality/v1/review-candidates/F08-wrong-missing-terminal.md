# A23 auxiliary candidate: missing target terminal result

This file is review-only and must never be used as raw generation input.

Defect under review: **缺少目标终点**。

Case: 提交折扣后显示成功提示

- Preconditions: 可输入订单原价和折扣率。
- Data: 原价 100 元，折扣率 0.20。
- Steps: 输入原价和折扣率；触发折后金额计算。
- Expected: 页面显示“提交成功”。

The Case never observes the required computed amount. A success message can remain normal while the calculation is wrong, and the source does not define that message.
