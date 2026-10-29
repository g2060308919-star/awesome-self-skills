# 综合样本独立语义复审：第 2 轮

结论：**第一轮 R01–R11 的指定修复已核实；本轮仍需要修订，不能签发全部 passed 的 completion。**

审阅者：独立上下文 `/root/source_first_review`，继续使用先读原始来源而形成的 70 项独立目标。未参与本轮产物修改。

- 当前运行：`RUN-02574bfb-f224-4b73-a87b-306d48d91c9d`，source revision `0`。
- 当前 review target digest：`sha256:207c7daf7821f550a1bbbbf8605b6af5ac2564e05c49438059d7071fc15955a9`。
- 已读取新 review_request、accepted/r000 source/claims/views、staging case-drafts，并逐条比对事实→view/outcome→正式测试点→用例及反向来源证据。
- 131 条链路均对应实际工件；86 条与上轮语义相同的用例通过逐字段差分复核，其余 24 条已修改用例和 21 条新增用例重新阅读全文审阅。
- 原始综合样本与 accepted source 完全一致；当前 70 个目标的 objective 与独立清单完全一致；131 条事实、view element、测试点和 Case 的条件／动作／预期一致，新增拆分 oracle 的预期亦可在对应上游 view/outcome 找到。
- 未修改生成内容、编译器或旧运行；旧第 1 轮失败报告仍有效地记录当时问题。

## R01–R11 的复核结果

| 原问题 | 当前证据与结论 |
| --- | --- |
| R01 待开始数据矛盾 | 四条待开始操作已使用 S=12:30、T=12:00、E=13:00，并在动作前确认状态；已修复。 |
| R02 待开始取消／失败遗漏 | 新增 LOCAL-cancel-下线-待开始、LOCAL-failure-下线-待开始，失败与重试分别核对；已修复。 |
| R03 中间 oracle 过晚 | 保存失败、行操作失败、取消重开、同一记录生命周期分别按真实观察步骤绑定 oracle；已修复。 |
| R04 跨提交／确认／重试结束时间遗漏 | 新增发布跨提交、启用跨确认／重试、三入口发布重试，T0<E、T1=E，预期拒绝；已修复。 |
| R05 超级管理员正向能力不足 | 新增／编辑／复制实际保存并核对身份和值；超级管理员五状态复制均保存草稿；已修复。反向只读步骤另见 N01。 |
| R06 已过期复制保存差异遗漏 | LOCAL-expired-copy-保存草稿 与 LOCAL-expired-copy-保存并生效 保留过期回填值，分别成功草稿／拒绝发布；已修复。 |
| R07 闭区间关系不足 | 增加包含、左右部分交叉、完整相等、右侧不相交和同点零时长记录；已修复。 |
| R08 名称完整／尾部匹配遗漏 | 搜索 Ab 的数据新增 E=Ab 和 F=XAb，均要求命中；已修复。 |
| R09 搜索完成后恢复遗漏 | 首次请求完成后再搜索的 STEP-3 明确允许新请求并展示结果；已修复。 |
| R10 复制新字段未核对 | 三个复制保存场景明确核对新记录 Gamma 与两个输入时间，原对象不变；已修复。 |
| R11 初始化来源绑定不全 | 新增／编辑／复制权限事实和 oracle 分别已包含 CLM-6／CLM-32／CLM-31；已修复。 |

## 本轮实际发现

### N01 [P1] 只读用户的三个表单操作没有真实尝试保存

- 独立目标：C02、C03、C09、C43。
- case_id：`LOCAL-permission-只读用户-新增`、`LOCAL-permission-只读用户-编辑`、`LOCAL-permission-只读用户-复制`。
- 来源：CLM-3「仅管理员、超级管理员可以新增、编辑、复制、下线、启用。」

这三条仍只有“尝试新增／编辑／复制；行操作出现确认时确认”的 STEP-0。新增、编辑、复制点击入口后是表单流程，并非一次行确认即完成；步骤没有填写三个合法字段或点击保存。即使错误实现给只读用户开放表单和保存权限，执行到入口后也不会产生写入，因而“未产生新增／原记录不变”不能证明禁止写操作。第一轮已解决的是超级管理员正向保存权限，本轮发现的是反向权限场景的同类执行缺口。

修改建议：不预设必须隐藏还是禁用。尝试入口；如果能进入可编辑表单，就使用本条合法数据尝试保存，观察拒绝且无新增／无更新。若入口已经不可用，记录该拒绝即可结束。分别明确新增、编辑、复制的步骤和原对象／数量断言。

### N02 [P2] 复制取消的零新增结果及不同来源的重开缓存区别仍不足

- 独立目标：C44、C55。
- case_id：`LOCAL-reopen-复制`。
- 来源：CLM-31「复制先打开带全部可编辑值的新增弹窗，保存成功后才新建记录，原记录不变。」；CLM-36「取消关闭弹窗，再次打开按对应新增、复制或编辑入口的初始化规则处理，不恢复上次未保存内容。」

本条取消后的 oracle 仅写“未保存的 Temp 及新时间未写入记录”，没有检查是否错误地新增了源 Beta 的副本；源记录身份／字段不变也不能排除额外副本。再打开仍是同一个来源，无法检出“取消 A 后从 B 复制却复用 A 的原值”的缓存错误。不同来源区别已经写入先前 C55 目标，并非复审临时新增的要求。

修改建议：取消前后核对记录数量／新记录集合，明确零新增且原对象不变；保留当前同源重开初始化用例，再增加源 A=Beta、源 B=Delta 且时间不同的场景：复制 A 修改为 Temp 后取消，从 B 打开复制必须回填 B 的三个字段，而非 A 或 Temp。

### N03 [P2] 状态筛选未区分目标已列出的相近状态

- 独立目标：C59。
- case_id：`LOCAL-filter-管理员`、`LOCAL-filter-超级管理员`、`LOCAL-filter-只读用户`、`LOCAL-filter-and`。
- 来源：CLM-38「状态筛选精确匹配。」

三种角色的状态筛选都只选择草稿并排除已下线；组合筛选也只使用草稿和已下线。没有实际选择待开始、生效中或已过期。把待开始和生效中合为“未过期发布”，或把已过期和已下线合为“结束态”的错误筛选仍会通过当前数据，不能据此将 C59 全部标为 verified。

修改建议：准备具有稳定标识的五状态记录，在同一明确 UTC 当前时刻以合法 S/E 保证状态；逐个选择状态，预期仅命中对应记录。至少明确待开始与生效中互不命中、已过期与已下线互不命中。

### N04 [P2] AND 目标中仅满足单个条件的三类记录仍缺失

- 独立目标：C66。
- case_id：`LOCAL-filter-and`。
- 来源：CLM-42「已填写的条件全部满足才匹配。」

当前 A 满足三个条件，B/C/D 各缺一项，因此三个反例都满足另外两项。先前 C66 目标还明确要求仅满足名称、仅满足状态、仅满足时间的记录，这些没有进入数据。举例，错误逻辑“满足奇数个条件即可匹配”会让 A 命中、B/C/D 全不命中，恰好通过现有用例；单项记录能直接揭示该错误。

修改建议：在原有 A/B/C/D 上补 E 仅名称匹配、F 仅状态匹配、G 仅时间相交，预期 E/F/G 均不命中；可以再加全部不满足记录。给出与现有数据一致的明确名称、状态和 UTC 区间，保留 A 为唯一命中。

## 交付决定

本轮不写 `comprehensive-review-completion.json`：当前 schema 的最终 assessment 需要 required_recheck.status=passed，而上述 8 个目标仍有未解决项。生成一个全部 passed 的文件会错误声称独立复核已完成。修复后须基于新的实际 review_request 重新绑定和复核，不能复用当前目标摘要。

AT20／AT22／AT23 的明确变异样本尚未收到，本报告不对其作判断。

## 逐目标真实证据映射

下表为逐目标人工语义核对后的实际证据映射。“部分”目标不得转换成 passed。当前 62 项已核实、8 项部分；不以用例数量推导覆盖。每个 LOCAL case_id 均来自本次运行，其 FACT／TP／RCASE 可由该用例的实际链接解析。

| 独立目标 | 结论 | 目标责任 | 实际用例 |
| --- | --- | --- | --- |
| C01 | 已核实 | 分别证明管理员与超级管理员具有新增、编辑、复制、下线和启用权限，不以管理员成功推定超级管理员权限正确。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用` |
| C02 | 部分，见 N01 | 只读用户可筛选和查看，但不能成功新增、编辑、复制、下线或启用；允许与禁止动作分别验证。 | `LOCAL-view-只读用户`, `LOCAL-filter-只读用户`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用` |
| C03 | 部分，见 N01 | 每项操作同时满足角色与状态约束：管理权限不绕过状态限制，合法记录状态也不赋予只读用户变更权限。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用`, `LOCAL-state-草稿-下线`, `LOCAL-state-草稿-启用`, `LOCAL-state-草稿-编辑`, `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-下线`, `LOCAL-state-待开始-启用`, `LOCAL-state-待开始-编辑`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-下线`, `LOCAL-state-生效中-启用`, `LOCAL-state-生效中-编辑`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-下线`, `LOCAL-state-已过期-启用`, `LOCAL-state-已过期-编辑`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-下线`, `LOCAL-state-已下线-启用`, `LOCAL-state-已下线-编辑`, `LOCAL-state-已下线-复制` |
| C04 | 已核实 | 权限预期验证允许或禁止对应操作，不额外固定来源未指定的入口隐藏、禁用方式或拒绝文案。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用` |
| C05 | 已核实 | 名称、开始时间、结束时间分别必填，逐个清空且其他字段合法时验证非法输入不提交。 | `LOCAL-required-名称`, `LOCAL-required-开始时间`, `LOCAL-required-结束时间` |
| C06 | 已核实 | 名称区分合法长度 1、10 与非法长度 0、11，并区分 ASCII 英文字母与非字母、非 ASCII 字符。 | `LOCAL-name-A`, `LOCAL-name-ABCDEFGHIJ`, `LOCAL-required-名称`, `LOCAL-name-ABCDEFGHIJK`, `LOCAL-name-Ab1`, `LOCAL-name-中`, `LOCAL-name-A B`, `LOCAL-permission-管理员-新增` |
| C07 | 已核实 | 新增弹窗打开时名称、开始时间、结束时间全部为空。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-超级管理员-新增` |
| C08 | 已核实 | 有权限用户可从所有状态复制，打开的是新增弹窗，原记录的名称、开始时间、结束时间全部回填。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` |
| C09 | 部分，见 N01 | 仅草稿且角色有权限时可编辑，打开编辑弹窗时三个可编辑字段全部清空，不按常见惯例回填。 | `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-state-草稿-编辑`, `LOCAL-state-待开始-编辑`, `LOCAL-state-生效中-编辑`, `LOCAL-state-已过期-编辑`, `LOCAL-state-已下线-编辑`, `LOCAL-permission-只读用户-编辑` |
| C10 | 已核实 | 所有时间数据使用 UTC 和秒精度，写明明确当前时刻并控制或记录执行时钟，不能使用本地日期、模糊未来过去或失效常量冒充当前。 | `LOCAL-publish-end-早于`, `LOCAL-publish-end-等于`, `LOCAL-publish-end-晚于`, `LOCAL-publish-start-早于`, `LOCAL-publish-start-等于`, `LOCAL-publish-start-晚于`, `LOCAL-publish-cross-submit`, `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry`, `LOCAL-same-object-lifecycle` |
| C11 | 已核实 | 开始时间大于结束时间时报错且不提交，小于与等于均符合区间顺序要求；等于仍需满足具体保存动作的附加条件。 | `LOCAL-order-大于`, `LOCAL-order-等于`, `LOCAL-publish-start-早于` |
| C12 | 已核实 | 其他非法输入不提交，仅对来源明确要求的文案进行精确匹配，不虚构其他精确报错或错误优先级。 | `LOCAL-required-名称`, `LOCAL-name-Ab1`, `LOCAL-name-中`, `LOCAL-order-大于`, `LOCAL-filter-invalid-起点晚于终点` |
| C13 | 已核实 | 字段合法时，结束时间早于、等于、晚于提交时刻均可保存草稿且状态为草稿，不套用发布的未来结束时间限制。 | `LOCAL-draft-end-早于`, `LOCAL-draft-end-等于`, `LOCAL-draft-end-晚于` |
| C14 | 已核实 | 保存并生效时结束时间早于实际提交时刻，不提交并精确提示“结束时间必须晚于当前时间”。 | `LOCAL-publish-end-早于` |
| C15 | 已核实 | 保存并生效时结束时间等于实际提交时刻，同样不提交并精确提示“结束时间必须晚于当前时间”。 | `LOCAL-publish-end-等于` |
| C16 | 已核实 | 保存并生效时结束时间晚于提交时刻且开始时间也晚于提交时刻，成功后状态为待开始。 | `LOCAL-publish-start-晚于` |
| C17 | 已核实 | 保存并生效时结束时间晚于提交时刻、开始时间恰等于提交时刻，成功后状态为生效中。 | `LOCAL-publish-start-等于` |
| C18 | 已核实 | 保存并生效时结束时间晚于提交时刻、开始时间早于提交时刻，成功后状态为生效中。 | `LOCAL-publish-start-早于` |
| C19 | 已核实 | 开始与结束相等且都晚于提交时刻时允许保存并生效并成为待开始；到该共同时间直接成为已过期，没有生效中时间区间。 | `LOCAL-order-等于`, `LOCAL-equal-expire` |
| C20 | 已核实 | 打开或填写表单时未来的结束时间，在实际保存并生效提交时已等于或早于当前时刻，应按提交时刻拒绝，不沿用旧时钟。 | `LOCAL-publish-cross-submit` |
| C21 | 已核实 | 保存成功关闭弹窗，持久化名称、开始时间、结束时间与输入一致，并按入口区分创建对象或更新对象。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中` |
| C22 | 已核实 | 已发布且未下线记录在当前时刻早于开始时间时为待开始。 | `LOCAL-state-开始前` |
| C23 | 已核实 | 已发布且未下线记录在当前时刻等于开始时间且仍早于结束时间时为生效中。 | `LOCAL-state-开始相等` |
| C24 | 已核实 | 已发布且未下线记录在开始时间与结束时间之间为生效中。 | `LOCAL-state-开始后`, `LOCAL-state-结束前` |
| C25 | 已核实 | 已发布且未下线记录在当前时刻恰等于结束时间时为已过期。 | `LOCAL-state-结束相等` |
| C26 | 已核实 | 已发布且未下线记录在当前时刻晚于结束时间时为已过期。 | `LOCAL-state-结束后` |
| C27 | 已核实 | 开始与结束相等的记录在恰到共同时间时为已过期，不错误套用开始边界的生效中规则。 | `LOCAL-equal-expire` |
| C28 | 已核实 | 草稿随时间跨越开始或结束时间不自动发布，仍是草稿。 | `LOCAL-no-auto-草稿` |
| C29 | 已核实 | 已下线记录随时间跨越开始或结束时间不自动发布，仍是已下线。 | `LOCAL-no-auto-已下线` |
| C30 | 已核实 | 状态依观察时的当前时刻判定，不添加固定自动刷新频率或仅因页面未自动刷新判失败。 | `LOCAL-state-开始前`, `LOCAL-state-开始相等`, `LOCAL-state-结束相等` |
| C31 | 已核实 | 待开始与生效中分别允许下线；二次确认取消不改变记录，确认成功变为已下线。 | `LOCAL-state-待开始-下线`, `LOCAL-state-生效中-下线`, `LOCAL-cancel-下线`, `LOCAL-cancel-下线-待开始` |
| C32 | 已核实 | 草稿、已过期、已下线不可下线；只读用户即使面对待开始或生效中记录也不可下线。 | `LOCAL-state-草稿-下线`, `LOCAL-state-已过期-下线`, `LOCAL-state-已下线-下线`, `LOCAL-permission-只读用户-下线` |
| C33 | 已核实 | 只有已下线可启用；其结束时间早于与等于实际提交时刻时分别拒绝并精确提示“无法启用”。 | `LOCAL-enable-expired-早于`, `LOCAL-enable-expired-等于`, `LOCAL-state-草稿-启用`, `LOCAL-state-待开始-启用`, `LOCAL-state-生效中-启用`, `LOCAL-state-已过期-启用` |
| C34 | 已核实 | 已下线且结束时间晚于当前时刻时启用需要二次确认，取消后原记录不变。 | `LOCAL-cancel-启用`, `LOCAL-state-已下线-启用` |
| C35 | 已核实 | 合法启用确认成功时，开始时间晚于提交时刻为待开始，等于或早于为生效中，三种情况均须结束时间晚于提交时刻。 | `LOCAL-enable-start-未来`, `LOCAL-enable-start-相等`, `LOCAL-state-已下线-启用` |
| C36 | 已核实 | 草稿、待开始、生效中、已过期不可启用，即使结束时间尚在未来也不能突破状态限制。 | `LOCAL-state-草稿-启用`, `LOCAL-state-待开始-启用`, `LOCAL-state-生效中-启用`, `LOCAL-state-已过期-启用` |
| C37 | 已核实 | 待开始或生效中下线请求失败，记录保持各自原状态，提示操作失败并允许重试。 | `LOCAL-failure-下线`, `LOCAL-failure-下线-待开始` |
| C38 | 已核实 | 已下线记录启用请求失败，仍保持已下线，提示操作失败并允许重试。 | `LOCAL-failure-启用` |
| C39 | 已核实 | 下线或启用请求尚未完成时，同一记录不接受重复行操作；建立实际处理中窗口并检查单次效果，不推断不同记录的并发规则。 | `LOCAL-duplicate-下线`, `LOCAL-duplicate-启用` |
| C40 | 已核实 | 二次确认等待或重试后，以实际提交时刻重新判断启用的结束时间；确认时已经到期的记录不能凭旧判断启用。 | `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry` |
| C41 | 已核实 | 下线或启用二次确认取消、请求失败均追踪同一原记录的身份及数据，不能另建或替换对象来冒充原记录不变。 | `LOCAL-cancel-下线`, `LOCAL-cancel-下线-待开始`, `LOCAL-cancel-启用`, `LOCAL-failure-下线`, `LOCAL-failure-下线-待开始`, `LOCAL-failure-启用` |
| C42 | 已核实 | 所有三类角色可查看所有五种状态记录，完整展示名称、开始时间、结束时间和状态且均只读。 | `LOCAL-view-管理员`, `LOCAL-view-超级管理员`, `LOCAL-view-只读用户` |
| C43 | 部分，见 N01 | 管理员和超级管理员均可复制草稿、待开始、生效中、已过期、已下线记录；只读用户不可复制。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线`, `LOCAL-permission-只读用户-复制` |
| C44 | 部分，见 N02 | 打开复制弹窗只回填，不立即新建；取消或尚未保存成功时不能认定已生成复制记录。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-reopen-复制`, `LOCAL-save-failure-复制` |
| C45 | 已核实 | 复制保存成功产生独立新记录，源记录标识、字段和状态不变；新记录状态取决于本次保存动作及时间，而非直接继承源状态。 | `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` |
| C46 | 已核实 | 复制弹窗的回填字段仍适用编辑及保存规则；复制已过期记录后可保存草稿，但不修改已过期结束时间就不能保存并生效。 | `LOCAL-expired-copy-保存草稿`, `LOCAL-expired-copy-保存并生效` |
| C47 | 已核实 | 编辑草稿时全部字段先清空，保存成功更新同一原记录，不能新增记录或以旧值冒充新输入。 | `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` |
| C48 | 已核实 | 编辑保存草稿仍为草稿；编辑保存并生效必须通过结束时间条件，再按开始时间成为待开始或生效中。 | `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中`, `LOCAL-publish-retry-编辑` |
| C49 | 已核实 | 明确区分新增创建新对象、编辑更新原对象、复制创建新对象且源对象不变，不能统一用“列表出现数据”代替身份断言。 | `LOCAL-permission-管理员-新增`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`, `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` |
| C50 | 已核实 | 编辑保存针对原记录而非其他记录，使用稳定对象标识验证更新目标，不能仅按列表顺序判定。 | `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` |
| C51 | 已核实 | 新增、复制、编辑保存失败时均保留弹窗及名称、开始时间、结束时间全部输入，并允许重试，不能清空或恢复入口初始值。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑` |
| C52 | 已核实 | 保存请求处理中重复点击仅一次保存效果；新增和复制不重复新建，编辑不重复执行对应保存效果，必须有未完成请求窗口。 | `LOCAL-save-duplicate-新增`, `LOCAL-save-duplicate-复制`, `LOCAL-save-duplicate-编辑` |
| C53 | 已核实 | 保存成功关闭弹窗，保存请求失败保留弹窗；非法输入校验不提交，与请求失败属于不同结果。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-编辑`, `LOCAL-required-名称`, `LOCAL-publish-end-等于` |
| C54 | 已核实 | 取消关闭弹窗后再次打开，新增三个字段为空、复制按本次源记录回填全部字段、编辑三个字段为空。 | `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` |
| C55 | 部分，见 N02 | 任一入口取消后重开都不恢复上次未保存输入；使用不同输入与不同复制来源区分正确初始化和错误缓存。 | `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` |
| C56 | 已核实 | 区分失败后留在同一弹窗时保留输入，与取消后重开时重新初始化，不能混用两个生命周期预期。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑`, `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` |
| C57 | 已核实 | 保存失败后的重试按照新的实际提交时刻校验字段与时间，不能绕过保存并生效所需的未来结束时间。 | `LOCAL-publish-retry-新增`, `LOCAL-publish-retry-复制`, `LOCAL-publish-retry-编辑` |
| C58 | 已核实 | 所有角色可进行名称筛选；区分大小写，匹配连续子串，覆盖完全匹配、首中尾子串与大小写不同、不连续字符的反例。 | `LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`, `LOCAL-filter-管理员`, `LOCAL-filter-超级管理员`, `LOCAL-filter-只读用户` |
| C59 | 部分，见 N03 | 状态筛选仅精确匹配目标状态，不把待开始与生效中、已过期与已下线等不同状态合并。 | `LOCAL-filter-管理员`, `LOCAL-filter-超级管理员`, `LOCAL-filter-只读用户`, `LOCAL-filter-and` |
| C60 | 已核实 | 生效时间筛选按闭区间相交判断，记录开始不晚于筛选结束且记录结束不早于筛选开始即相交，不能错误要求完全包含。 | `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-inside`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval`, `LOCAL-filter-time-right-disjoint`, `LOCAL-filter-time-equal`, `LOCAL-filter-time-zero-record` |
| C61 | 已核实 | 分别验证记录包含筛选、筛选包含记录、左右部分交叉和完全相等的区间均匹配。 | `LOCAL-filter-time-inside`, `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval` |
| C62 | 已核实 | 记录结束等于筛选开始、记录开始等于筛选结束两种端点接触分别匹配；左右相隔一秒等不相交区间分别不匹配。 | `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-right-disjoint` |
| C63 | 已核实 | 筛选起点等于终点合法，可与覆盖该时刻的记录匹配，也可与同点的零时长记录匹配。 | `LOCAL-filter-time-equal`, `LOCAL-filter-time-zero-record` |
| C64 | 已核实 | 时间筛选起止均未填不限制结果；仅填起点、仅填终点、起点晚于终点分别不发起搜索并精确提示“时间范围不合法”。 | `LOCAL-filter-empty`, `LOCAL-filter-invalid-缺结束`, `LOCAL-filter-invalid-缺开始`, `LOCAL-filter-invalid-起点晚于终点` |
| C65 | 已核实 | 未填名称、状态、时间条件分别不限制结果，不把空字段当作需要匹配的实际值。 | `LOCAL-filter-empty`, `LOCAL-filter-name-Ab`, `LOCAL-filter-管理员`, `LOCAL-filter-time-inside` |
| C66 | 部分，见 N04 | 所有已填筛选条件以 AND 组合；用仅满足名称、仅满足状态、仅满足时间、满足部分及全部条件的记录验证不能用 OR 或遗漏条件。 | `LOCAL-filter-and` |
| C67 | 已核实 | 首次搜索进入 loading，在请求尚未结束时再次触发不产生新搜索请求，不能只验证按钮外观。 | `LOCAL-search-loading` |
| C68 | 已核实 | 搜索完成后可再次执行有效搜索，不将仅限完成前的限制变成永久锁定。 | `LOCAL-search-loading` |
| C69 | 已核实 | 重置后名称、状态和时间筛选字段全部为空，不对是否自动搜索作通过或失败判断。 | `LOCAL-reset` |
| C70 | 已核实 | 筛选用例给出可判定的预置记录和预期命中对象集合，以实际集合验证各筛选规则，不能只写“展示正确结果”。 | `LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`, `LOCAL-filter-and`, `LOCAL-filter-empty`, `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-outside` |

## 当前目标 ID

| 独立目标 | 当前 IRT |
| --- | --- |
| C01 | `IRT-27c40e5bcaaafd4f156ebf53cef95d5630520d9617fc71c498b9722c5b133d99` |
| C02 | `IRT-42bd7644c249578e088270aa4255856289aede5bc5cebf2ccf6b2d99a15df4e9` |
| C03 | `IRT-17701569136a8e99bc565f48fc8424ed7ce602f4c5f294f151ab280cbe897a89` |
| C04 | `IRT-1ff05e15d186f8e57b73b291635bb9be14276d1e6c9d686f47685905e144b4a1` |
| C05 | `IRT-fd4181c2553d8e72076dbc95ede48bbd9d6174a8cc7273251857d14095cf315e` |
| C06 | `IRT-f62a01c052c3c366dd60569d3d8d65bb4c41c1a6eafd4e6542d9ea11587b7ae3` |
| C07 | `IRT-2d4e1094cce6aa737e34d1f7f2f5e9cbc4e027cbbf81446936085512ec9f177f` |
| C08 | `IRT-93dcb66e00860752801f3dec1d7d052913f681bfce0577b9cabdc11daa2d404a` |
| C09 | `IRT-810aed941e45d4663218912f9005afea3349507e90bb0b85dec826ef6c568906` |
| C10 | `IRT-0a3a02c0f1a070aab57e5060efe82e2aa5dff5e79946b3bab80b24405f730a6b` |
| C11 | `IRT-12772a4a4db7843e247c49af4330ce9ccadde6039bf8c90ac78f20d1a7342cf4` |
| C12 | `IRT-5a869be2792abf8045f405543e7ea5730eee9a12fbcb1e6210caa4dab9aca347` |
| C13 | `IRT-5740ff7bc7acf4441e701c53bcdf63a8004e29a1dbc8f77e3b9f50abaf91f172` |
| C14 | `IRT-81f2b60c71a40c6d072b1a4b4e24fa13a3dcd57f82bf58fd6d58c47f7731b487` |
| C15 | `IRT-364a9daedfb30de7db5f7116bc3e382c99cdabe8b8aa4a859a4d57290381fc87` |
| C16 | `IRT-41b1d989e5271ecc3056096d74469100a416b9574aed1496cfc1d8e0e3d9c392` |
| C17 | `IRT-d5228d2bb6455e24368066189a1c9dfc9a826e1fef25450a48ceffed508c6e36` |
| C18 | `IRT-4a23778fc92989848d41c059daafae20fc8c9357f108ff9e2375e46fa55610fb` |
| C19 | `IRT-851a5c06149a69df7025257441194a2f0c689b75344d45a16e504e4b9f73b767` |
| C20 | `IRT-e0cc6e5de953bbf4bbaee85f325cec6360a67fd7bacc639101c6015a11f45a12` |
| C21 | `IRT-ebbeea9684184077e150acba7cd7c4a96c3cb42a64e73bdfc7c561cf43c432c2` |
| C22 | `IRT-6c0439b2ad2afe02427e9f93f0c8cb0f46bdc0501145176d18615bb76ac80bf2` |
| C23 | `IRT-4bc49cf43cbccc795a00e81271bd9e9cf87dd1e0c1b03ad467de41f396237c05` |
| C24 | `IRT-c0e3ff9dbb512e761e7ca03fccac64c268bc0775b664dadd135525d53662c855` |
| C25 | `IRT-9b2c3e5f741e3d82673291f1b7a7c5ef1007daffc544ede3cd0a20558a8a1976` |
| C26 | `IRT-4c897bce60125fbe35ae23c123ac9db3df86de79862d63419d10e2accbdb02c6` |
| C27 | `IRT-5ab52397d8f516181d98d2b9f96bd16581beb72eb2fa7c3da977d831f8dc6e60` |
| C28 | `IRT-b01660dad8289c5d01ff64244f9233ce1edea9e5900c582fd4e5874c70a954ae` |
| C29 | `IRT-9b19c6d2bb9fae41435caad6a28808e94768d0474de8eed64f5d5c73cbb0f168` |
| C30 | `IRT-7f1ac85c635ef3b0740f9fadf31617314415edd2f9f77e7f09c87505bffafec0` |
| C31 | `IRT-6c9ee68448ad3353ceab6236c90493c447c04b5f7f8124dac6d4ee53141525e5` |
| C32 | `IRT-e7258d5531da9d530e37d9856257d737d906edc95e5b84f7b097ff7945991575` |
| C33 | `IRT-23d72e5e6f1f7fbe0a230e3f9eefdeae74bd80f35b0ec2e5de9f3b699216ee82` |
| C34 | `IRT-6c31b7dd17567c6137984e192da45446fa631e1cfedd7e806641d9ca40848db9` |
| C35 | `IRT-e26afe9d913ab60da371a64e537ec7ae34440a71925a9d54d0c7624075115dd5` |
| C36 | `IRT-fc22830dd9bb3e882d735646916e36764a78e575991385313b69fc7e4efb32ee` |
| C37 | `IRT-985169c75ed1d2a2ab01cdf32a24dcd7d3a0db5938b8d0e42a6b91b6a454b7f8` |
| C38 | `IRT-6ffdd49edd4e7d471b8a13b9be7cf509b01f8fb6335e0abc2785f52113ccbb55` |
| C39 | `IRT-a9610f26ae2acac9160808ae5dabd9bf54e5a09606a60eff7aac503a93782c18` |
| C40 | `IRT-19f6937fa9ca3e759dd7fa0e56ba9b7b0396271050c8098f2a1a6f1541df032b` |
| C41 | `IRT-a27fd60f0859c70e66f331e02fd6f14f31df6ee31ed0f13e32462ef312bf6796` |
| C42 | `IRT-305f2c032096189c74805464e0e0e16d6d1900b41216c6dda60aa72b75242abf` |
| C43 | `IRT-7c3a85490f8bcd994963980d4355da4f69b0dc84d01d006c6aa979286ab1963b` |
| C44 | `IRT-f6bf4b3738231617bb3db492a751d41604c8f79ce6d785ebce11a32182d324b8` |
| C45 | `IRT-e632b8d7f0b8ae44bcacae5a417a6708f7e111465baa2b5b55ed21e6e6b1ced2` |
| C46 | `IRT-395a2ccbb4bd921b69bcabdb743bd4660d7525c93adaf5eee5e0a26ec5d75e48` |
| C47 | `IRT-8c524e112af8fde7cad858e9e18cdb476eb9071b7dcd8e7be84d318c8901c333` |
| C48 | `IRT-f05776500444878d9daf7419648551faa5c72ab23bab861e0403747556ca1c5f` |
| C49 | `IRT-e158c63abf07f34d4cd0dd57aca74ee793e4f8c89bd4de3fa9cfa8e464a4acbb` |
| C50 | `IRT-2991d61640df4ca48e1ddbd54c5003c656a60fc03dd55f26577010ef5071b9da` |
| C51 | `IRT-38f1f39d2df45beaf61787adc48965cd0a569105ab2546f247123047a8b3a1d5` |
| C52 | `IRT-da548ab7eee29e1a3bc502c4665c6aaa2285f413e1c919922351eed106e859b2` |
| C53 | `IRT-955ad285c08103c809aea2da25dc51dbaa34804faf3b2460694ab85796cb1bc0` |
| C54 | `IRT-3211adc951aea63ca2acfb7d3943e4039d7aed9b6e50af562c9af17dbbd9ee06` |
| C55 | `IRT-7b02d9215bdbe879471ca746ffe8c9ea0c6c0e91b0f7b326fc1fdb491ce17955` |
| C56 | `IRT-4725e0228fe14481edf78c35404dcb0299f422ec6a63bb2122e854b6ee2c7920` |
| C57 | `IRT-ef300108d541bf42ce23d57f96013bac8a1fac33a985e66a53fc0f8031a5b50d` |
| C58 | `IRT-e1177eee67825ab25f0a838ee0c6045e1c8f94928667027687a080266c581849` |
| C59 | `IRT-cd2deec03de99d331f03ca58dcb9ceedfa1971b6646fe7c016b1216c03d4e87e` |
| C60 | `IRT-c870a15dc1edcf09b9ddee192233376ce99e6b90bfbdaedaf8671f37bfdb41e0` |
| C61 | `IRT-0cad227766408d0ef2ad12a8f24dff793561b328b2350446bdd1f5ad173b8dba` |
| C62 | `IRT-be6c31c8d91bb589743c530cb47e653cbec546218550609215330d6181d49462` |
| C63 | `IRT-5dcd811af8903d5c17e3d35fbdf27d276e5d80538a28083032958e29ef7425d2` |
| C64 | `IRT-7b2892f4b4640d435d6da7aefb3f2b79e2f51676094687ee7cb03e3866fe9bef` |
| C65 | `IRT-519eeffa2b53dbbe461f990a43b0eac72dcf3a94ba56bdbce142142554563336` |
| C66 | `IRT-873f3bfbe5dd9a4609ad2d8c1fd41283486b2e3aed565b13eef6328e341f4560` |
| C67 | `IRT-89b226efc3af7db19b016566bc7556cf76deca1995985075a4a8bfd2eb275b1b` |
| C68 | `IRT-d63adf01d78696007c9f2de60fad804961f373658bbe62c23735e080553ffe67` |
| C69 | `IRT-06e70c7ee6dabb7215c87aa4f43df8c169bbceaabb843128799a4b41189d46ef` |
| C70 | `IRT-8bc90f19752d58a2d8348c3f269ed63a55e8b50b57906ed4592bc67a160889c9` |

## 未解决项的精确链路

| LOCAL case_id | FACT | TP | 当前 RCASE |
| --- | --- | --- | --- |
| `LOCAL-permission-只读用户-新增` | `FACT-permission-只读用户-新增` | `TP-d3405d9cdef3acff1d59f3a971a3b42c304be90bc82b8f4051b9417804b4f017` | `RCASE-259e75f9671e023e1e18da46839e01ce0eafe8c8292253d4a855eb25dbe64a2f` |
| `LOCAL-permission-只读用户-编辑` | `FACT-permission-只读用户-编辑` | `TP-d2f74e1786f890a9708ed34b183626c9279e8a5b79a066a343f5c7417720c696` | `RCASE-8e15ead79afc56c96e2402ea7c7bbeabb827010bad44897cea6252bdc1a614b4` |
| `LOCAL-permission-只读用户-复制` | `FACT-permission-只读用户-复制` | `TP-127a36e638e4c421d7a27ce67f0a21a095b5a5f898bfb97cf5adb0c5e95ffc58` | `RCASE-590f90489d4df3b0959a9443430592d856dc7c02db5ee6de85a51d965f145c1c` |
| `LOCAL-reopen-复制` | `FACT-reopen-复制` | `TP-8486ec1b4361970296ca6e567aa59b8e3ce8384ed2cca958ab9a15413d13e46d` | `RCASE-9ea5540cd3ba5bde06db41740e9839b851354051dc966375e9b5933ddaf997e8` |
| `LOCAL-filter-管理员` | `FACT-filter-管理员` | `TP-2c419ddcaadc70b50df611c848a1194f7774c9663ccb27c849767a73e90db372` | `RCASE-2cc7f25f3242a9268c0045a1d31a84cbebff0b53d78f14a1a6f1f5672191cba5` |
| `LOCAL-filter-超级管理员` | `FACT-filter-超级管理员` | `TP-a0913931a6b4de16c75bb6ae07f26f5913c2446a7aaa921eccd9eabc5c3cd512` | `RCASE-09dc76bf4589e8869c48d4b43012f0d3ecd311ce6be1793556c4d3ed9088da68` |
| `LOCAL-filter-只读用户` | `FACT-filter-只读用户` | `TP-9e66170ae45db9051da6e63dc3355fb1c16f6560e081ee3a9d15e1e92446a05a` | `RCASE-592ca4a935b2efa3bdc7a1c4d05da69dc581cfc0901703f5643bf25ddcd503dc` |
| `LOCAL-filter-and` | `FACT-filter-and` | `TP-dd41ebbfb715ed8acfcc30dc46bfd116f3d75d789c1de34fcf43321d96784249` | `RCASE-b3aee89768b37568526db774a2e8b51af4175c783dc139db624bea774fbb3c55` |
