# 独立临时工作目录生成结果：实际独立复核

结论：本次两个全新运行的静态语义审阅通过。minimal 的 12 个来源目标和 comprehensive 的 70 个来源目标均已核实；未发现当前候选的未解决语义问题。已为这两个实际运行分别新写 completion body 和 attestation，尚未提交 completion 到生成入口，也未提交或发布任何产物。

审阅者仍为先读来源建立清单的独立上下文 `/root/source_first_review`。此次按照授权采用“完整规范等价核对＋当前来源／设计／用例复核”的方法，没有仅凭旧摘要签出，也未用旧 completion body 作为本次签出输入或复制旧 body。历史审阅报告只作为已验证语义依据及用例映射的索引，每一项都重新解析到本次请求及 staging 的实际对象。

工作目录由 [portable-workspace.json](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/docs/remediation-2026-10-28/portable-workspace.json) 取得，为 `/var/folders/2q/wn9f5xcs6m39xhj0dt60bwvc0000gn/T/gtc-portable-acceptance-lSfzHY`；`/var` 与实际 run_directory 的 `/private/var` 是本机同一路径解析。此次只读取本地文件，未使用账号或外部连接器。审阅范围是生成用例的来源覆盖与静态语义，不宣称在业务系统执行过这些用例。

## 本次实际检查与等价证据

| 层次 | minimal | comprehensive |
|---|---|---|
| 临时目录需求文件与工程原需求 | 逐字节相同 | 逐字节相同 |
| 当前 source-pack.content 与临时需求 | 完全相同 | 完全相同 |
| 当前与此前通过版本 source-pack | 仅 run_instance_id 不同 | 仅 run_instance_id 不同 |
| accepted evidence-claims 全对象 | 与旧版本完全相同 | 与旧版本完全相同 |
| accepted behavior-views 全对象 | 与旧版本完全相同 | 与旧版本完全相同 |
| review_target_projection 全对象 | 完全相同 | 完全相同 |
| 实际 case 内容按 primary_test_point_id 对齐 | 17 条全部相同 | 137 条全部相同 |
| case_context 差异 | 仅 run_id、basis.source_pack_digest、context_digest | 仅 run_id、basis.source_pack_digest、context_digest |

对照的真实已审阅运行分别为 `RUN-f4817349-e0a9-4ccb-9187-c24b091406c8` 和 `RUN-9511f58e-6cae-4877-bf74-47d1328ca0f1`，对应 [minimal 第 2 轮报告](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/minimal-review-round2.md) 与 [comprehensive 第 3 轮报告](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/comprehensive-review-round3.md)。旧运行已将用例移到 accepted/r000；本次比较按正式测试点 ID 对齐，排除落盘后 case_id 重命名和数组排列差异，其他字段全部逐项相同。步骤序列和 oracle 的 observe_after_step_id 没有被忽略或排序。

本次两个 review_target_digest 与上述旧版本相同是审阅投影内容完全相同的结果；run_id 不在该内容摘要内，所以仍必须由新 attestation 绑定实际运行。摘要另用编译器的 canonicalStringify／sha256CanonicalV4 重新计算确认，未以普通 JSON 键排序摘要代替编译器的集合规范化。

本次还验证了以下实际关系：

- 独立清单的每个原始 quote 均存在于本次源文，12／70 个 objective 及 target_kind 与本次 issued targets 一一一致，所有 Claim.value 都回到源文本。
- 按 fact_id／view_id 对齐核对 accepted 对象与请求投影；没有遗漏、替换字段或新增默认业务规则。
- 每条 staging 用例的标题、前置条件、数据、步骤及 oracle 均与当前投影逐字段一致；用例的事实回到当前 view element，formal_test_point 回到当前 outcome。
- 全部 17／137 条用例的 preconditions、data、actions 分别与行为视图相同，每条 expected 存在于对应 outcome/view，所有 oracle 的观察步骤和 Claim 引用有效。
- 最小样本 17 条实际用例重新阅读全文，包括只读条件保存拒绝、1／10／11 长度、A-B 和 é、真实处理中去重、失败后同表单重试、取消重开以及两角色只读详情。
- 综合样本在完整等价核对之外，重新阅读关键具体用例：只读新增条件保存；超级管理员编辑并真实保存；T0<E 到 T1=E 的发布、启用确认与启用重试；复制发布失败后跨界重试；待开始下线失败并同对象重试；A 取消后从 B 复制重开；五状态数据中的已过期精确筛选；AND 全部真假组合；同一新建记录发布→下线→启用的逐步骤身份与字段连续性。

这些核对确认旧轮已修复的语义内容在新运行实际存在，不靠“数量未变”或“生成点全覆盖”证明来源覆盖。完整的逐目标依据及新运行引用见后表。

## 新 completion 与签出边界

封套文件：[portable-review-attestations.json](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/portable-review-attestations.json)，顶层为 `attestations` 数组。`completion_file` 是相对于该封套所在目录的文件名；每项另含本次 run_id、review_target_digest 和 completion_bytes_sha256。

两个新 completion body 顶层均仅有 target_assessments、findings。assessments 从当前 review_request 的 IRT／Claim／decision 及当前 FACT／VIEW／TP／RCASE 重新构造，每条 rationale 明确本次新 run_id 和复核依据。当前 findings 为空，表示本次新候选没有新发现；旧运行的历史修复记录仍保留在其原审阅报告，本次未虚构在新运行中发现或修复过这些问题。

两份新 body 已分别通过 constructIndependentReviewCompletionV4 及 validateIndependentReviewV4 的实际验证，diagnostics 都为空；封套的运行绑定、相对文件名及 SHA-256 字节哈希也已核实。验证只在内存中构造 completion，没有写回或提交运行。

实际读取时两份回复均为 need_revision / INDEPENDENT_REVIEW_REQUIRED，produced_artifacts 为空，staging independent_review.status 为 pending。此次只写工程内审阅证据，不改变临时运行或接受状态。后续由主任务使用公开入口提交本次 completion 并验证正式交付。

## minimal 当前运行

- run_id：`RUN-a0cc0f92-93e4-40ca-a973-0d9a79733af5`。
- 实际目录：[/private/var/folders/2q/wn9f5xcs6m39xhj0dt60bwvc0000gn/T/gtc-portable-acceptance-lSfzHY/acceptance/runs/RUN-a0cc0f92-93e4-40ca-a973-0d9a79733af5](/private/var/folders/2q/wn9f5xcs6m39xhj0dt60bwvc0000gn/T/gtc-portable-acceptance-lSfzHY/acceptance/runs/RUN-a0cc0f92-93e4-40ca-a973-0d9a79733af5)。
- 请求摘要（按编译器 canonicalStringify 重新计算并一致）：`sha256:c604a4273d48ff873ddd552b4fb220c158708f5ec6ab0a6fce54533e61b294fe`。
- 来源文件 SHA-256：`76c729a47c0217ba1459decf0742786e23a22f0def94bb7c2ac6e5ce7a62046a`。
- completion：[portable-minimal-review-completion.json](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/portable-minimal-review-completion.json)，字节 SHA-256：`2bf0ebad4830659e1cc7ff1b0271a5d2cfa93325ae4c2c8dae7692990e0590ff`。
- 12 个来源目标、17 条实际用例。逐目标映射涉及 17 条当前用例；各条实际用例均另经完整投影／上游设计一致性核对。

| 本次目标 | 本次语义依据 | 当前 staging 用例 | 当前 IRT |
|---|---|---|---|
| M01 | 两类角色分别打开列表、找到已知记录，再查看详情；未引入其他角色。 | `LOCAL-view-管理员`, `LOCAL-view-只读用户` | `IRT-2b79cec1c9f889244e7f20a5e61c54a391acfb8d6462ebdbbe771b47c3861f8b` |
| M02 | 管理员可新增并保存；只读入口不可用则记录拒绝，可打开则填Alpha点击保存，最终核对标识集合和数量不变。 | `LOCAL-readonly-create`, `LOCAL-create-initial`, `LOCAL-name-one` | `IRT-225c5b8a06df7482904f090eef2c3f33d9af40ef69fceabe9cd682a478662cb1` |
| M03 | 打开新增后明确只有名称一个字段且为空。 | `LOCAL-create-initial` | `IRT-eaf4305e1fd305e3983e0032b801cfb1eaf42038060e0fcb91a600fc5e226fa8` |
| M04 | 空名称点击保存不提交，精确提示名称不能为空，无新记录。 | `LOCAL-name-empty` | `IRT-1b9ba031f144c11c1b016b097ed36c1fbd5a9f85c9abe3d19e2a6875b3896eb3` |
| M05 | A和ABCDEFGHIJ分别覆盖1与10有效长度，AbCd明确证明ASCII大小写字母合法。 | `LOCAL-name-one`, `LOCAL-name-ten`, `LOCAL-name-mixedcase` | `IRT-5de2c770e1fd8d235dcd2985f535fed481292cb1c878fe20e1738c2779eb58b2` |
| M06 | 纯字母ABCDEFGHIJK的长度11不提交并精确提示名称最多10个字母，没有其他输入错误干扰。 | `LOCAL-name-eleven` | `IRT-635616f658250dc7a590465e53676792f592ad4d91076e6b0b9403ea657d7e0e` |
| M07 | Ab1、中、A B、A-B、é分别覆盖数字、中文、空格、符号、非ASCII拉丁字母，均不提交且不虚构精确提示。 | `LOCAL-name-digit`, `LOCAL-name-chinese`, `LOCAL-name-space`, `LOCAL-name-symbol`, `LOCAL-name-non-ascii` | `IRT-0efafe3d9adbc05080fee47e1213adfe3a9df18a6dcf949eaa98a47d4607db77` |
| M08 | 合法输入结果均核对恰好一条、名称等于输入、状态草稿、弹窗关闭。 | `LOCAL-name-one`, `LOCAL-name-ten`, `LOCAL-name-mixedcase` | `IRT-fe08b48d7181b91c44cbaf2d318ad4b1174431c2d44df6ef2f19ad8341c6e222` |
| M09 | 保持第一次请求处理中，在完成前重复点两次，释放请求后最终只有一条Alpha草稿。 | `LOCAL-duplicate` | `IRT-9d537fe1219cda1d972f791ce744d6f8dc660fa0bc6ffd8f9b5a089daab695ab` |
| M10 | 首次真实请求失败后的STEP-0核对弹窗和Alpha保留且可重试；STEP-1不改输入重试后仅一条草稿并关闭。 | `LOCAL-failure` | `IRT-7bfa0ddf0d2e2191f6f68d11bffb355b3797e8773fbf136b0f9f98435c3bd9bf` |
| M11 | 取消步骤检查关闭且无新增，重开步骤检查名称为空而不恢复Temp。 | `LOCAL-cancel` | `IRT-677e4f1c843ec6ce8f3595dd2e6617b3dbe07a95ca75b8e7a29ba3394fc9a3aa` |
| M12 | 两类角色均显示已知记录Alpha与草稿状态，尝试修改后仍只读。 | `LOCAL-view-管理员`, `LOCAL-view-只读用户` | `IRT-1bf8ee1661ea39529e028e306da9feaf6be9474ab2a6044ff1ae403b5dcbeb9a` |

## comprehensive 当前运行

- run_id：`RUN-dd8ccfed-82e0-4047-afbe-e298e3a07b82`。
- 实际目录：[/private/var/folders/2q/wn9f5xcs6m39xhj0dt60bwvc0000gn/T/gtc-portable-acceptance-lSfzHY/acceptance/runs/RUN-dd8ccfed-82e0-4047-afbe-e298e3a07b82](/private/var/folders/2q/wn9f5xcs6m39xhj0dt60bwvc0000gn/T/gtc-portable-acceptance-lSfzHY/acceptance/runs/RUN-dd8ccfed-82e0-4047-afbe-e298e3a07b82)。
- 请求摘要（按编译器 canonicalStringify 重新计算并一致）：`sha256:6d07530261a38d540010819ca304eb9ca7302b71ce6eb50659dfb08212d28293`。
- 来源文件 SHA-256：`e8cac77947f2d04864fa758394060cac706e6418d07105dae5f71ac7ce277633`。
- completion：[portable-comprehensive-review-completion.json](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/portable-comprehensive-review-completion.json)，字节 SHA-256：`9af593496b3ea0fc800bff2386127d0220512e9b2b01bcc1e107a340ccf3f576`。
- 70 个来源目标、137 条实际用例。逐目标映射涉及 137 条当前用例；各条实际用例均另经完整投影／上游设计一致性核对。

| 本次目标 | 本次语义依据 | 当前 staging 用例 | 当前 IRT |
|---|---|---|---|
| C01 | 管理员和超级管理员分别有新增、编辑、复制的真实保存，以及下线、启用的确认成功结果。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用` | `IRT-27c40e5bcaaafd4f156ebf53cef95d5630520d9617fc71c498b9722c5b133d99` |
| C02 | 只读用户能查看和筛选；三个表单动作在入口可用时继续填合法数据保存，并要求拒绝和集合无变化，行操作也禁止成功。 | `LOCAL-view-只读用户`, `LOCAL-filter-只读用户`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用` | `IRT-42bd7644c249578e088270aa4255856289aede5bc5cebf2ccf6b2d99a15df4e9` |
| C03 | 五状态行操作与编辑/复制矩阵、管理角色成功路径、只读条件保存拒绝共同验证角色与状态的交集。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用`, `LOCAL-state-草稿-下线`, `LOCAL-state-草稿-启用`, `LOCAL-state-草稿-编辑`, `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-下线`, `LOCAL-state-待开始-启用`, `LOCAL-state-待开始-编辑`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-下线`, `LOCAL-state-生效中-启用`, `LOCAL-state-生效中-编辑`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-下线`, `LOCAL-state-已过期-启用`, `LOCAL-state-已过期-编辑`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-下线`, `LOCAL-state-已下线-启用`, `LOCAL-state-已下线-编辑`, `LOCAL-state-已下线-复制` | `IRT-17701569136a8e99bc565f48fc8424ed7ce602f4c5f294f151ab280cbe897a89` |
| C04 | 权限预期仅限定不能成功写入，允许入口不可用或提交拒绝，不固定隐藏/禁用形式或拒绝文字。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用` | `IRT-1ff05e15d186f8e57b73b291635bb9be14276d1e6c9d686f47685905e144b4a1` |
| C05 | 名称、开始时间、结束时间分别留空且其余合法，均要求不提交且无新增。 | `LOCAL-required-名称`, `LOCAL-required-开始时间`, `LOCAL-required-结束时间` | `IRT-fd4181c2553d8e72076dbc95ede48bbd9d6174a8cc7273251857d14095cf315e` |
| C06 | 长度0/1/10/11及数字、中文、空格混入均有对应输入；Alpha等混合大小写ASCII字母能成功保存。 | `LOCAL-name-A`, `LOCAL-name-ABCDEFGHIJ`, `LOCAL-required-名称`, `LOCAL-name-ABCDEFGHIJK`, `LOCAL-name-Ab1`, `LOCAL-name-中`, `LOCAL-name-A B`, `LOCAL-permission-管理员-新增` | `IRT-f62a01c052c3c366dd60569d3d8d65bb4c41c1a6eafd4e6542d9ea11587b7ae3` |
| C07 | 两类管理角色打开新增时在STEP-0检查三个字段全部为空。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-超级管理员-新增` | `IRT-2d4e1094cce6aa737e34d1f7f2f5e9cbc4e027cbbf81446936085512ec9f177f` |
| C08 | 管理员与超级管理员对五种来源状态均打开复制弹窗，要求三个可编辑值完整回填；待开始数据已修正。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` | `IRT-93dcb66e00860752801f3dec1d7d052913f681bfce0577b9cabdc11daa2d404a` |
| C09 | 编辑入口只有草稿可用；管理角色打开后全部字段清空，四种非草稿禁止编辑，只读用户即使能进表单也不能保存。 | `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-state-草稿-编辑`, `LOCAL-state-待开始-编辑`, `LOCAL-state-生效中-编辑`, `LOCAL-state-已过期-编辑`, `LOCAL-state-已下线-编辑`, `LOCAL-permission-只读用户-编辑` | `IRT-810aed941e45d4663218912f9005afea3349507e90bb0b85dec826ef6c568906` |
| C10 | 关键边界均给出UTC秒级数据；跨提交/确认/重试明确T0与T1，完整生命周期分别列明三个实际提交时刻。 | `LOCAL-publish-end-早于`, `LOCAL-publish-end-等于`, `LOCAL-publish-end-晚于`, `LOCAL-publish-start-早于`, `LOCAL-publish-start-等于`, `LOCAL-publish-start-晚于`, `LOCAL-publish-cross-submit`, `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry`, `LOCAL-same-object-lifecycle` | `IRT-0a3a02c0f1a070aab57e5060efe82e2aa5dff5e79946b3bab80b24405f730a6b` |
| C11 | S>E报错且不提交，S=E且E>T允许发布，S<E的有效输入可保存。 | `LOCAL-order-大于`, `LOCAL-order-等于`, `LOCAL-publish-start-早于` | `IRT-12772a4a4db7843e247c49af4330ce9ccadde6039bf8c90ac78f20d1a7342cf4` |
| C12 | 普通非法输入仅要求不提交；精确报错仅用于来源明确规定的时间条件与筛选范围等提示。 | `LOCAL-required-名称`, `LOCAL-name-Ab1`, `LOCAL-name-中`, `LOCAL-order-大于`, `LOCAL-filter-invalid-起点晚于终点` | `IRT-5a869be2792abf8045f405543e7ea5730eee9a12fbcb1e6210caa4dab9aca347` |
| C13 | E<T、E=T、E>T分别保存草稿成功并保持草稿，不套用发布限制。 | `LOCAL-draft-end-早于`, `LOCAL-draft-end-等于`, `LOCAL-draft-end-晚于` | `IRT-5740ff7bc7acf4441e701c53bcdf63a8004e29a1dbc8f77e3b9f50abaf91f172` |
| C14 | E=T-1秒发布不提交并提示结束时间必须晚于当前时间。 | `LOCAL-publish-end-早于` | `IRT-81f2b60c71a40c6d072b1a4b4e24fa13a3dcd57f82bf58fd6d58c47f7731b487` |
| C15 | E=T发布不提交并精确提示结束时间必须晚于当前时间。 | `LOCAL-publish-end-等于` | `IRT-364a9daedfb30de7db5f7116bc3e382c99cdabe8b8aa4a859a4d57290381fc87` |
| C16 | E>T且S=T+1秒，发布结果待开始。 | `LOCAL-publish-start-晚于` | `IRT-41b1d989e5271ecc3056096d74469100a416b9574aed1496cfc1d8e0e3d9c392` |
| C17 | E>T且S=T，发布结果生效中。 | `LOCAL-publish-start-等于` | `IRT-d5228d2bb6455e24368066189a1c9dfc9a826e1fef25450a48ceffed508c6e36` |
| C18 | E>T且S=T-1秒，发布结果生效中。 | `LOCAL-publish-start-早于` | `IRT-4a23778fc92989848d41c059daafae20fc8c9357f108ff9e2375e46fa55610fb` |
| C19 | S=E>T发布为待开始，另在T=S=E读取为已过期，未产生生效中区间。 | `LOCAL-order-等于`, `LOCAL-equal-expire` | `IRT-851a5c06149a69df7025257441194a2f0c689b75344d45a16e504e4b9f73b767` |
| C20 | T0打开时E>T0，到T1=E才提交发布，明确拒绝保存且无新增，能区分旧时钟判断。 | `LOCAL-publish-cross-submit` | `IRT-e0cc6e5de953bbf4bbaee85f325cec6360a67fd7bacc639101c6015a11f45a12` |
| C21 | 各入口保存成功关闭；新对象与更新对象区分身份，并逐项核对名称和两个时间等于输入。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中` | `IRT-ebbeea9684184077e150acba7cd7c4a96c3cb42a64e73bdfc7c561cf43c432c2` |
| C22 | 已发布未下线对象在S前一秒读取为待开始。 | `LOCAL-state-开始前` | `IRT-6c0439b2ad2afe02427e9f93f0c8cb0f46bdc0501145176d18615bb76ac80bf2` |
| C23 | 已发布未下线对象在T=S且T<E读取为生效中。 | `LOCAL-state-开始相等` | `IRT-4bc49cf43cbccc795a00e81271bd9e9cf87dd1e0c1b03ad467de41f396237c05` |
| C24 | 开始后一秒和结束前一秒均读取为生效中。 | `LOCAL-state-开始后`, `LOCAL-state-结束前` | `IRT-c0e3ff9dbb512e761e7ca03fccac64c268bc0775b664dadd135525d53662c855` |
| C25 | 当前时刻恰等于结束时间时读取为已过期。 | `LOCAL-state-结束相等` | `IRT-9b2c3e5f741e3d82673291f1b7a7c5ef1007daffc544ede3cd0a20558a8a1976` |
| C26 | 当前时刻超过结束一秒时读取为已过期。 | `LOCAL-state-结束后` | `IRT-4c897bce60125fbe35ae23c123ac9db3df86de79862d63419d10e2accbdb02c6` |
| C27 | 开始、结束、当前时刻相等的记录明确为已过期。 | `LOCAL-equal-expire` | `IRT-5ab52397d8f516181d98d2b9f96bd16581beb72eb2fa7c3da977d831f8dc6e60` |
| C28 | 同一草稿跨开始和结束时刻读取始终为草稿。 | `LOCAL-no-auto-草稿` | `IRT-b01660dad8289c5d01ff64244f9233ce1edea9e5900c582fd4e5874c70a954ae` |
| C29 | 同一已下线记录跨开始和结束时刻读取始终为已下线。 | `LOCAL-no-auto-已下线` | `IRT-9b19c6d2bb9fae41435caad6a28808e94768d0474de8eed64f5d5c73cbb0f168` |
| C30 | 状态按给定当前时刻重新读取，明确不验收自动刷新频率。 | `LOCAL-state-开始前`, `LOCAL-state-开始相等`, `LOCAL-state-结束相等` | `IRT-7f1ac85c635ef3b0740f9fadf31617314415edd2f9f77e7f09c87505bffafec0` |
| C31 | 待开始和生效中均有下线确认成功及取消路径，取消保持原记录。 | `LOCAL-state-待开始-下线`, `LOCAL-state-生效中-下线`, `LOCAL-cancel-下线`, `LOCAL-cancel-下线-待开始` | `IRT-6c9ee68448ad3353ceab6236c90493c447c04b5f7f8124dac6d4ee53141525e5` |
| C32 | 草稿、已过期、已下线以及只读用户均不能成功下线。 | `LOCAL-state-草稿-下线`, `LOCAL-state-已过期-下线`, `LOCAL-state-已下线-下线`, `LOCAL-permission-只读用户-下线` | `IRT-e7258d5531da9d530e37d9856257d737d906edc95e5b84f7b097ff7945991575` |
| C33 | 已下线E<T和E=T分别提示无法启用；非已下线状态有逐状态拒绝证据。 | `LOCAL-enable-expired-早于`, `LOCAL-enable-expired-等于`, `LOCAL-state-草稿-启用`, `LOCAL-state-待开始-启用`, `LOCAL-state-生效中-启用`, `LOCAL-state-已过期-启用` | `IRT-23d72e5e6f1f7fbe0a230e3f9eefdeae74bd80f35b0ec2e5de9f3b699216ee82` |
| C34 | E>T的已下线对象须二次确认；取消保持原状态和字段，确认成功才改变。 | `LOCAL-cancel-启用`, `LOCAL-state-已下线-启用` | `IRT-6c31b7dd17567c6137984e192da45446fa631e1cfedd7e806641d9ca40848db9` |
| C35 | S>T、S=T、S<T且E>T的启用分别为待开始、生效中、生效中。 | `LOCAL-enable-start-未来`, `LOCAL-enable-start-相等`, `LOCAL-state-已下线-启用` | `IRT-e26afe9d913ab60da371a64e537ec7ae34440a71925a9d54d0c7624075115dd5` |
| C36 | 草稿、待开始、生效中、已过期分别禁止启用，不以未来结束时间突破状态约束。 | `LOCAL-state-草稿-启用`, `LOCAL-state-待开始-启用`, `LOCAL-state-生效中-启用`, `LOCAL-state-已过期-启用` | `IRT-fc22830dd9bb3e882d735646916e36764a78e575991385313b69fc7e4efb32ee` |
| C37 | 待开始、生效中的下线失败各在失败步骤检查提示及原身份/字段/状态，再核对同一对象重试成功。 | `LOCAL-failure-下线`, `LOCAL-failure-下线-待开始` | `IRT-985169c75ed1d2a2ab01cdf32a24dcd7d3a0db5938b8d0e42a6b91b6a454b7f8` |
| C38 | 启用失败时在重试前检查已下线、身份和字段不变及操作失败提示，后续重试成功。 | `LOCAL-failure-启用` | `IRT-6ffdd49edd4e7d471b8a13b9be7cf509b01f8fb6335e0abc2785f52113ccbb55` |
| C39 | 下线和启用均在请求未完成时重复操作同一记录，要求不接受重复操作且仅一次状态效果。 | `LOCAL-duplicate-下线`, `LOCAL-duplicate-启用` | `IRT-a9610f26ae2acac9160808ae5dabd9bf54e5a09606a60eff7aac503a93782c18` |
| C40 | 启用确认等待和启用失败重试分别从T0<E跨到T1=E，均拒绝启用且保持已下线。 | `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry` | `IRT-19f6937fa9ca3e759dd7fa0e56ba9b7b0396271050c8098f2a1a6f1541df032b` |
| C41 | 取消保留原记录；失败与重试前后明确核对同一身份、全部字段及原状态，未替换或另建目标。 | `LOCAL-cancel-下线`, `LOCAL-cancel-下线-待开始`, `LOCAL-cancel-启用`, `LOCAL-failure-下线`, `LOCAL-failure-下线-待开始`, `LOCAL-failure-启用` | `IRT-a27fd60f0859c70e66f331e02fd6f14f31df6ee31ed0f13e32462ef312bf6796` |
| C42 | 三种角色分别查看五种状态记录，显示名称、开始、结束及状态且全部只读。 | `LOCAL-view-管理员`, `LOCAL-view-超级管理员`, `LOCAL-view-只读用户` | `IRT-305f2c032096189c74805464e0e0e16d6d1900b41216c6dda60aa72b75242abf` |
| C43 | 两类管理角色五状态复制都有证据，超级管理员还逐状态保存；只读复制的条件保存明确拒绝。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线`, `LOCAL-permission-只读用户-复制` | `IRT-7c3a85490f8bcd994963980d4355da4f69b0dc84d01d006c6aa979286ab1963b` |
| C44 | 打开复制时尚未新增；失败及取消均核对零新增，只有成功保存才创建新身份记录。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-reopen-复制`, `LOCAL-save-failure-复制`, `LOCAL-reopen-copy-different-source` | `IRT-f6bf4b3738231617bb3db492a751d41604c8f79ce6d785ebce11a32182d324b8` |
| C45 | 复制成功的新记录具有独立身份和正确输入值，源记录身份/字段/状态不变；新状态依本次保存而不继承源状态。 | `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` | `IRT-e632b8d7f0b8ae44bcacae5a417a6708f7e111465baa2b5b55ed21e6e6b1ced2` |
| C46 | 已过期源对象保持全部回填值：保存草稿创建新草稿，保存并生效拒绝且源对象不变。 | `LOCAL-expired-copy-保存草稿`, `LOCAL-expired-copy-保存并生效` | `IRT-395a2ccbb4bd921b69bcabdb743bd4660d7525c93adaf5eee5e0a26ec5d75e48` |
| C47 | 编辑打开清空，保存成功保持原稳定身份并更新字段，没有新增记录或沿用旧输入。 | `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` | `IRT-8c524e112af8fde7cad858e9e18cdb476eb9071b7dcd8e7be84d318c8901c333` |
| C48 | 编辑保存草稿仍为草稿，发布根据开始时间成为待开始或生效中，结束已到期的重试被拒绝。 | `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中`, `LOCAL-publish-retry-编辑` | `IRT-f05776500444878d9daf7419648551faa5c72ab23bab861e0403747556ca1c5f` |
| C49 | 新增/复制要求新身份，编辑要求原身份更新，复制同时核对源记录不变，三类对象语义可区分。 | `LOCAL-permission-管理员-新增`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`, `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` | `IRT-e158c63abf07f34d4cd0dd57aca74ee793e4f8c89bd4de3fa9cfa8e464a4acbb` |
| C50 | 编辑预先记录稳定身份和字段，保存后对同一原对象核对更新并确认无新增。 | `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` | `IRT-2991d61640df4ca48e1ddbd54c5003c656a60fc03dd55f26577010ef5071b9da` |
| C51 | 新增/复制/编辑失败均在重试前保留弹窗及三个输入，随后不改输入重试成功。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑` | `IRT-38f1f39d2df45beaf61787adc48965cd0a569105ab2546f247123047a8b3a1d5` |
| C52 | 三入口在保存请求未完成时重复点击，新增和复制仅一条新记录，编辑仅一次原对象保存效果。 | `LOCAL-save-duplicate-新增`, `LOCAL-save-duplicate-复制`, `LOCAL-save-duplicate-编辑` | `IRT-da548ab7eee29e1a3bc502c4665c6aaa2285f413e1c919922351eed106e859b2` |
| C53 | 请求失败保留弹窗，重试成功关闭；校验未通过不提交，未把校验失败当作请求失败。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-编辑`, `LOCAL-required-名称`, `LOCAL-publish-end-等于` | `IRT-955ad285c08103c809aea2da25dc51dbaa34804faf3b2460694ab85796cb1bc0` |
| C54 | 取消关闭在取消步骤检查，重开后新增/编辑为空、复制为源值，预期绑定到对应步骤。 | `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` | `IRT-3211adc951aea63ca2acfb7d3943e4039d7aed9b6e50af562c9af17dbbd9ee06` |
| C55 | 三入口不恢复Temp；新增的A取消后从B复制场景要求回填Delta及B的日期，拒绝A和未保存缓存。 | `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑`, `LOCAL-reopen-copy-different-source` | `IRT-7b02d9215bdbe879471ca746ffe8c9ea0c6c0e91b0f7b326fc1fdb491ce17955` |
| C56 | 保存失败留在当前弹窗保留输入，与取消后再次打开重新初始化分别有明确步骤和预期。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑`, `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` | `IRT-4725e0228fe14481edf78c35404dcb0299f422ec6a63bb2122e854b6ee2c7920` |
| C57 | 三入口发布请求首次失败时E>T0，保持输入到T1=E重试均不提交，重新执行结束时间检查。 | `LOCAL-publish-retry-新增`, `LOCAL-publish-retry-复制`, `LOCAL-publish-retry-编辑` | `IRT-ef300108d541bf42ce23d57f96013bac8a1fac33a985e66a53fc0f8031a5b50d` |
| C58 | 名称数据包含完全、首部、中部、尾部匹配，以及大小写不同和不连续反例；三角色筛选权限有证据。 | `LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`, `LOCAL-filter-管理员`, `LOCAL-filter-超级管理员`, `LOCAL-filter-只读用户` | `IRT-e1177eee67825ab25f0a838ee0c6045e1c8f94928667027687a080266c581849` |
| C59 | 以固定UTC当前时刻构造五种正确状态，逐个筛选只命中相应唯一标识，明确相近状态互不混入。 | `LOCAL-filter-管理员`, `LOCAL-filter-超级管理员`, `LOCAL-filter-只读用户`, `LOCAL-filter-and`, `LOCAL-filter-state-草稿`, `LOCAL-filter-state-待开始`, `LOCAL-filter-state-生效中`, `LOCAL-filter-state-已过期`, `LOCAL-filter-state-已下线` | `IRT-cd2deec03de99d331f03ca58dcb9ceedfa1971b6646fe7c016b1216c03d4e87e` |
| C60 | 闭区间涵盖两种包含、双侧部分交叉、相等、双侧接触、双侧间隔和零宽记录，结果符合区间相交。 | `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-inside`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval`, `LOCAL-filter-time-right-disjoint`, `LOCAL-filter-time-equal`, `LOCAL-filter-time-zero-record` | `IRT-c870a15dc1edcf09b9ddee192233376ce99e6b90bfbdaedaf8671f37bfdb41e0` |
| C61 | 记录包含筛选、筛选包含记录、左/右部分交叉和完整相等均明确命中。 | `LOCAL-filter-time-inside`, `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval` | `IRT-0cad227766408d0ef2ad12a8f24dff793561b328b2350446bdd1f5ad173b8dba` |
| C62 | 两个端点接触均命中，左右相隔一秒均不命中。 | `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-right-disjoint` | `IRT-be6c31c8d91bb589743c530cb47e653cbec546218550609215330d6181d49462` |
| C63 | 零宽筛选与覆盖该点的普通记录、同点零宽记录分别命中。 | `LOCAL-filter-time-equal`, `LOCAL-filter-time-zero-record` | `IRT-5dcd811af8903d5c17e3d35fbdf27d276e5d80538a28083032958e29ef7425d2` |
| C64 | 起止均空不限制；缺起点、缺终点和反向范围分别不搜索并提示时间范围不合法。 | `LOCAL-filter-empty`, `LOCAL-filter-invalid-缺结束`, `LOCAL-filter-invalid-缺开始`, `LOCAL-filter-invalid-起点晚于终点` | `IRT-7b2892f4b4640d435d6da7aefb3f2b79e2f51676094687ee7cb03e3866fe9bef` |
| C65 | 全部为空以及只填一种筛选时，其他空条件不施加限制。 | `LOCAL-filter-empty`, `LOCAL-filter-name-Ab`, `LOCAL-filter-管理员`, `LOCAL-filter-time-inside` | `IRT-519eeffa2b53dbbe461f990a43b0eac72dcf3a94ba56bdbce142142554563336` |
| C66 | A三项全满足，B/C/D仅满足两项，E/F/G分别只满足单项，H全不满足；预期仅A命中，涵盖全部真假组合。 | `LOCAL-filter-and` | `IRT-873f3bfbe5dd9a4609ad2d8c1fd41283486b2e3aed565b13eef6328e341f4560` |
| C67 | 首次搜索loading在首次步骤检查，完成前再触发明确不产生第二请求。 | `LOCAL-search-loading` | `IRT-89b226efc3af7db19b016566bc7556cf76deca1995985075a4a8bfd2eb275b1b` |
| C68 | 释放首次请求完成后再发起合法搜索，明确允许新请求并展示结果，未永久锁定。 | `LOCAL-search-loading` | `IRT-d63adf01d78696007c9f2de60fad804961f373658bbe62c23735e080553ffe67` |
| C69 | 重置后所有筛选字段为空，明确不验收是否自动搜索。 | `LOCAL-reset` | `IRT-06e70c7ee6dabb7215c87aa4f43df8c169bbceaabb843128799a4b41189d46ef` |
| C70 | 名称、五状态、区间和组合筛选均给出目标标识及命中集合，组合数据已补为具体名称、状态和UTC区间。 | `LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`, `LOCAL-filter-and`, `LOCAL-filter-empty`, `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-outside`, `LOCAL-filter-state-草稿`, `LOCAL-filter-state-待开始`, `LOCAL-filter-state-生效中`, `LOCAL-filter-state-已过期`, `LOCAL-filter-state-已下线` | `IRT-8bc90f19752d58a2d8348c3f269ed63a55e8b50b57906ed4592bc67a160889c9` |
