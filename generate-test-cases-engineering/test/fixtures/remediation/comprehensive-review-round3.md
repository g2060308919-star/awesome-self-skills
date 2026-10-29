# 综合样本独立语义审阅：第 3 轮

结论：**本次综合样本静态语义审阅通过。70 个先前独立目标均已核实；15 个历史问题已在当前运行修复并复核，没有未解决发现。**

- 审阅者：独立上下文 `/root/source_first_review`，先读来源形成检查清单与目标，之后才阅读生成产物，未参与产物修改。
- 当前运行：`RUN-9511f58e-6cae-4877-bf74-47d1328ca0f1`，source revision `0`。
- 当前 review target digest：`sha256:6d07530261a38d540010819ca304eb9ca7302b71ce6eb50659dfb08212d28293`。
- 137 条事实／view element／正式测试点／用例逐条对应，source 与原始综合样本相同，Claim 均可回到原文，所有条件／动作／预期与投影一致。
- 相比第二轮，126 条用例内容未变且经过逐字段差分复核；5 条修改和6条新增已重新阅读全文，重点核对角色拒绝、取消零新增、异源初始化、状态精确筛选和AND真假组合。
- 审阅范围为生成测试工件的静态语义与来源追踪；未声称已在业务系统执行这些用例。

## 本轮确认的修复

| 历史问题 | 当前复核证据 |
| --- | --- |
| R01 | 现为T=12:00、S=12:30、E=13:00，并在动作前确认状态。 对应 `LOCAL-state-待开始-下线`, `LOCAL-state-待开始-启用`, `LOCAL-state-待开始-编辑`, `LOCAL-state-待开始-复制` |
| R02 | 新增两条待开始场景，失败和成功重试分别在正确步骤检查同一记录。 对应 `LOCAL-cancel-下线-待开始`, `LOCAL-failure-下线-待开始` |
| R03 | 失败、取消重开和同一记录生命周期现均有按实际观察步骤拆分的oracle。 对应 `LOCAL-failure-下线`, `LOCAL-failure-启用`, `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑`, `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑`, `LOCAL-same-object-lifecycle` |
| R04 | 现有明确T0<E、T1=E的拒绝场景，覆盖发布、启用确认、启用重试和三个保存入口。 对应 `LOCAL-publish-cross-submit`, `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry`, `LOCAL-publish-retry-新增`, `LOCAL-publish-retry-复制`, `LOCAL-publish-retry-编辑` |
| R05 | 现执行合法保存并核对身份和值，五状态复制均保存草稿。 对应 `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` |
| R06 | 现保留全部过期回填值，一条保存草稿成功，另一条发布拒绝。 对应 `LOCAL-expired-copy-保存草稿`, `LOCAL-expired-copy-保存并生效` |
| R07 | 遗漏的区间关系已各有明确命中或排除数据。 对应 `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval`, `LOCAL-filter-time-right-disjoint`, `LOCAL-filter-time-zero-record` |
| R08 | 当前数据E=Ab、F=XAb均要求命中。 对应 `LOCAL-filter-name-Ab` |
| R09 | 现STEP-2完成首次请求，STEP-3检查新的搜索请求与结果。 对应 `LOCAL-search-loading` |
| R10 | 现逐项核对Gamma和两个本次输入时间，同时检查源记录不变。 对应 `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中` |
| R11 | 新增、编辑、复制的事实及oracle现分别有CLM-6、CLM-32、CLM-31。 对应 `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制` |
| N01 | 现先记录集合和原值；入口可用时填Denied并尝试保存，两种拒绝分支均核对零新增和原对象不变。 对应 `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制` |
| N02 | 取消现核对标识集合与数量不变；A取消后从B重开须回填Delta及B的三个值。 对应 `LOCAL-reopen-复制`, `LOCAL-reopen-copy-different-source` |
| N03 | 现五状态由同一UTC当前时刻与合法区间确定，分别筛选且只允许对应唯一标识命中。 对应 `LOCAL-filter-state-草稿`, `LOCAL-filter-state-待开始`, `LOCAL-filter-state-生效中`, `LOCAL-filter-state-已过期`, `LOCAL-filter-state-已下线` |
| N04 | 现补E/F/G单项及H全不满足，A-H组成完整真假组合，只有A命中。 对应 `LOCAL-filter-and` |

## 全部独立目标的真实映射

| 目标 | 复核依据 | 当前用例 | IRT |
| --- | --- | --- | --- |
| C01：已核实 | 管理员和超级管理员分别有新增、编辑、复制的真实保存，以及下线、启用的确认成功结果。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用` | `IRT-27c40e5bcaaafd4f156ebf53cef95d5630520d9617fc71c498b9722c5b133d99` |
| C02：已核实 | 只读用户能查看和筛选；三个表单动作在入口可用时继续填合法数据保存，并要求拒绝和集合无变化，行操作也禁止成功。 | `LOCAL-view-只读用户`, `LOCAL-filter-只读用户`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用` | `IRT-42bd7644c249578e088270aa4255856289aede5bc5cebf2ccf6b2d99a15df4e9` |
| C03：已核实 | 五状态行操作与编辑/复制矩阵、管理角色成功路径、只读条件保存拒绝共同验证角色与状态的交集。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用`, `LOCAL-state-草稿-下线`, `LOCAL-state-草稿-启用`, `LOCAL-state-草稿-编辑`, `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-下线`, `LOCAL-state-待开始-启用`, `LOCAL-state-待开始-编辑`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-下线`, `LOCAL-state-生效中-启用`, `LOCAL-state-生效中-编辑`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-下线`, `LOCAL-state-已过期-启用`, `LOCAL-state-已过期-编辑`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-下线`, `LOCAL-state-已下线-启用`, `LOCAL-state-已下线-编辑`, `LOCAL-state-已下线-复制` | `IRT-17701569136a8e99bc565f48fc8424ed7ce602f4c5f294f151ab280cbe897a89` |
| C04：已核实 | 权限预期仅限定不能成功写入，允许入口不可用或提交拒绝，不固定隐藏/禁用形式或拒绝文字。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-管理员-下线`, `LOCAL-permission-管理员-启用`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-permission-超级管理员-下线`, `LOCAL-permission-超级管理员-启用`, `LOCAL-permission-只读用户-新增`, `LOCAL-permission-只读用户-编辑`, `LOCAL-permission-只读用户-复制`, `LOCAL-permission-只读用户-下线`, `LOCAL-permission-只读用户-启用` | `IRT-1ff05e15d186f8e57b73b291635bb9be14276d1e6c9d686f47685905e144b4a1` |
| C05：已核实 | 名称、开始时间、结束时间分别留空且其余合法，均要求不提交且无新增。 | `LOCAL-required-名称`, `LOCAL-required-开始时间`, `LOCAL-required-结束时间` | `IRT-fd4181c2553d8e72076dbc95ede48bbd9d6174a8cc7273251857d14095cf315e` |
| C06：已核实 | 长度0/1/10/11及数字、中文、空格混入均有对应输入；Alpha等混合大小写ASCII字母能成功保存。 | `LOCAL-name-A`, `LOCAL-name-ABCDEFGHIJ`, `LOCAL-required-名称`, `LOCAL-name-ABCDEFGHIJK`, `LOCAL-name-Ab1`, `LOCAL-name-中`, `LOCAL-name-A B`, `LOCAL-permission-管理员-新增` | `IRT-f62a01c052c3c366dd60569d3d8d65bb4c41c1a6eafd4e6542d9ea11587b7ae3` |
| C07：已核实 | 两类管理角色打开新增时在STEP-0检查三个字段全部为空。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-超级管理员-新增` | `IRT-2d4e1094cce6aa737e34d1f7f2f5e9cbc4e027cbbf81446936085512ec9f177f` |
| C08：已核实 | 管理员与超级管理员对五种来源状态均打开复制弹窗，要求三个可编辑值完整回填；待开始数据已修正。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` | `IRT-93dcb66e00860752801f3dec1d7d052913f681bfce0577b9cabdc11daa2d404a` |
| C09：已核实 | 编辑入口只有草稿可用；管理角色打开后全部字段清空，四种非草稿禁止编辑，只读用户即使能进表单也不能保存。 | `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-state-草稿-编辑`, `LOCAL-state-待开始-编辑`, `LOCAL-state-生效中-编辑`, `LOCAL-state-已过期-编辑`, `LOCAL-state-已下线-编辑`, `LOCAL-permission-只读用户-编辑` | `IRT-810aed941e45d4663218912f9005afea3349507e90bb0b85dec826ef6c568906` |
| C10：已核实 | 关键边界均给出UTC秒级数据；跨提交/确认/重试明确T0与T1，完整生命周期分别列明三个实际提交时刻。 | `LOCAL-publish-end-早于`, `LOCAL-publish-end-等于`, `LOCAL-publish-end-晚于`, `LOCAL-publish-start-早于`, `LOCAL-publish-start-等于`, `LOCAL-publish-start-晚于`, `LOCAL-publish-cross-submit`, `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry`, `LOCAL-same-object-lifecycle` | `IRT-0a3a02c0f1a070aab57e5060efe82e2aa5dff5e79946b3bab80b24405f730a6b` |
| C11：已核实 | S>E报错且不提交，S=E且E>T允许发布，S<E的有效输入可保存。 | `LOCAL-order-大于`, `LOCAL-order-等于`, `LOCAL-publish-start-早于` | `IRT-12772a4a4db7843e247c49af4330ce9ccadde6039bf8c90ac78f20d1a7342cf4` |
| C12：已核实 | 普通非法输入仅要求不提交；精确报错仅用于来源明确规定的时间条件与筛选范围等提示。 | `LOCAL-required-名称`, `LOCAL-name-Ab1`, `LOCAL-name-中`, `LOCAL-order-大于`, `LOCAL-filter-invalid-起点晚于终点` | `IRT-5a869be2792abf8045f405543e7ea5730eee9a12fbcb1e6210caa4dab9aca347` |
| C13：已核实 | E<T、E=T、E>T分别保存草稿成功并保持草稿，不套用发布限制。 | `LOCAL-draft-end-早于`, `LOCAL-draft-end-等于`, `LOCAL-draft-end-晚于` | `IRT-5740ff7bc7acf4441e701c53bcdf63a8004e29a1dbc8f77e3b9f50abaf91f172` |
| C14：已核实 | E=T-1秒发布不提交并提示结束时间必须晚于当前时间。 | `LOCAL-publish-end-早于` | `IRT-81f2b60c71a40c6d072b1a4b4e24fa13a3dcd57f82bf58fd6d58c47f7731b487` |
| C15：已核实 | E=T发布不提交并精确提示结束时间必须晚于当前时间。 | `LOCAL-publish-end-等于` | `IRT-364a9daedfb30de7db5f7116bc3e382c99cdabe8b8aa4a859a4d57290381fc87` |
| C16：已核实 | E>T且S=T+1秒，发布结果待开始。 | `LOCAL-publish-start-晚于` | `IRT-41b1d989e5271ecc3056096d74469100a416b9574aed1496cfc1d8e0e3d9c392` |
| C17：已核实 | E>T且S=T，发布结果生效中。 | `LOCAL-publish-start-等于` | `IRT-d5228d2bb6455e24368066189a1c9dfc9a826e1fef25450a48ceffed508c6e36` |
| C18：已核实 | E>T且S=T-1秒，发布结果生效中。 | `LOCAL-publish-start-早于` | `IRT-4a23778fc92989848d41c059daafae20fc8c9357f108ff9e2375e46fa55610fb` |
| C19：已核实 | S=E>T发布为待开始，另在T=S=E读取为已过期，未产生生效中区间。 | `LOCAL-order-等于`, `LOCAL-equal-expire` | `IRT-851a5c06149a69df7025257441194a2f0c689b75344d45a16e504e4b9f73b767` |
| C20：已核实 | T0打开时E>T0，到T1=E才提交发布，明确拒绝保存且无新增，能区分旧时钟判断。 | `LOCAL-publish-cross-submit` | `IRT-e0cc6e5de953bbf4bbaee85f325cec6360a67fd7bacc639101c6015a11f45a12` |
| C21：已核实 | 各入口保存成功关闭；新对象与更新对象区分身份，并逐项核对名称和两个时间等于输入。 | `LOCAL-permission-管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中` | `IRT-ebbeea9684184077e150acba7cd7c4a96c3cb42a64e73bdfc7c561cf43c432c2` |
| C22：已核实 | 已发布未下线对象在S前一秒读取为待开始。 | `LOCAL-state-开始前` | `IRT-6c0439b2ad2afe02427e9f93f0c8cb0f46bdc0501145176d18615bb76ac80bf2` |
| C23：已核实 | 已发布未下线对象在T=S且T<E读取为生效中。 | `LOCAL-state-开始相等` | `IRT-4bc49cf43cbccc795a00e81271bd9e9cf87dd1e0c1b03ad467de41f396237c05` |
| C24：已核实 | 开始后一秒和结束前一秒均读取为生效中。 | `LOCAL-state-开始后`, `LOCAL-state-结束前` | `IRT-c0e3ff9dbb512e761e7ca03fccac64c268bc0775b664dadd135525d53662c855` |
| C25：已核实 | 当前时刻恰等于结束时间时读取为已过期。 | `LOCAL-state-结束相等` | `IRT-9b2c3e5f741e3d82673291f1b7a7c5ef1007daffc544ede3cd0a20558a8a1976` |
| C26：已核实 | 当前时刻超过结束一秒时读取为已过期。 | `LOCAL-state-结束后` | `IRT-4c897bce60125fbe35ae23c123ac9db3df86de79862d63419d10e2accbdb02c6` |
| C27：已核实 | 开始、结束、当前时刻相等的记录明确为已过期。 | `LOCAL-equal-expire` | `IRT-5ab52397d8f516181d98d2b9f96bd16581beb72eb2fa7c3da977d831f8dc6e60` |
| C28：已核实 | 同一草稿跨开始和结束时刻读取始终为草稿。 | `LOCAL-no-auto-草稿` | `IRT-b01660dad8289c5d01ff64244f9233ce1edea9e5900c582fd4e5874c70a954ae` |
| C29：已核实 | 同一已下线记录跨开始和结束时刻读取始终为已下线。 | `LOCAL-no-auto-已下线` | `IRT-9b19c6d2bb9fae41435caad6a28808e94768d0474de8eed64f5d5c73cbb0f168` |
| C30：已核实 | 状态按给定当前时刻重新读取，明确不验收自动刷新频率。 | `LOCAL-state-开始前`, `LOCAL-state-开始相等`, `LOCAL-state-结束相等` | `IRT-7f1ac85c635ef3b0740f9fadf31617314415edd2f9f77e7f09c87505bffafec0` |
| C31：已核实 | 待开始和生效中均有下线确认成功及取消路径，取消保持原记录。 | `LOCAL-state-待开始-下线`, `LOCAL-state-生效中-下线`, `LOCAL-cancel-下线`, `LOCAL-cancel-下线-待开始` | `IRT-6c9ee68448ad3353ceab6236c90493c447c04b5f7f8124dac6d4ee53141525e5` |
| C32：已核实 | 草稿、已过期、已下线以及只读用户均不能成功下线。 | `LOCAL-state-草稿-下线`, `LOCAL-state-已过期-下线`, `LOCAL-state-已下线-下线`, `LOCAL-permission-只读用户-下线` | `IRT-e7258d5531da9d530e37d9856257d737d906edc95e5b84f7b097ff7945991575` |
| C33：已核实 | 已下线E<T和E=T分别提示无法启用；非已下线状态有逐状态拒绝证据。 | `LOCAL-enable-expired-早于`, `LOCAL-enable-expired-等于`, `LOCAL-state-草稿-启用`, `LOCAL-state-待开始-启用`, `LOCAL-state-生效中-启用`, `LOCAL-state-已过期-启用` | `IRT-23d72e5e6f1f7fbe0a230e3f9eefdeae74bd80f35b0ec2e5de9f3b699216ee82` |
| C34：已核实 | E>T的已下线对象须二次确认；取消保持原状态和字段，确认成功才改变。 | `LOCAL-cancel-启用`, `LOCAL-state-已下线-启用` | `IRT-6c31b7dd17567c6137984e192da45446fa631e1cfedd7e806641d9ca40848db9` |
| C35：已核实 | S>T、S=T、S<T且E>T的启用分别为待开始、生效中、生效中。 | `LOCAL-enable-start-未来`, `LOCAL-enable-start-相等`, `LOCAL-state-已下线-启用` | `IRT-e26afe9d913ab60da371a64e537ec7ae34440a71925a9d54d0c7624075115dd5` |
| C36：已核实 | 草稿、待开始、生效中、已过期分别禁止启用，不以未来结束时间突破状态约束。 | `LOCAL-state-草稿-启用`, `LOCAL-state-待开始-启用`, `LOCAL-state-生效中-启用`, `LOCAL-state-已过期-启用` | `IRT-fc22830dd9bb3e882d735646916e36764a78e575991385313b69fc7e4efb32ee` |
| C37：已核实 | 待开始、生效中的下线失败各在失败步骤检查提示及原身份/字段/状态，再核对同一对象重试成功。 | `LOCAL-failure-下线`, `LOCAL-failure-下线-待开始` | `IRT-985169c75ed1d2a2ab01cdf32a24dcd7d3a0db5938b8d0e42a6b91b6a454b7f8` |
| C38：已核实 | 启用失败时在重试前检查已下线、身份和字段不变及操作失败提示，后续重试成功。 | `LOCAL-failure-启用` | `IRT-6ffdd49edd4e7d471b8a13b9be7cf509b01f8fb6335e0abc2785f52113ccbb55` |
| C39：已核实 | 下线和启用均在请求未完成时重复操作同一记录，要求不接受重复操作且仅一次状态效果。 | `LOCAL-duplicate-下线`, `LOCAL-duplicate-启用` | `IRT-a9610f26ae2acac9160808ae5dabd9bf54e5a09606a60eff7aac503a93782c18` |
| C40：已核实 | 启用确认等待和启用失败重试分别从T0<E跨到T1=E，均拒绝启用且保持已下线。 | `LOCAL-enable-cross-confirm`, `LOCAL-enable-cross-retry` | `IRT-19f6937fa9ca3e759dd7fa0e56ba9b7b0396271050c8098f2a1a6f1541df032b` |
| C41：已核实 | 取消保留原记录；失败与重试前后明确核对同一身份、全部字段及原状态，未替换或另建目标。 | `LOCAL-cancel-下线`, `LOCAL-cancel-下线-待开始`, `LOCAL-cancel-启用`, `LOCAL-failure-下线`, `LOCAL-failure-下线-待开始`, `LOCAL-failure-启用` | `IRT-a27fd60f0859c70e66f331e02fd6f14f31df6ee31ed0f13e32462ef312bf6796` |
| C42：已核实 | 三种角色分别查看五种状态记录，显示名称、开始、结束及状态且全部只读。 | `LOCAL-view-管理员`, `LOCAL-view-超级管理员`, `LOCAL-view-只读用户` | `IRT-305f2c032096189c74805464e0e0e16d6d1900b41216c6dda60aa72b75242abf` |
| C43：已核实 | 两类管理角色五状态复制都有证据，超级管理员还逐状态保存；只读复制的条件保存明确拒绝。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线`, `LOCAL-permission-只读用户-复制` | `IRT-7c3a85490f8bcd994963980d4355da4f69b0dc84d01d006c6aa979286ab1963b` |
| C44：已核实 | 打开复制时尚未新增；失败及取消均核对零新增，只有成功保存才创建新身份记录。 | `LOCAL-state-草稿-复制`, `LOCAL-state-待开始-复制`, `LOCAL-state-生效中-复制`, `LOCAL-state-已过期-复制`, `LOCAL-state-已下线-复制`, `LOCAL-reopen-复制`, `LOCAL-save-failure-复制`, `LOCAL-reopen-copy-different-source` | `IRT-f6bf4b3738231617bb3db492a751d41604c8f79ce6d785ebce11a32182d324b8` |
| C45：已核实 | 复制成功的新记录具有独立身份和正确输入值，源记录身份/字段/状态不变；新状态依本次保存而不继承源状态。 | `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`, `LOCAL-super-copy-草稿`, `LOCAL-super-copy-待开始`, `LOCAL-super-copy-生效中`, `LOCAL-super-copy-已过期`, `LOCAL-super-copy-已下线` | `IRT-e632b8d7f0b8ae44bcacae5a417a6708f7e111465baa2b5b55ed21e6e6b1ced2` |
| C46：已核实 | 已过期源对象保持全部回填值：保存草稿创建新草稿，保存并生效拒绝且源对象不变。 | `LOCAL-expired-copy-保存草稿`, `LOCAL-expired-copy-保存并生效` | `IRT-395a2ccbb4bd921b69bcabdb743bd4660d7525c93adaf5eee5e0a26ec5d75e48` |
| C47：已核实 | 编辑打开清空，保存成功保持原稳定身份并更新字段，没有新增记录或沿用旧输入。 | `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` | `IRT-8c524e112af8fde7cad858e9e18cdb476eb9071b7dcd8e7be84d318c8901c333` |
| C48：已核实 | 编辑保存草稿仍为草稿，发布根据开始时间成为待开始或生效中，结束已到期的重试被拒绝。 | `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中`, `LOCAL-publish-retry-编辑` | `IRT-f05776500444878d9daf7419648551faa5c72ab23bab861e0403747556ca1c5f` |
| C49：已核实 | 新增/复制要求新身份，编辑要求原身份更新，复制同时核对源记录不变，三类对象语义可区分。 | `LOCAL-permission-管理员-新增`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`, `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` | `IRT-e158c63abf07f34d4cd0dd57aca74ee793e4f8c89bd4de3fa9cfa8e464a4acbb` |
| C50：已核实 | 编辑预先记录稳定身份和字段，保存后对同一原对象核对更新并确认无新增。 | `LOCAL-编辑-保存草稿-草稿`, `LOCAL-编辑-保存并生效-待开始`, `LOCAL-编辑-保存并生效-生效中` | `IRT-2991d61640df4ca48e1ddbd54c5003c656a60fc03dd55f26577010ef5071b9da` |
| C51：已核实 | 新增/复制/编辑失败均在重试前保留弹窗及三个输入，随后不改输入重试成功。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑` | `IRT-38f1f39d2df45beaf61787adc48965cd0a569105ab2546f247123047a8b3a1d5` |
| C52：已核实 | 三入口在保存请求未完成时重复点击，新增和复制仅一条新记录，编辑仅一次原对象保存效果。 | `LOCAL-save-duplicate-新增`, `LOCAL-save-duplicate-复制`, `LOCAL-save-duplicate-编辑` | `IRT-da548ab7eee29e1a3bc502c4665c6aaa2285f413e1c919922351eed106e859b2` |
| C53：已核实 | 请求失败保留弹窗，重试成功关闭；校验未通过不提交，未把校验失败当作请求失败。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-编辑`, `LOCAL-required-名称`, `LOCAL-publish-end-等于` | `IRT-955ad285c08103c809aea2da25dc51dbaa34804faf3b2460694ab85796cb1bc0` |
| C54：已核实 | 取消关闭在取消步骤检查，重开后新增/编辑为空、复制为源值，预期绑定到对应步骤。 | `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` | `IRT-3211adc951aea63ca2acfb7d3943e4039d7aed9b6e50af562c9af17dbbd9ee06` |
| C55：已核实 | 三入口不恢复Temp；新增的A取消后从B复制场景要求回填Delta及B的日期，拒绝A和未保存缓存。 | `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑`, `LOCAL-reopen-copy-different-source` | `IRT-7b02d9215bdbe879471ca746ffe8c9ea0c6c0e91b0f7b326fc1fdb491ce17955` |
| C56：已核实 | 保存失败留在当前弹窗保留输入，与取消后再次打开重新初始化分别有明确步骤和预期。 | `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑`, `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑` | `IRT-4725e0228fe14481edf78c35404dcb0299f422ec6a63bb2122e854b6ee2c7920` |
| C57：已核实 | 三入口发布请求首次失败时E>T0，保持输入到T1=E重试均不提交，重新执行结束时间检查。 | `LOCAL-publish-retry-新增`, `LOCAL-publish-retry-复制`, `LOCAL-publish-retry-编辑` | `IRT-ef300108d541bf42ce23d57f96013bac8a1fac33a985e66a53fc0f8031a5b50d` |
| C58：已核实 | 名称数据包含完全、首部、中部、尾部匹配，以及大小写不同和不连续反例；三角色筛选权限有证据。 | `LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`, `LOCAL-filter-管理员`, `LOCAL-filter-超级管理员`, `LOCAL-filter-只读用户` | `IRT-e1177eee67825ab25f0a838ee0c6045e1c8f94928667027687a080266c581849` |
| C59：已核实 | 以固定UTC当前时刻构造五种正确状态，逐个筛选只命中相应唯一标识，明确相近状态互不混入。 | `LOCAL-filter-管理员`, `LOCAL-filter-超级管理员`, `LOCAL-filter-只读用户`, `LOCAL-filter-and`, `LOCAL-filter-state-草稿`, `LOCAL-filter-state-待开始`, `LOCAL-filter-state-生效中`, `LOCAL-filter-state-已过期`, `LOCAL-filter-state-已下线` | `IRT-cd2deec03de99d331f03ca58dcb9ceedfa1971b6646fe7c016b1216c03d4e87e` |
| C60：已核实 | 闭区间涵盖两种包含、双侧部分交叉、相等、双侧接触、双侧间隔和零宽记录，结果符合区间相交。 | `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-inside`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval`, `LOCAL-filter-time-right-disjoint`, `LOCAL-filter-time-equal`, `LOCAL-filter-time-zero-record` | `IRT-c870a15dc1edcf09b9ddee192233376ce99e6b90bfbdaedaf8671f37bfdb41e0` |
| C61：已核实 | 记录包含筛选、筛选包含记录、左/右部分交叉和完整相等均明确命中。 | `LOCAL-filter-time-inside`, `LOCAL-filter-time-contains`, `LOCAL-filter-time-cross-left`, `LOCAL-filter-time-cross-right`, `LOCAL-filter-time-same-interval` | `IRT-0cad227766408d0ef2ad12a8f24dff793561b328b2350446bdd1f5ad173b8dba` |
| C62：已核实 | 两个端点接触均命中，左右相隔一秒均不命中。 | `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-right-disjoint` | `IRT-be6c31c8d91bb589743c530cb47e653cbec546218550609215330d6181d49462` |
| C63：已核实 | 零宽筛选与覆盖该点的普通记录、同点零宽记录分别命中。 | `LOCAL-filter-time-equal`, `LOCAL-filter-time-zero-record` | `IRT-5dcd811af8903d5c17e3d35fbdf27d276e5d80538a28083032958e29ef7425d2` |
| C64：已核实 | 起止均空不限制；缺起点、缺终点和反向范围分别不搜索并提示时间范围不合法。 | `LOCAL-filter-empty`, `LOCAL-filter-invalid-缺结束`, `LOCAL-filter-invalid-缺开始`, `LOCAL-filter-invalid-起点晚于终点` | `IRT-7b2892f4b4640d435d6da7aefb3f2b79e2f51676094687ee7cb03e3866fe9bef` |
| C65：已核实 | 全部为空以及只填一种筛选时，其他空条件不施加限制。 | `LOCAL-filter-empty`, `LOCAL-filter-name-Ab`, `LOCAL-filter-管理员`, `LOCAL-filter-time-inside` | `IRT-519eeffa2b53dbbe461f990a43b0eac72dcf3a94ba56bdbce142142554563336` |
| C66：已核实 | A三项全满足，B/C/D仅满足两项，E/F/G分别只满足单项，H全不满足；预期仅A命中，涵盖全部真假组合。 | `LOCAL-filter-and` | `IRT-873f3bfbe5dd9a4609ad2d8c1fd41283486b2e3aed565b13eef6328e341f4560` |
| C67：已核实 | 首次搜索loading在首次步骤检查，完成前再触发明确不产生第二请求。 | `LOCAL-search-loading` | `IRT-89b226efc3af7db19b016566bc7556cf76deca1995985075a4a8bfd2eb275b1b` |
| C68：已核实 | 释放首次请求完成后再发起合法搜索，明确允许新请求并展示结果，未永久锁定。 | `LOCAL-search-loading` | `IRT-d63adf01d78696007c9f2de60fad804961f373658bbe62c23735e080553ffe67` |
| C69：已核实 | 重置后所有筛选字段为空，明确不验收是否自动搜索。 | `LOCAL-reset` | `IRT-06e70c7ee6dabb7215c87aa4f43df8c169bbceaabb843128799a4b41189d46ef` |
| C70：已核实 | 名称、五状态、区间和组合筛选均给出目标标识及命中集合，组合数据已补为具体名称、状态和UTC区间。 | `LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`, `LOCAL-filter-and`, `LOCAL-filter-empty`, `LOCAL-filter-time-touch-left`, `LOCAL-filter-time-outside`, `LOCAL-filter-state-草稿`, `LOCAL-filter-state-待开始`, `LOCAL-filter-state-生效中`, `LOCAL-filter-state-已过期`, `LOCAL-filter-state-已下线` | `IRT-8bc90f19752d58a2d8348c3f269ed63a55e8b50b57906ed4592bc67a160889c9` |

## Completion 交付

`comprehensive-review-completion.json` 的顶层仅含 `target_assessments` 与 `findings`。70 个 assessment 的来源引用与当前 issued target 完全一致；affected_items 同时绑定实际 FACT、VIEW、TP 和本次 RCASE。15 条 findings 保留历史确认问题并以当前证据标记 fixed_and_rechecked，没有通过删除历史发现伪装首次即通过。

此 completion 仅供上述当前 review_request 使用；旧运行继续保留为真实失败证据。AT20／AT22／AT23 变异审阅另行进行，不由本报告推定通过。
