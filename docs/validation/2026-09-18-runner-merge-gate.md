# Runner 合并前集成门禁

日期：2026-09-18。目标远程：`g2060308919-star/awesome-self-skills`；工作分支：`codex/runner-usability-recovery`。

用户授权提交工作分支并合并到 `main`。拉取后发现 `origin/main` 从 `e7981dc` 前进到 `f592f0e`，新增 14 个提交，涉及 Generator 与 PRD E2E 插件；没有与本次已审查的 33 个候选文件发生文本重叠。工作分支已安全快进吸收这些提交，没有覆盖其他工作。

## 验证结果

| 检查 | 结果 | 说明 |
|---|---|---|
| Runner 全量回归 | 149/149 通过 | 同步远程前后均执行 |
| 官方 Skill 结构校验 | 通过 | 使用前轮隔离 Python 环境 |
| Sandbox 全量回归 | 168/168 通过 | 首次受沙箱本地监听限制，获准重跑后通过，没有修改代码 |
| 插件全量回归 | 57/58 通过 | 副本与仓库源快照不一致 |
| 未修改的 `origin/main` 插件全量回归 | 57/58 通过 | 独立导出 `f592f0e`，同一用例报告 Generator `BUNDLE_DRIFT` |
| 插件自身副本与锁定摘要 | 通过 | 未改动插件目录或锁定内容 |
| 独立检查旧 Runner 源快照与插件副本 | 通过 | 从 `origin/main` 导出的无依赖目录 |
| 独立检查本次 Runner 源快照与插件副本 | `BUNDLE_DRIFT` | 从提交导出的纯源码目录，不包含 node_modules 或临时产物 |

Runner 和 Sandbox 回归通过，不等于插件集成门禁通过。插件的测试 `bundle lock matches every Skill and both repository source snapshots` 要求两个子 Skill 副本与仓库源一致。最新 `main` 已有 Generator 漂移，本次 Runner 更新又需要处理 Runner 副本升级；不能把两者统称为与本次修改完全无关。

初次直接检查开发目录还遇到 `node_modules/.bin/semver` 符号链接被插件快照规则拒绝。改用 `git archive` 导出的纯源码重验后，Runner 仍然明确报告摘要漂移，排除了仅由本地依赖目录造成的误判。

## 合并边界

安全保留并推送已审查的 Runner 工作分支；暂不更新远程 `main`。需要用户决定是否扩大到插件副本升级、锁定摘要及兼容测试；不静默重新打包，不降级或删除失败测试，不强推。

Generator 的当前仓库版本与插件锁定的旧契约不同，因此不能用“重算摘要”宣称兼容。此记录只报告真实复现结果，没有修改插件或用例生成器实现。

## 本地复核材料

目录：`.tmp/runner-publish-fdaodI/`，已忽略、不提交。

- `runner-before-merge.log`、`runner-integrated.log`：149 项 Runner 回归。
- `sandbox-integrated.log`、`sandbox-integrated-authorized.log`：受限失败与获准重跑结果。
- `plugin-integrated.log`、`plugin-upstream-baseline.log`：集成树与远程基线的 58 项插件测试。
- `plugin-drift-isolation.log`：旧 Runner 与本次纯源码快照的独立摘要对照。
- `upstream-baseline/`、`candidate-clean/`：只读验证所用的 Git 导出副本，不是工作分支、安装副本或发布产物。
