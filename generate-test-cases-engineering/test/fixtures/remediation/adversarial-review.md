# AT20／AT22／AT23 独立来源语义审阅

审阅者：独立上下文 `/root/source_first_review`。本上下文此前先读原始 minimal.md，建立 M01–M12，再读取本轮实际运行。此次重新读取了运行内来源、Claim、事实、行为视图、实际 review_request、staging 用例及检查点；结论来自这些内容与原始来源的逐条对照，不以变异名称、注入标签或正常样本通过结论代替审阅。

原始来源：[/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/minimal.md](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/minimal.md)。独立目标：[/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/independent-targets.json](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/test/fixtures/remediation/independent-targets.json)。

结论：AT20 必须等待失败恢复规则澄清；AT22 存在四组实质错误；AT23 遗漏取消及重新打开的完整责任。本轮不为任何变异运行签出 completed body。

## 实际运行及非交付状态

| 样本 | 运行 | 实际状态 | 本次审阅判定 |
|---|---|---|---|
| AT20 | `RUN-e9f6c85a-fc7a-4b3c-ba8e-7c3dc8280531` | `need_user_answers` / `requirements_analysis` / `SEMANTIC_GAP` | 必要未知，等待用户规则 |
| AT22 | `RUN-66ff1a44-9c6e-4366-8a58-6ace6a943347` | `need_revision` / `case_design` / `INDEPENDENT_REVIEW_REQUIRED` | 独立语义审阅拒绝通过 |
| AT23 | `RUN-e74d7817-448d-4627-9bae-6f32c333f7f2` | `need_revision` / `case_design` / `INDEPENDENT_REVIEW_REQUIRED` | 独立来源覆盖审阅拒绝通过 |

三个回复的 `produced_artifacts` 都是空数组，检查点的 `case_drafts_digest` 都是 null，`commit_profile` 都为 `pre_case_pending`。AT20 尚无 case-drafts；AT22／AT23 的 case-drafts 仍在 staging，`independent_review.status` 为 pending，accepted/r000 内只有 source-pack、evidence-claims、behavior-views。没有发现正式交付文件。

AT22／AT23 的 case_drafts 回复只有 INDEPENDENT_REVIEW_REQUIRED 这一条诊断：结构及引用检查已允许候选进入审阅，但这不表示编译器自动发现了下文语义错误。下文错误由本独立审阅发现；我未提交伪造通过记录，所以实际状态仍停在待审而非已交付。

## AT20：失败恢复规则确实未知

实际运行目录：[RUN-e9f6c85a-fc7a-4b3c-ba8e-7c3dc8280531](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/docs/remediation-2026-10-28/acceptance/adversarial/AT20/runs/RUN-e9f6c85a-fc7a-4b3c-ba8e-7c3dc8280531)。

逐字核对确认，实际 source-pack.content 恰好等于原始 minimal.md 删除“保存失败时保留弹窗和输入内容，允许再次保存。”之后的文本；其余源文未改变。不能把被删句从正常样本带回本次来源。

现有来源仍有“合法时新增一条草稿记录并关闭弹窗。”（CLM-7），但合法输入并不意味着请求一定成功；该句不能决定失败后弹窗关闭还是保留、输入清空还是保留、以及是否允许在当前表单再次提交。取消关闭及重新打开为空的句子只约束主动取消，不能推导请求失败后的行为。

实际问题是：“保存请求失败时弹窗和已填名称如何处理，是否允许再次保存？”这是完成失败恢复测试预期及步骤的必要问题，未要求用户补无关精确提示或技术实现。三个子问题都有可改变验收结果的不同答案，不能从现有成功、取消或处理中去重规则推出。

- 事实 `FACT-failure-unknown` 的 status 为 `ambiguous`，statement 为“保存失败后的弹窗、输入内容和再次保存行为未定义”，引用 CLM-7 作为所涉保存行为，不把成功句当作失败答案。
- semantic gap 为 `SAVE_FAILURE_UNDEFINED` / `failure_recovery`；semantic_gap_id 为 `SG-161bfbc59b8b05ceefc7dda983028101bfbf4a125ffb822bd188779027836751`。
- question_part_id：`QP-af08b87ed7194a2b04fa1edbd51b2e261d9e0b547f2ddd23df7b6554cc0c3954`；状态 presented，remaining_part_ids 包含该问题，answered_part_ids 为空。
- answer_options 为“当前无法确定”及“说明失败后的弹窗、输入与重试规则”；没有预选保留、关闭、清空或允许重试。source-pack.decision_records 为空；对已接受 evidence 中失败／重试相关内容作全文核对，只有未知描述和问题，没有默认恢复规则。

发现关口：需求分析阶段的语义缺口机制已经阻断；本独立审阅核实问题确属必要未知。此样本应保持等待澄清，不能据原始 M10 的旧答案生成当前失败恢复用例。

## AT22：引用完整但业务预期错误

实际运行目录：[RUN-66ff1a44-9c6e-4366-8a58-6ace6a943347](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/docs/remediation-2026-10-28/acceptance/adversarial/AT22/runs/RUN-66ff1a44-9c6e-4366-8a58-6ace6a943347)。
审阅摘要：`sha256:d14d78e9095e5b3839aeeb2af5d2529cfdc6b5b8f64cf6c6d6ea8fbf0eb76bfa`。

实际来源与原始 minimal.md 完全一致。17 个事实、17 个视图、17 个生成点和 17 个用例都存在；17 个点全部被用例引用。已核对 accepted 事实／视图与请求投影相同，各用例 oracle 还与其上游 outcome/view 的错误预期一致。因此这些错误不能通过“有 Claim ID”“有事实”“有测试点”或上下游文案一致来排除。

### AT22-F01：M02

来源：CLM-3，“只有管理员可以新增配置。”。
实际用例：`LOCAL-readonly-create`；`FACT-readonly-create`；`VIEW-readonly-create`。
生成点：`TP-47f1c9b8a44ee47f184535723cd0af968cfd59a0a859aaae1c480aec59aceca1`。
请求中的用例引用：`RCASE-fc9df2db3264d59b7f9f89235593c9d567616a8e006904ac76f8b181a8513b62`。
实际错误预期：“允许只读用户保存并新增一条记录”。

只读用户被允许创建，直接反转授权边界。FACT-readonly-create 的标题仍是“只读用户不能新增”，但 VIEW-readonly-create 的 expected 及实际 ORACLE-0 都允许新增；标题正确不能抵消执行断言错误。

修复建议：恢复只读用户入口不可用或保存被拒绝均不能新增的断言；入口可用时必须填写合法 Alpha 并尝试保存，核对记录标识集合及数量不变，不限定隐藏或禁用。

### AT22-F02：M08

来源：CLM-7，“合法时新增一条草稿记录并关闭弹窗。”。
实际用例：`LOCAL-name-one`；`FACT-name-one`；`VIEW-name-one`。
生成点：`TP-6e5811634c56409d31ee8999cbdcdd0d587a161cb5ebbdd21ca841022c984cda`。
请求中的用例引用：`RCASE-27177f65bf01832ff450479d7a7f781c879ae6079155c81dcf816e764061fab2`。
实际错误预期：“新增一条生效中记录并关闭弹窗”。

合法名称 A 应创建草稿，却断言生效中，且没有核对新记录名称 A。其他合法名称用例正确不能使该错误断言成立。

修复建议：恢复只新增一条名称 A 的草稿记录并关闭弹窗；核对新记录身份、名称与最终数量。

### AT22-F03：M05、M08

来源：CLM-4、CLM-7，“允许 1 至 10 个 ASCII 英文字母。”。
实际用例：`LOCAL-name-ten`；`FACT-name-ten`；`VIEW-name-ten`。
生成点：`TP-3ee882e96ef1da7b85b92345898337ac5d0c5a213df9f6b0c793bbe68f5b97cd`。
请求中的用例引用：`RCASE-ec4584baa34d871c2813162de550c41390c670236c9d968fa78883a11bad44be`。
实际错误预期：“十个字母不提交并提示“名称最多9个字母””。

ABCDEFGHIJ 是十个纯 ASCII 字母，处于合法上边界。候选把合法长度 10 改成非法，并捏造最大 9 的文案；来源的超过 10 个字母才拒绝不支持此预期。

修复建议：长度 10 必须成功创建名称 ABCDEFGHIJ 的一条草稿并关闭；保持长度 11 拒绝且精确提示“名称最多10个字母”，不要用十一字母正确用例抵消十字母错误。

### AT22-F04：M10

来源：CLM-9、CLM-7，“保存失败时保留弹窗和输入内容，允许再次保存。”。
实际用例：`LOCAL-failure`；`FACT-failure`；`VIEW-failure`。
生成点：`TP-f60e1f33c5aceacf27d8c4b77a559bee23163e2603e6fa834d6ec71ba8393165`。
请求中的用例引用：`RCASE-f80f77bb23e9465085e203e8b7e464274f4028fc26d1b89dcc7e13a7dfd177ee`。
实际错误预期：“失败后关闭弹窗并清空名称，不能再次保存”。

弹窗关闭、名称清空及不允许再次保存全部与原句相反。该唯一 oracle 还挂在 STEP-1（再次保存等待成功）后，既没有 STEP-0 请求失败后的中间观察，也没有重试成功的新记录结果；如果按错误预期关闭表单，STEP-1 的保持输入重试本身无法连续执行。

修复建议：STEP-0 后立即断言弹窗仍开、Alpha 保留、可重试且未新增；保持同一表单输入执行 STEP-1，成功后断言只新增一条名称 Alpha 的草稿并关闭。失败文案未定义，不补精确提示。

以上四组问题由独立语义审阅的反向核对发现：从实际前置条件、输入、步骤和断言返回源文校验。不是结构诊断或注入标签检验。未修复，不能将 M02／M05／M08／M10 标为 verified 或 required_recheck.passed。

## AT23：整条来源责任没有进入生成集合

实际运行目录：[RUN-e74d7817-448d-4627-9bae-6f32c333f7f2](/Users/zhangxudong/codes/awesome-self-skills/generate-test-cases-engineering/docs/remediation-2026-10-28/acceptance/adversarial/AT23/runs/RUN-e74d7817-448d-4627-9bae-6f32c333f7f2)。
审阅摘要：`sha256:929bd5e75deb59b6dcd9c5d06ba1abb3fecbce23b6a877d341554d0ac9b7d05a`。

AT23-F01，遗漏 M11：原始来源及实际 source-pack 均完整保留“点击取消关闭弹窗，重新打开时名称为空。”，accepted Claim `CLM-10` 也完整保留这句话。实际 review_request 仍有独立目标 `IRT-677e4f1c843ec6ce8f3595dd2e6617b3dbe07a95ca75b8e7a29ba3394fc9a3aa`，明确要求取消、关闭、重新打开为空及不恢复未保存输入。

但实际 accepted fact ledger 没有取消责任，行为视图没有取消流程，生成点、候选责任及 staging 用例均无取消／重新打开流程。对这些全部集合核对后，没有任何事实／视图／用例绑定 CLM-10，也没有“取消”动作。不是某条已有 case 的 oracle 少一个短语，而是来源到事实时就丢失了责任。不存在可诚实填写的本运行取消 case_id、fact_id 或 TP ID，故不能伪造缺失项引用。

最接近但不足的实际用例：`LOCAL-create-initial` / `FACT-create-initial` / `VIEW-create-initial` 只做首次“打开新增弹窗”，断言名称为空；其生成点为 `TP-0d8ba650dbc8ed2a378de48cfac2ec218824b2d4260e53adbd3ccfca44d8a9cb`，请求 case 为 `RCASE-f82fa9181dfcfc6699f972e81ec24cc6c9a6b46cc43268f8474a38b28ff94385`。它没有未保存 Temp、取消、关闭和再次打开，不能证明取消后的缓存清理。`LOCAL-failure` 只验证请求失败保留输入后重试，不能替代主动取消。

实质反例：实现首次打开为空、保存及失败重试都正确，但取消后再次打开恢复 Temp。AT23 的所有现存用例仍可通过，来源的取消重开规则却违反。这个反例从 M11 原始责任得出，与生成点数量无关。

已核对本运行 16 个正式生成点与 16 个用例 primary_test_point_id 的集合完全相等，点覆盖缺口为零；事实与视图也均为 16 个。然而生成点的分母本身漏了取消责任，所以“生成点 16/16 覆盖”只能证明已生成集合内部的引用覆盖，不能证明来源完整。遗漏由来源→事实→视图→点→用例的正向逐目标审阅发现；反向检查现存点找不到一条根本没有生成的责任。

修复建议：补充直接绑定 CLM-10 的取消事实及视图；用未保存名称 Temp，打开新增并输入、点击取消、立即检查关闭及未新增，再次打开立即检查名称为空且不恢复 Temp。经过重新生成和新的实际请求再审，不在本运行补一份通过 completion。

## 十二个来源目标的实际核对

下表的“满足”仅描述该目标在本变异候选中的内容，不等于整个运行可交付。所有目标来自先读来源的独立清单；两份实际 request 的 12 项 objective 已逐字与该清单核对一致。

| 目标 | 原始责任 | AT22 | AT23 | 实际用例锚点 |
|---|---|---|---|---|
| M01 | 两角色列表和详情 | 满足 | 满足 | view-管理员、view-只读用户 |
| M02 | 只有管理员可新增 | 不通过：F01 | 满足 | readonly-create、name-mixedcase |
| M03 | 唯一名称字段且初始为空 | 满足 | 满足 | create-initial |
| M04 | 空值不提交及精确提示 | 满足 | 满足 | name-empty |
| M05 | 1／10 合法及 ASCII 大小写 | 不通过：F03 | 满足 | name-one、name-ten、name-mixedcase |
| M06 | 11 字母拒绝及精确提示 | 满足 | 满足 | name-eleven |
| M07 | 数字／符号／空格／汉字／非 ASCII | 满足 | 满足 | name-digit、name-symbol、name-space、name-chinese、name-non-ascii |
| M08 | 合法新增对象名称、数量、草稿、关闭 | 不通过：F02／F03 | 满足 | name-one、name-ten、name-mixedcase |
| M09 | 真实处理中重复点击去重 | 满足 | 满足 | duplicate |
| M10 | 请求失败保留及同表单重试 | 不通过：F04 | 满足 | failure |
| M11 | 取消关闭、重新打开清空 | 满足 | 遗漏：AT23-F01 | AT22 cancel；AT23 无对应项 |
| M12 | 两角色详情字段只读 | 满足 | 满足 | view-管理员、view-只读用户 |

锚点除标明“无对应项”外，均为当前运行真实 `LOCAL-` case_id 的后缀。M09 的步骤在首次请求保持处理中时重复点击，再释放请求；M10 在 AT23 的失败观察挂在 STEP-0，成功观察挂在 STEP-1。M07 的五类非法输入分别为 Ab1、A-B、A B、中、é，没有补造精确校验提示。

## 审阅边界与证据

本轮只写此审阅证据，未改来源、事实、视图、用例、编译器或检查点；未给拒绝样本签出 completed body，也未为其创建正常样本 attestation。正常样本的审阅签出不适用于这些不同摘要的运行。

文件读取依据：各运行的 reply-evidence_claims 或 reply-case_drafts、checkpoint、accepted/r000/source-pack、accepted/r000/evidence-claims；AT22／AT23 另读 accepted/r000/behavior-views 与 staging/case-drafts。所有问题都可以通过以上实际工件复核。
