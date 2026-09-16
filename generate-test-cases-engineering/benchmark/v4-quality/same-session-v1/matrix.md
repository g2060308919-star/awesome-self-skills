# Same-session paired review matrix

“通过” means the reviewer-authored retained observation met the oracle and, for candidate deliveries, the current full Table/HTML contract. “失败” is retained evidence, not discarded. Question/control rows pass when they stop or preserve the gap exactly as required. Each `Run` value is a unique observation ID, not an independently captured raw model transcript.

| Run | Version | Input / variant | Result | Retained observation |
| --- | --- | --- | --- | --- |
| SS-B-F01-1 | baseline | F01 repeat 1 | 失败 | 单点和同公告完整路径均保留；旧 4.2 Table 只列标题与汇总预期，缺少前提、数据和步骤。 |
| SS-B-F01-2 | baseline | F01 repeat 2 | 失败 | 语义同 repeat 1；旧 Table 呈现仍不完整。 |
| SS-B-F01-3 | baseline | F01 repeat 3 | 失败 | 语义同 repeat 1；旧 Table 呈现仍不完整。 |
| SS-B-F02-AND-1 | baseline | F02 AND | 失败 | AND、两个独立拒绝分支及互斥状态正确；旧 Table 呈现不完整。 |
| SS-B-F02-OR-1 | baseline | F02 OR | 失败 | 两条允许路径和必要拒绝路径正确；旧 Table 呈现不完整。 |
| SS-B-F03-FINAL | baseline | F03 final | 失败 | 先询问时间边界，最终答案形成 E3；旧 Table 呈现不完整。 |
| SS-B-F03-TEMP | baseline | F03 temporary | 失败 | 临时 48 小时口径保持 E1/Conditional；旧 Table 呈现不完整。 |
| SS-B-F03-UNKNOWN | baseline | F03 unknown | 通过 | 未猜边界，保留 unknown gap；没有伪造 Case。 |
| SS-B-F03-DEFER | baseline | F03 defer | 通过 | 只延后当前时间边界，gap 保留。 |
| SS-B-F03-DELIVERY | baseline | F03 delivery | 通过 | 只关闭所选当前项用于带缺口交付，不生成答案。 |
| SS-B-F03-PARTIAL | baseline | F03 partial | 通过 | 只回答另一个独立项；整个时间边界问题仍 pending，不生成时间 Case。 |
| SS-B-F03-INVALID | baseline | F03 invalid | 通过 | 空白/无关回答不形成 Decision，不推进 revision。 |
| SS-B-F04-1 | baseline | F04 repeat 1 | 失败 | 查询 Case 只验证匹配记录出现，不能识别非匹配记录混入。 |
| SS-B-F04-2 | baseline | F04 repeat 2 | 失败 | 与 repeat 1 相同的弱信号缺陷被保留。 |
| SS-B-F04-3 | baseline | F04 repeat 3 | 失败 | 使用匹配与非匹配对照，但旧 Table 呈现不完整。 |
| SS-B-F05-1 | baseline | F05 | 失败 | 填写、校验通过/失败/待定和 B 可用性区分正确；旧 Table 呈现不完整。 |
| SS-B-F06-UI | baseline | F06 UI | 失败 | 只观察同一对象 UI 状态；旧 Table 呈现不完整。 |
| SS-B-F06-INTERFACE | baseline | F06 interface | 失败 | 区分请求发出、accepted=true 与 accepted=false；旧 Table 呈现不完整。 |
| SS-B-F06-MISSING | baseline | F06 missing rule | 通过 | 请求发出可成 Case，业务接收成功先澄清；未猜字段或状态码。 |
| SS-B-F07-1 | baseline | F07 repeat 1 | 失败 | 图片、两页评论及父子关系读取正确；旧 Table 呈现不完整。 |
| SS-B-F07-2 | baseline | F07 repeat 2 | 失败 | 不采纳自动置顶，采纳自动可见；旧 Table 呈现不完整。 |
| SS-B-F07-3 | baseline | F07 repeat 3 | 失败 | 样式/按钮文案未作为精确验收；旧 Table 呈现不完整。 |
| SS-B-F07-OFFLINE | baseline | F07 offline | 失败 | 只声明离线摘录范围，不冒充线上穷尽；旧 Table 呈现不完整。 |
| SS-B-F07-UNREADABLE | baseline | F07 unreadable | 通过 | 缺失附件未标记已读，正文规则保留，采集缺口阻止完整声明。 |
| SS-B-F08 | baseline | F08 complete | 失败 | 范围、公式、示例性质和 80.00 结果正确；旧 Table 呈现不完整。 |
| SS-B-F08-MISSING | baseline | F08 missing formula | 通过 | 缺公式和折扣率范围触发必要澄清，概述未被当规则。 |
| SS-C-F01-1 | candidate | F01 repeat 1 | 通过 | 单点保留，并形成同一公告的创建→发布可见及创建→发布→撤回完整路径；全量 Table。 |
| SS-C-F01-2 | candidate | F01 repeat 2 | 通过 | 独立重拟标题后语义相同，无对象切换或结果合并；全量 Table。 |
| SS-C-F01-3 | candidate | F01 repeat 3 | 通过 | 反向追溯确认标题规则、发布、可见与撤回均有终点；全量 Table。 |
| SS-C-F02-AND-1 | candidate | F02 AND | 通过 | 成功要求权限 AND 草稿；两个拒绝原因独立，互斥组合不生成。 |
| SS-C-F02-OR-1 | candidate | F02 OR | 通过 | 专门授权 OR（普通权限 AND 草稿）；必要拒绝分支独立。 |
| SS-C-F03-FINAL | candidate | F03 final | 通过 | 先问边界；最终 72 小时含边界口径只作用于当前问题，形成 Grounded 结果。 |
| SS-C-F03-TEMP | candidate | F03 temporary | 通过 | 临时 48 小时含边界口径为 E1，依赖用例保持 Conditional。 |
| SS-C-F03-UNKNOWN | candidate | F03 unknown | 通过 | unknown 不变成答案或 NotApplicable，缺口留在交付限制。 |
| SS-C-F03-DEFER | candidate | F03 defer | 通过 | defer 只改变当前项状态，不关闭或回答它。 |
| SS-C-F03-DELIVERY | candidate | F03 delivery | 通过 | request_delivery 只关闭显式当前项用于交付，不影响未来 root。 |
| SS-C-F03-PARTIAL | candidate | F03 partial | 通过 | 只回答另一个独立项；整个时间边界问题继续 pending，不提交依赖它的 Case。 |
| SS-C-F03-INVALID | candidate | F03 invalid | 通过 | 空白/无关文本没有可靠绑定，不形成接受修订。 |
| SS-C-F04-1 | candidate | F04 repeat 1 | 通过 | 选择与点击查询分开，匹配记录出现且非匹配记录不出现。 |
| SS-C-F04-2 | candidate | F04 repeat 2 | 通过 | 更换具体逻辑数据后仍以正反样本识别 false positive。 |
| SS-C-F04-3 | candidate | F04 repeat 3 | 通过 | 另行覆盖同一响应记录 10→草稿、20→已发布，不断言总数/排序/分页。 |
| SS-C-F05-1 | candidate | F05 | 通过 | A 的输入、校验待定、失败和通过分别驱动 B 可用性；真实编号不是生成门槛。 |
| SS-C-F06-UI | candidate | F06 UI | 通过 | 只观察同一规则 UI 状态，不扩展接口/存储/事件。 |
| SS-C-F06-INTERFACE | candidate | F06 interface | 通过 | 捕获准备早于点击；请求发出与 accepted 业务结果分别验证。 |
| SS-C-F06-MISSING | candidate | F06 missing rule | 通过 | 请求 Case 可生成；业务成功判定缺口在生成前提出，不虚构协议。 |
| SS-C-F07-1 | candidate | F07 repeat 1 | 通过 | 实际读取图片、两页评论和末页标记；不采纳 C-101，采纳 C-102。 |
| SS-C-F07-2 | candidate | F07 repeat 2 | 通过 | 参考图片只支持路径理解，不把颜色、尺寸或按钮字样变成 Oracle。 |
| SS-C-F07-3 | candidate | F07 repeat 3 | 通过 | 同一公告保存→发布→自动可见，不要求读者手动刷新。 |
| SS-C-F07-OFFLINE | candidate | F07 offline | 通过 | 只声称 supplied excerpt 已读，不声称线上正文/评论已穷尽。 |
| SS-C-F07-UNREADABLE | candidate | F07 unreadable | 通过 | 有效正文规则保留；不可访问附件未标记为已查看或完整采集。 |
| SS-C-F08 | candidate | F08 complete | 通过 | 规则范围、可替换示例、合法推导及明确 80.00 实例分别保留。 |
| SS-C-F08-MISSING | candidate | F08 missing formula | 通过 | 必要公式/参数缺失先澄清，不用概述或常识补造。 |

## Comparison

- Candidate: 26/26 same-session review observations were marked pass against the semantic and current presentation oracle.
- Baseline: semantic strengths were preserved, but the old Table family failed the new full-presentation requirement; F04 repeats 1 and 2 also retained a weak-signal false-positive gap.
- No candidate regression was observed in this oracle-aware same-session review matrix. Because raw row transcripts and exact deployment settings are unavailable, this sentence is intentionally narrower than a replayable run or frozen independent-context claim.
