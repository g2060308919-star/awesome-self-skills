# Source Testing Decisions trace

This is a portable trace extract, not a new instruction source. The canonical source is `2026-08-28-b2b-e2e-runner-handoff-bundle.zip` (`01-SPEC.md`, “Testing Decisions”), supplied by the user. ZIP SHA-256: `b9e86f475d93b29003e2516e0c2ab25a4caed277fcea3891435f365a22a8662e`.

The TD labels below were added only for audit references; each decision text is preserved from the attached specification.

1. **TD01.** Test the Skill at its single highest seam: provide a confirmed semantic test plan and non-production target, then inspect browser behavior and the final execution record, evidence, and report. Do not test internal prompt wording or incidental reasoning steps.
2. **TD02.** A good test exercises externally observable behavior: the Skill opens the correct target, requests manual login, uses Chrome DevTools MCP, adapts to the current UI, asks for help when needed, records accurate facts, derives honest verdicts, and produces complete artifacts.
3. **TD03.** Verify a straightforward happy path in which all elements are discoverable, all actions are performed by AI, and all required assertions pass.
4. **TD04.** Verify a product-failure path in which the action completes but a required expected result is contradicted, producing a Failed verdict and relevant evidence.
5. **TD05.** Verify a missing-element path in which safe exploration is exhausted and the Skill asks the user for a path or clarification instead of declaring a defect.
6. **TD06.** Verify a wrong-test-case path in which the user confirms the case description is incorrect and the Skill records a case issue rather than a product failure, reclassifies affected assertions as unverified or not-run according to whether relevant execution occurred, and derives Inconclusive or Not Run accordingly.
7. **TD07.** Verify a permission-limited path in which the current account cannot complete a required action and the Skill requests an account or permission change.
8. **TD08.** Verify an external-actor path in which another person completes an action, the Skill resumes, and the report preserves which interaction was not directly observed.
9. **TD09.** Verify a mixed-role path in which roles map to one or more accounts and the AI adapts through user-assisted changes without relying on a fixed role-to-account rule.
10. **TD10.** Verify a pause-and-continue path in which the browser or page changes while waiting and the Skill re-observes before continuing.
11. **TD11.** Verify that independent cases may continue while a blocked case waits, without violating declared dependencies or reordering uncertain cases.
12. **TD12.** Verify an ambiguous-write path in which the Skill inspects resulting state before retrying and avoids duplicate business records.
13. **TD13.** Verify a destructive-action path in which ambiguous scope causes a clarification request rather than speculative execution.
14. **TD14.** Verify a failure-diagnostics path in which relevant console or network evidence is collected without collecting unrelated noise.
15. **TD15.** Verify adaptive evidence behavior: key assertions and failures receive evidence while ordinary intermediate clicks do not require redundant screenshots.
16. **TD16.** Verify assertion and case verdict derivation for all four assertion outcomes and all four case-level verdicts, including a partially executed case that mixes verified-pass with not-run and must be Inconclusive.
17. **TD17.** Verify that user assistance and evidence provenance are represented separately from the case business verdict.
18. **TD18.** Verify an incomplete-evidence path in which visible downstream state passes but an in-scope external interaction remains unverified, producing an Inconclusive result when that interaction is a required assertion.
19. **TD19.** Verify cleanup success, cleanup failure, missing cleanup instructions, and residual-data reporting.
20. **TD20.** Verify that secrets are not copied into any persisted artifact, including raw console/network evidence, execution records, evidence descriptions, screenshots, or the final report.
21. **TD21.** Verify that confirmed production targets are rejected before browser actions begin and that an unknown or conflicting environment remains blocked until affirmative non-production context is obtained.
22. **TD22.** Verify that missing or unavailable Chrome DevTools MCP capability is reported clearly and does not trigger a fallback to Playwright or another browser mechanism.
23. **TD23.** Verify that every run produces the exact artifact names `report.md`, `execution-log.json`, and `evidence/`, with report and log references resolving to evidence under that directory.
24. **TD24.** There is no existing codebase or prior test suite for this greenfield Skill. Forward tests should therefore use representative non-production demo applications and raw test plans, and evaluate only the artifacts and observable interactions available to a normal caller.

## Immutable Decisions trace

This is a portable trace extract, not a new instruction source. The canonical source is `2026-08-28-b2b-e2e-runner-handoff-bundle.zip` (`02-IMPLEMENTATION-GUIDE.md`, “不可变决策清单”, source lines 39–63), supplied by the user. The ZIP SHA-256 is the same value recorded above. Each decision below preserves the source wording.

1. **D01.** 本 Skill 只处理“测试用例到测试报告”，不处理“需求到测试用例”。
2. **D02.** 输入测试用例 JSON 由上游提供；本次不定义它的精确 Schema，只假设其能表达测试语义。
3. **D03.** 执行前必须向用户展示测试范围并取得确认，除非用户已经明确确认同一份输入。
4. **D04.** 只允许开发、测试或预发环境。启动 Chrome 前必须有肯定的非生产环境上下文；环境未知或信息冲突时必须向用户求证并保持阻塞，已确认生产环境必须拒绝。
5. **D05.** 唯一浏览器执行方式是 Chrome DevTools MCP。不得擅自替换成 Playwright、其他浏览器 MCP 或 Computer Use。
6. **D06.** Chrome DevTools MCP 启动独立、可见的 Chrome，不连接用户日常 Chrome。
7. **D07.** 第一版只支持用户在受控 Chrome 中手动登录，不保存或自动填写账号密码。
8. **D08.** 测试用例保持业务语义，不要求 CSS、XPath、源码路由或预生成页面地图。定位元素优先使用结构化页面信息；截图用于视觉理解和留证，不得作为唯一定位机制。
9. **D09.** 核心执行循环是：理解目标、观察页面、定位目标、执行动作、验证结果、采集证据、记录事实。
10. **D10.** 使用 AI 的现场推理能力，不实现固定权限规划器、账号角色引擎、导航规则引擎或穷举状态机。
11. **D11.** 用户协作是正常能力。AI 可在任何步骤请求登录、切换权限、外部人员操作、页面路径、测试数据或业务解释。
12. **D12.** 请求协助前先进行与当前步骤相关、合理且无破坏性的探索；求助内容必须精确说明现场、尝试和所需动作。
13. **D13.** 暂停后继续是轻量逻辑进度，不是浏览器快照、进程恢复系统或复杂工作流引擎。等待期间只能继续可合理确认为独立的用例；独立性不确定时必须保留用例声明的顺序和依赖。
14. **D14.** 用户处理后必须重新观察页面和业务状态，不能机械复用暂停前的元素或假设。
15. **D15.** AI 无法执行不等于产品失败。只有有效必需预期被观察事实否定时才能判定失败；用户确认用例或预期错误时必须记录 case issue，不得将无效预期与现场的不符标为 verified-fail。已发生相关执行或观察时将受影响断言标为 unverified，否则标为 not-run，再正常汇总用例结论。
16. **D16.** 写操作结果不明确时先观察是否已经生效，不自动重试，避免重复副作用。
17. **D17.** 证据按现场自适应采集；关键断言、失败、疑似异常和重要人工介入必须留证，不要求每次点击截图。
18. **D18.** 断言状态固定为 verified-pass、verified-fail、unverified、not-run。已有相关执行、观察或外部活动但证据无法证实或证伪时用 unverified；断言尚未到达且从未尝试验证时用 not-run。
19. **D19.** 用例结论固定为 Passed、Failed、Inconclusive、Not Run，并按顺序从必需断言事实汇总：任一 verified-fail 则 Failed；全部 verified-pass 则 Passed；无实质执行且全部 not-run 则 Not Run；其余无失败的部分执行或证据缺口组合均为 Inconclusive，包括实质执行后仍有 not-run。
20. **D20.** 每个步骤记录执行来源：AI、用户辅助且 AI 已观察、外部人员执行、仅用户确认。执行来源不自动决定业务结论；未被 AI 观察的范围内交互若对应必需断言，该断言必须保持 unverified，且无 verified-fail 时用例结论必须为 Inconclusive。
21. **D21.** 只执行测试用例声明或用户明确授权的清理，不推测删除范围；清理失败和残留数据必须报告。
22. **D22.** 所有持久化产物都不得记录密码、Cookie、Authorization、令牌或其他秘密，也不得包含与验证无关的敏感业务数据。该约束同样适用于原始或摘要化的 Console/Network 证据，只保存最小必要诊断字段。
23. **D23.** 每次运行的输出名称固定为 `report.md`、`execution-log.json` 和 `evidence/`。第一版不做 HTML 报告。
24. **D24.** 第一版不创建自定义 Runtime、报告平台或确定性渲染脚本；只有真实验证证明纯 Skill 输出不稳定时才能提议增加。
25. **D25.** 不参考、复制或继承目标电脑上可能存在的其他本地 E2E Skill。以本 Spec 为唯一业务设计基线。
