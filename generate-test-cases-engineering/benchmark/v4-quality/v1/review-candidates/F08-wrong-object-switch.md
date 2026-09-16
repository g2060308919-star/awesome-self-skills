# A23 auxiliary candidate: switches business object

This file is review-only and must never be used as raw generation input.

Defect under review: **中途换对象**。

Case: 计算订单折后金额

- Preconditions: 订单甲和订单乙均可输入折扣数据。
- Data: 为订单甲输入原价 100 元、折扣率 0.20。
- Steps: 对订单甲触发计算；随后打开订单乙查看折后金额。
- Expected: 订单乙的折后金额为 80.00 元。

The terminal observation targets a different order from the one acted on, so it cannot prove the required same-order calculation.
