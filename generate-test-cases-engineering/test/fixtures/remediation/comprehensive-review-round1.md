# 综合样本独立语义审阅：第 1 轮

结论：**需要修订，不能通过本轮独立审阅；不提交 covered-only completion。**

审阅者：独立上下文 `/root/source_first_review`。本审阅者先读取原始 `minimal.md`／`comprehensive.md`，形成 `independent-checklist.md` 与 `independent-targets.json`，其后才接收本次生成工件；未参与本次产物生成。

- 运行：`RUN-ff68a612-5815-49e5-ae0e-6dafecac0f93`，source revision `0`。
- 审阅请求摘要：`sha256:cc1a60366382b1e0141734de4666d2feaa856280f5b9d98a8cd8b0e6ebfbdc9b`。
- 读取范围：`reply-case_drafts.json` 中的 review_request／case_context，`accepted/r000/source-pack.json`、`evidence-claims.json`、`behavior-views.json`，`derived/r000/fact-ledger.json`，`staging/case-drafts.json`，以及原始综合样本。
- 已逐条阅读全部 110 条用例的前置条件、数据、步骤和预期；独立目标为先前来源优先建立的 70 项。
- 本次仅审阅正常产物；尚未接收或评价 AT22／AT23 的明确变异样本。

## 证据链核对

accepted source 的正文与原始 comprehensive.md 完全相等；45 个 locator 摘录和 45 个 Claim 值均能在原文找到。110 个事实、110 个 view element、110 个正式测试点和 110 条用例在本次投影中具有可解析的对应关系。逐项比对后，view／outcome 中的前置条件、数据、动作、预期与 staging case 一致，review projection 与 staging 的语义内容也一致。

这说明存在结构连接，不说明语义正确。下述 R01 的条件矛盾已经存在于 view／outcome，R04 等缺失责任没有进入事实／点层；R03 的观察时点缺陷出现在 Case oracle 绑定层。反向核对还发现 R11 的直接来源证据缺失。

## 实际发现

### R01 [P1] “待开始”四条用例的数据实际为生效中

- 独立目标：C03, C08, C31, C36, C43。
- 涉及 case_id：`LOCAL-state-待开始-下线`, `LOCAL-state-待开始-启用`, `LOCAL-state-待开始-编辑`, `LOCAL-state-待开始-复制`。
- 来源规则：`CLM-15`「对已发布且未下线的记录，当前时间早于开始时间为待开始；」；`CLM-16`「当前时间大于或等于开始、但小于结束时间为生效中；」；`CLM-20`「状态判定采用当前时刻，不约定自动刷新频率。」；`CLM-21`「待开始、生效中的记录允许下线；」。

这四条的 PRE-0 声称记录状态为待开始，但 DATA-0 是 S=2030-01-01T11:00:00Z、E=13:00:00Z，DATA-1 指定 T=12:00:00Z。按来源此刻必须为生效中。使用正确实现无法同时满足这组前置条件；这些用例无法证明待开始记录的行操作／编辑／复制责任。

修改建议：为待开始对象采用 S>T 且 E>=S 的时间，例如 T=12:00:00Z、S=12:30:00Z、E=13:00:00Z，并在动作前读取状态。修正上游 view/outcome 的条件后再生成用例，不能只改标题或 case 层。

### R02 [P2] 待开始记录的下线取消和请求失败分支没有证据

- 独立目标：C31, C37。
- 涉及 case_id：`LOCAL-cancel-下线`, `LOCAL-failure-下线`, `LOCAL-state-待开始-下线`。
- 来源规则：`CLM-21`「待开始、生效中的记录允许下线；」；`CLM-22`「二次确认取消不改变记录，确认成功变为已下线。」；`CLM-26`「下线或启用请求失败时记录保持原状态，提示操作失败并允许重试；」。

下线取消与失败重试用例均把原状态固定为生效中；唯一标为待开始下线的用例只走成功确认，而且还有 R01 的数据冲突。因此没有用例检查待开始下线取消不变、失败仍为待开始并可重试。

修改建议：补上真正待开始对象的取消及失败重试分支，记录稳定身份，失败／取消后先检查待开始和字段不变，再执行重试；选择距离 S 足够远的时刻，避免自然状态变化混入失败断言。

### R03 [P1] 中间状态的预期被绑定到最后一步，无法在正确时点验收

- 独立目标：C37, C38, C41, C51, C53, C54, C56。
- 涉及 case_id：`LOCAL-failure-下线`, `LOCAL-failure-启用`, `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑`, `LOCAL-reopen-新增`, `LOCAL-reopen-复制`, `LOCAL-reopen-编辑`, `LOCAL-same-object-lifecycle`。
- 来源规则：`CLM-22`「二次确认取消不改变记录，确认成功变为已下线。」；`CLM-24`「结束时间晚于当前时间时二次确认，取消不改变记录，确认成功按开始时间确定待开始或生效中。」；`CLM-26`「下线或启用请求失败时记录保持原状态，提示操作失败并允许重试；」；`CLM-33`「保存成功关闭弹窗。」；`CLM-34`「保存失败保留弹窗和全部输入，可重试；」；`CLM-36`「取消关闭弹窗，再次打开按对应新增、复制或编辑入口的初始化规则处理，不恢复上次未保存内容。」。

所有这些用例只有一个 ORACLE-main，并绑定最后一步。例如 LOCAL-failure-下线 的 STEP-1 已重试成功，但唯一 oracle 同时要求“首次失败…仍为生效中”和“重试成功变为已下线”；LOCAL-save-failure-复制 在 STEP-2 保存成功之后才绑定“首次失败保留弹窗和全部输入”。此时失败提示、失败状态和失败后输入可能已不存在，不能用最终成功结果倒推中间行为。取消重开用例把“弹窗先关闭”也放在重开之后。同一记录完整流程确实存在，并且步骤要求观察中间状态；本项不是说它偷换了对象，而是其正式 oracle 仍全部挂在 STEP-3，缺少各次转换时的明确检查点。

修改建议：下线／启用失败 oracle 绑定失败的 STEP-0；保存失败输入 oracle 绑定 STEP-1（重试前）；重开用例关闭 oracle 绑定 STEP-1、初始化 oracle 绑定 STEP-2；生命周期在 STEP-1／STEP-2／STEP-3 分别检查身份、字段与对应状态，并保留最终无额外新建断言。不要用一段回顾性文字代替实际观察时点。

### R04 [P1] 未覆盖提交、二次确认或重试前跨越结束时间的真实语义

- 独立目标：C20, C40, C57。
- 涉及 case_id：`LOCAL-publish-end-早于`, `LOCAL-publish-end-等于`, `LOCAL-enable-expired-等于`, `LOCAL-enable-start-未来`, `LOCAL-failure-启用`, `LOCAL-save-failure-新增`, `LOCAL-save-failure-复制`, `LOCAL-save-failure-编辑`。
- 来源规则：`CLM-8`「用例使用明确的当前时刻测试数据，各动作以实际提交时刻判断时间条件。」；`CLM-13`「保存并生效要求结束时间严格晚于当前时间，否则不提交并提示“结束时间必须晚于当前时间”。」；`CLM-23`「只有已下线记录允许启用：结束时间小于或等于当前时间时提示“无法启用”；」；`CLM-24`「结束时间晚于当前时间时二次确认，取消不改变记录，确认成功按开始时间确定待开始或生效中。」；`CLM-34`「保存失败保留弹窗和全部输入，可重试；」。

现有发布边界与启用边界均只有一个既定提交时刻，不能区分“按实际提交时间”与“沿用打开弹窗／确认框时刻”的错误实现。失败重试保存全部选择保存草稿，同样不能证明重新执行 E>T 检查。110 个 fact/view/outcome/case 中没有打开时 E>T、实际提交时 E<=T 的关系场景。

修改建议：至少新增三个来源关系场景：打开新增时 T0<E、保存并生效时 T1=E 拒绝；打开启用确认框时 T0<E、确认提交时 T1=E 拒绝；第一次发布保存／启用请求失败后，重试时 T1>=E 拒绝。写明 UTC 秒级 T0、T1、E 和实际发生的中间动作，断言对应精确提示、未提交／未启用及原对象状态。

### R05 [P2] 超级管理员的新增、编辑、复制仅验证打开弹窗

- 独立目标：C01, C03, C43。
- 涉及 case_id：`LOCAL-permission-超级管理员-新增`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-超级管理员-复制`。
- 来源规则：`CLM-1`「角色为管理员、超级管理员、只读用户。」；`CLM-3`「仅管理员、超级管理员可以新增、编辑、复制、下线、启用。」；`CLM-28`「所有状态的记录均允许查看、复制；」；`CLM-29`「仅草稿允许编辑，且这些操作仍受上述角色权限约束。」；`CLM-31`「复制先打开带全部可编辑值的新增弹窗，保存成功后才新建记录，原记录不变。」；`CLM-32`「编辑打开弹窗时全部可编辑字段清空，保存成功更新原记录，状态依保存按钮及时间规则确定。」。

这三条仅执行“尝试…”，预期也明确停在打开弹窗；其余实际新增／编辑／复制保存用例的角色均为管理员。若超级管理员能打开界面但保存时被错误拒绝，现有三条仍可通过。超级管理员复制也只有生效中来源的入口检查，其他状态复制的全部用例只使用管理员，不能完成独立目标中两种管理角色均可复制全部状态的责任。

修改建议：让超级管理员各执行一次合法新增、草稿编辑及复制保存，检查正确的新建／原对象更新结果；补充该角色其他来源状态的复制能力证据，或参数化到明确的角色×来源状态数据行。不要以管理员成功推定超级管理员保存权限。

### R06 [P2] 已过期对象复制后两种保存动作的差异未验证

- 独立目标：C46。
- 涉及 case_id：`LOCAL-state-已过期-复制`, `LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`。
- 来源规则：`CLM-12`「保存草稿成功后状态为草稿，不受结束时间已过去影响。」；`CLM-13`「保存并生效要求结束时间严格晚于当前时间，否则不提交并提示“结束时间必须晚于当前时间”。」；`CLM-28`「所有状态的记录均允许查看、复制；」；`CLM-31`「复制先打开带全部可编辑值的新增弹窗，保存成功后才新建记录，原记录不变。」。

已过期复制用例止于打开预填弹窗；三条复制保存用例均改填了未来结束时间，且前置写“编辑原对象为草稿”。没有把已过期源记录的旧结束时间一路保留到保存动作，因此未检查它可保存草稿、但不可直接保存并生效。

修改建议：以明确已过期源对象打开复制，保持所有回填值：一条保存草稿创建新草稿且源对象不变；另一条保存并生效不提交并提示“结束时间必须晚于当前时间”。允许在第二条继续改成未来结束时间成功发布，以证明输入可修正。

### R07 [P2] 闭区间筛选只覆盖部分相交关系

- 独立目标：C60, C61, C62, C63。
- 涉及 case_id：`LOCAL-filter-time-touch-left`, `LOCAL-filter-time-touch-right`, `LOCAL-filter-time-inside`, `LOCAL-filter-time-outside`, `LOCAL-filter-time-equal`。
- 来源规则：`CLM-39`「生效时间筛选为闭区间相交匹配，端点接触算相交；」；`CLM-40`「筛选区间须起止齐全且起点不晚于终点，否则不发起搜索并提示“时间范围不合法”。」；`CLM-9`「开始时间大于结束时间报错，相等合法。」。

五条区间用例已正确覆盖两个端点接触、记录包含筛选、左侧相隔一秒及零宽筛选。但没有筛选包含记录、左右部分交叉、完整区间相等、右侧相隔一秒。名为 equal 的用例实际是筛选 [12:00,12:00] 对记录 [12:00,13:00]，并非完整区间相等；也没有零时长记录与同点筛选的场景。这些区别在来源优先清单中已独立列为目标，不能靠通用“相交”标题计为覆盖。

修改建议：为记录 [12:00,13:00] 增加筛选 [11:00,14:00]、[11:30,12:30]、[12:30,13:30]、[12:00,13:00] 的命中，以及 [13:00:01,14:00] 不命中；另用记录 [12:00,12:00] 与同点筛选命中。保持 UTC 同日与明确预期对象。

### R08 [P2] 名称连续子串目标遗漏完全匹配和结尾匹配

- 独立目标：C58。
- 涉及 case_id：`LOCAL-filter-name-Ab`, `LOCAL-filter-name-ab`。
- 来源规则：`CLM-37`「名称筛选为区分大小写的连续子串匹配。」。

现有数据 A=AbCd、B=XAbY、C=abcd、D=ACb 能证明开头、中间、大小写与不连续反例，但没有等于搜索词的名称，也没有以搜索词结尾的名称。因此来源优先目标中的完全匹配和结尾子串尚无实际证据。

修改建议：在搜索 Ab 的数据集中加入 E=Ab 与 F=XAb，并明确两者命中；保留现有大小写与不连续反例。无需为了补这两行而重写已有正确场景。

### R09 [P2] 搜索完成后恢复可搜索没有验证

- 独立目标：C68。
- 涉及 case_id：`LOCAL-search-loading`。
- 来源规则：`CLM-43`「首次搜索进入 loading，完成前不能再次发起搜索。」。

该用例将首次请求保持处理中，第二步仅在完成前再次尝试，随后结束。它证明了处理中禁止重入，却不能排除搜索永远停留在禁止状态。独立目标 C68 没有对应 fact／point／case。

修改建议：释放首次请求并等待完成，再发起一次有效搜索，检查产生新的搜索请求并得到结果；保留原先完成前的禁止重入断言。

### R10 [P2] 复制成功仅检查身份与状态，未核对新记录保存的字段值

- 独立目标：C21, C45。
- 涉及 case_id：`LOCAL-复制-保存草稿-草稿`, `LOCAL-复制-保存并生效-待开始`, `LOCAL-复制-保存并生效-生效中`。
- 来源规则：`CLM-4`「可编辑字段为名称、开始时间、结束时间。」；`CLM-31`「复制先打开带全部可编辑值的新增弹窗，保存成功后才新建记录，原记录不变。」；`CLM-33`「保存成功关闭弹窗。」。

三条复制保存用例都填入 Gamma 和明确新时间，预期仅要求弹窗关闭、新建独立记录、源对象不变和新状态，没有断言新对象的名称／开始时间／结束时间等于本次输入。错误地保存源记录旧字段甚至丢失字段，只要状态与对象数量符合，仍可能满足现有预期。

修改建议：在保存后查看新记录的步骤中逐项核对 Gamma 与本条数据给定的开始、结束时间，并继续核对源记录的旧字段和身份不变。

### R11 [P2] 反向追踪时部分入口预期未绑定真正支持它的来源规则

- 独立目标：C07, C08, C09。
- 涉及 case_id：`LOCAL-permission-管理员-新增`, `LOCAL-permission-超级管理员-新增`, `LOCAL-permission-管理员-编辑`, `LOCAL-permission-超级管理员-编辑`, `LOCAL-permission-管理员-复制`, `LOCAL-permission-超级管理员-复制`。
- 来源规则：`CLM-6`「新增时全部为空。」；`CLM-31`「复制先打开带全部可编辑值的新增弹窗，保存成功后才新建记录，原记录不变。」；`CLM-32`「编辑打开弹窗时全部可编辑字段清空，保存成功更新原记录，状态依保存按钮及时间规则确定。」。

新增权限用例预期“三个字段均为空”，但其 fact claim_ids 与 oracle claim_ids 没有 CLM-6；编辑权限用例预期“全部清空”，没有 CLM-32；复制权限用例预期“带原记录全部可编辑值…尚未新建”，没有 CLM-31。引用的是角色及部分状态规则，它们不能单独支持这些初始化／新建时点结果。这些预期本身符合原始需求，但其实际证据链不完整。

修改建议：将 CLM-6、CLM-32、CLM-31 分别绑定到对应事实／view 字段与 oracle；保留权限条款作为角色授权证据，避免用大量无关 claim 掩盖缺失的直接证据。

## 已存在的正确证据与判断边界

本轮没有发现发布结束时间 E<T／E=T 拒绝、E>T 接受的预期被写反；开始时间等号和结束时间等号的状态预期正确；S=E 的合法发布与到时已过期均有对应场景。草稿／已下线不自动发布、编辑打开清空、复制打开回填、源对象不变、精确错误文案和重置不验收自动搜索，也都存在相应正确语义。

`LOCAL-same-object-lifecycle` 是实际从本用例新建记录开始，保存该记录身份，再对同一记录下线和启用的完整流程；没有证据表明它预先造好终态或切换到另一条记录。需要修正的是 R03 所列的中间 oracle 绑定。不能把这一缺陷夸大成不存在完整流程，也不能因存在这条流程就代替所有时间／失败／权限责任。

本轮未据此要求自动刷新频率、固定权限入口呈现、重复名策略、搜索失败策略等来源未定义的行为；也未把缺少全量任意笛卡尔组合自动视为缺陷。列出的缺口对应先前明确建立的来源目标和可区分错误行为的具体场景。

## 受影响目标与未覆盖责任

明确没有完整场景的来源关系为 C20（打开到提交跨结束时间）、C40（启用确认／重试时重新判断）、C46（已过期复制后的保存差异）、C57（保存重试重新判断时间）、C68（搜索完成后恢复）；C61、C62、C63、C58 等为已有部分证据但未覆盖目标中列出的区别。其他受影响目标按各发现逐项列出。本轮不把这些目标伪报为 covered，也不以“110 条用例／110 个点”推导完整覆盖。

## 问题用例的精确链路定位

下表用于把本报告中的 LOCAL case_id 绑定到本次 review_request 使用的 RCASE 和正式测试点；这些 ID 只来自实际工件。

| LOCAL case_id | 事实 ID | 正式测试点 ID | review_request case_id |
| --- | --- | --- | --- |
| `LOCAL-state-待开始-下线` | `FACT-state-待开始-下线` | `TP-2941262b851cb8937903114e4eb120487be416b70388db9db06395907f1d15e4` | `RCASE-3d43088aa4732e53331711c35d106cf07efb2e567c55942d0f85294070332ffa` |
| `LOCAL-state-待开始-启用` | `FACT-state-待开始-启用` | `TP-ce88142fe955cd63668d1b3757fb94e57bd721f4676eb71834f08a98c39a9c3c` | `RCASE-f0e98a2a0bd4b04ca6cc18c1c471223f18daffe97c0d08120a94c0be9c01d856` |
| `LOCAL-state-待开始-编辑` | `FACT-state-待开始-编辑` | `TP-a659bf894f492212470ec09f9203d2425c32aab3bd4013637cbb1140615cd1d9` | `RCASE-ff423e7146e168faa825914bc9e4d826449e0b928c1eb999394c269aa4adc602` |
| `LOCAL-state-待开始-复制` | `FACT-state-待开始-复制` | `TP-646ff87caefe10b99bb6305b8ab3aa3ad64d52fafe0f54357c6be223c16b5e83` | `RCASE-2bf9b67dfffad627098ac3adbb5c96e2f261c6e59d639147b0ba1d4786b1423f` |
| `LOCAL-cancel-下线` | `FACT-cancel-下线` | `TP-82fdd626886054d364e90cbd1bc324a271b4000bdca4c53a41b66b406ead4ae6` | `RCASE-a13fe862adef5c5ecb5e310796ef05dfcb6b9638c44243456bdb11760a87c6c5` |
| `LOCAL-failure-下线` | `FACT-failure-下线` | `TP-ff61ad1586146cb95869934b9907701132594b372c4df37bfc5a30c5bfc65c2e` | `RCASE-7df1afe6e88f9ceec46169345f3b97f1a089db9ce698e53c63834a89b08597e5` |
| `LOCAL-failure-启用` | `FACT-failure-启用` | `TP-d9f283708dee928ce220bfd06f01bc1de9bb80c6b46cc72e4177d86d6669d7d3` | `RCASE-c0c24a2caf7190fa125ee612eae4689a1aa3fc7359c68db89842b00a2541af7d` |
| `LOCAL-save-failure-新增` | `FACT-save-failure-新增` | `TP-45bf0e664e0802f6b1a01f7b3264c77b13843127bcc3cc1289f8e0796c133d6b` | `RCASE-47a4a904ca3750feb219740b87bd37b76d614cfdde4d935295cd86dd859673af` |
| `LOCAL-save-failure-复制` | `FACT-save-failure-复制` | `TP-f04f79892fcf3161fad7f8584505b6751f737eb780069dba748762f7f9f938cc` | `RCASE-d72fa2b2a020e469fafdc6abf868b5ea23e53dd4cc18d7df40af7b3bd180524e` |
| `LOCAL-save-failure-编辑` | `FACT-save-failure-编辑` | `TP-7325e3f6d932cfae93f38cb00652b61fa33710be290213583517276183682d62` | `RCASE-38ca5bfabc22cb5f2ca7b1d4f4d29e63affcbe8a90123c7e7809a28c628ac85a` |
| `LOCAL-reopen-新增` | `FACT-reopen-新增` | `TP-2e8063598a8ba9b785720f454169fdeb88c547bdcc8c5b53bd30946fbff63c76` | `RCASE-d172a4e6d00d7cddffa66890a35e34e3140e0f1fb033ed1ce75c6b38afc628c2` |
| `LOCAL-reopen-复制` | `FACT-reopen-复制` | `TP-875cbd43987de2697c463b9dbda3c27c56fa0f6ee971886e879b5e025849e9f2` | `RCASE-997e5d730717db657c605c711e0ac4f70e2dd603b9f590a8c119d39d3f47bbc1` |
| `LOCAL-reopen-编辑` | `FACT-reopen-编辑` | `TP-deb8a291e10252a0d568b7410a76285a69d7f0b5877f2e33c8c45eb8d295533e` | `RCASE-a82ef4228ba7fcde11ecb2d700923c5a6c050baa68713aecadf751c0b1a34d10` |
| `LOCAL-same-object-lifecycle` | `FACT-same-object-lifecycle` | `TP-8b4d1240a61e595560b924a900b798d0bb8593aa7bd8117fe4ba9088633ba344` | `RCASE-d27733d41f97bb8145727b673b17b650645ae4e24be4097b6c0e953a04111821` |
| `LOCAL-publish-end-早于` | `FACT-publish-end-早于` | `TP-5cc512eae09306941b8eb4bdcfa77add4d7c0fea57b450002303db33eebb6bf7` | `RCASE-42da507292b3c0232ada4ca4ec7940bad7c8b161c9a2cf904bdc1521bb8d838c` |
| `LOCAL-publish-end-等于` | `FACT-publish-end-等于` | `TP-390817bbeded6e8e65103be6c00f9e05cf6880b983b577201da8707041fc45af` | `RCASE-49686a38ba8b314e748a5356c645c3446592439abdc54745d919d422ffc62a92` |
| `LOCAL-enable-expired-等于` | `FACT-enable-expired-等于` | `TP-fbbc61e5ba950ac8a3a95b1088329460e2a3e091eef72a2f074dbc8b5e26ed58` | `RCASE-44144fbe03074b88da6f80bc67f414fe228dcab4b9662895f82e6fb6275e5ff6` |
| `LOCAL-enable-start-未来` | `FACT-enable-start-未来` | `TP-96a7d33f6fc22cec16341612c6e2a708de26339808392569f9ad6ffb0978498e` | `RCASE-f84bc2614988846e946d06cdba8cb6ad9223a9715199dc96e9429aec180f8f8f` |
| `LOCAL-permission-超级管理员-新增` | `FACT-permission-超级管理员-新增` | `TP-35648ac77a5dfe5880512c665c168b854f0e3dc45325afd3da1839fe61723ff8` | `RCASE-ecaaad05a2cce8d7e57eab975f69bd9241350defa0adb00ee1b9376f14487122` |
| `LOCAL-permission-超级管理员-编辑` | `FACT-permission-超级管理员-编辑` | `TP-a784c73abc7f9216781848768d7d6eb26d81f8fc9e878600b207b9914cf00bed` | `RCASE-d4963eef5ba8efe5bc8f45de74ffbbe99baa90338260aea5153cb048c34e1f7c` |
| `LOCAL-permission-超级管理员-复制` | `FACT-permission-超级管理员-复制` | `TP-1e4cf3cbebab1068b2f43ae1102b2e8be44c97f393b6505d6c47dabdc326c137` | `RCASE-1767937ddfba024a33d0fccb554cc1d32e094e0805f1fc3a87266f8ae247bcc6` |
| `LOCAL-state-已过期-复制` | `FACT-state-已过期-复制` | `TP-6aa7ec03e7acae9496315ae0cd560f3ae56556bcbfd6de4c0bb4832bb1d490d0` | `RCASE-305d5a789b7200693de68065739e1ddd09ce0a127eb398f7726b207b7449090b` |
| `LOCAL-复制-保存草稿-草稿` | `FACT-复制-保存草稿-草稿` | `TP-20b6749edf682894e51237678d5db031d342544e2c8b81a9a30707cd3fde985a` | `RCASE-17abf2f44bf77c7a99e77a85e95ff2d16e9a3f8a653d8d5f9b0a1862e004d16d` |
| `LOCAL-复制-保存并生效-待开始` | `FACT-复制-保存并生效-待开始` | `TP-70a256ed5556d763db9bdc26bb86da83d2f8fc532a26475f51d74c995a3c6f2d` | `RCASE-aea543f63b5eefbafa43aefb51df2974f445330eb30f1b3158dc2f9e689b3fff` |
| `LOCAL-复制-保存并生效-生效中` | `FACT-复制-保存并生效-生效中` | `TP-a7b1430b53d201a045818f353de3e483ed533a2f08c5bff46e5dd65bb009aea4` | `RCASE-9b6ce8570def2dbddf8052506b032e2682789e6dcf746a4e5046a793cf52e911` |
| `LOCAL-filter-time-touch-left` | `FACT-filter-time-touch-left` | `TP-887c5bac0fe18328eb4868cab0754dd17093ee47ee1bd57d963fb03b862145be` | `RCASE-57931cabdfbae24d09f899522868be9fbc664fcb64eff3d65a9d262c090892a5` |
| `LOCAL-filter-time-touch-right` | `FACT-filter-time-touch-right` | `TP-e6ee148630e477d561ee24e990f9458141e3ac362b68d621813d6f7cfe63bf31` | `RCASE-39e6618963eb43a9d4eb3a57a9a657da6bf6c1935f66e21921935f502234cf84` |
| `LOCAL-filter-time-inside` | `FACT-filter-time-inside` | `TP-45a088763748b9a747ea0b33d97e980ca832a7f7115526e73eae9fabaaea8356` | `RCASE-bf47ccc111071e20b1f514041e4e118a09405a2aaa6fe40dd04f5d70f647b0b1` |
| `LOCAL-filter-time-outside` | `FACT-filter-time-outside` | `TP-f619b14233576f12745ff04de699f6659aaf526af6d28327e36d68e24431592b` | `RCASE-97cb922357e322d038b6a460e8dc62d98005dcf63dc3337854565e5132cab544` |
| `LOCAL-filter-time-equal` | `FACT-filter-time-equal` | `TP-d8b1a96386161bd26b81b91040d4faaa0eff181ff9c111d02c669d6365fb91ca` | `RCASE-5edd391e4e4e27d9e47492dc9a416569e206a8e5fb2482a2d29c5b0357c8ec52` |
| `LOCAL-filter-name-Ab` | `FACT-filter-name-Ab` | `TP-f0c775107c5e0cc90caf0e07002275b48c2cee24ef8206f4aff162b6d4b50b6c` | `RCASE-ea025e7a8029251cebaaf37097eb1e8d8dfff6d3d7626ac9e91359f6be077e36` |
| `LOCAL-filter-name-ab` | `FACT-filter-name-ab` | `TP-abf312fc1a38bb6773427d1b8965c44ed7486a8e58dfe58f8831cdf39afad668` | `RCASE-72f5ccabc79aa5884d0a8d8d597f5a7af473c95541523bae945fdf3ef9cd1c43` |
| `LOCAL-search-loading` | `FACT-search-loading` | `TP-8d62efca64b0d2fbf3996d51a2aa003eb947f6cc6f7a5a520cf854fd9e6d70ca` | `RCASE-c3ecca91aa8b67f5851c70857b0f61ace665519a7faf5ad8899ade8bc6539ccb` |
| `LOCAL-permission-管理员-新增` | `FACT-permission-管理员-新增` | `TP-4295fc36611a835d8b2b10bbde9d1e6bb17819ef9ee049461e33d27f86c5d600` | `RCASE-5c5b8819dee95dcff045b946078e229173cf00978c12264a29fcca746b095554` |
| `LOCAL-permission-管理员-编辑` | `FACT-permission-管理员-编辑` | `TP-2c29fc67f908642e5220f1cace1b639c971a5e54e31e4d632886a59288829f4d` | `RCASE-88508c12eddf4160e24448e6712e5ad914395d62026996e34048d2001fef9657` |
| `LOCAL-permission-管理员-复制` | `FACT-permission-管理员-复制` | `TP-42e6c59b9ae2482be67702fd21ac3630e84c83437787bde23d5e9a794ca859d8` | `RCASE-927f1b8db6b25f883ad8a58961038466a837a6c35214f267405705ba9b5d9980` |

本报告未修改生成内容或编译器。完成修订后，应针对新的实际 review_request 摘要重新审阅；本轮不签发可提交的通过 JSON。
