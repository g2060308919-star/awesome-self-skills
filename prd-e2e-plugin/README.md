# PRD E2E 插件 0.2.0

本版本同步仓库中已提交的 Generator 与 Runner 源码快照。Generator 当前契约为 `4.3.0 / 0.8.0`，Runner 输入仍为 `2.0`；编排适配器保留完整 `4.2.0 / 0.7.0` 历史交接兼容，拒绝同次交接混用版本。不会迁移历史 Run 或更改用例语义。

## 构建与校验

在仓库根目录执行。先完成源 Skill 的提交和验证，再导出不可变 Git 源码快照；源目录有未提交或未跟踪文件时拒绝导出。忽略的本机依赖不会进入快照，但已跟踪的 `node_modules`、符号链接和特殊文件会被拒绝。

```sh
node --input-type=module <<'JS'
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportRepositorySnapshot, vendorChildSkills } from './prd-e2e-plugin/scripts/vendor-child-skills.mjs';
const buildRoot = await mkdtemp(path.join(os.tmpdir(), 'prd-e2e-build-'));
for (const skillName of ['generate-test-cases', 'b2b-e2e-runner']) {
  const snapshot = await exportRepositorySnapshot({ repositoryRoot: process.cwd(), skillName, destination: path.join(buildRoot, skillName) });
  console.log(skillName, snapshot.revision);
}
await vendorChildSkills({
  pluginRoot: './prd-e2e-plugin',
  generateTestCasesSource: path.join(buildRoot, 'generate-test-cases'),
  b2bRunnerSource: path.join(buildRoot, 'b2b-e2e-runner'),
  sourceKind: 'validated-repository-snapshot'
});
console.log('Source snapshots:', buildRoot);
JS
node prd-e2e-plugin/scripts/verify-bundle.mjs --plugin-root prd-e2e-plugin
npm --prefix prd-e2e-plugin test
```

原 `vendor-child-skills.mjs` CLI 仍可接收明确提供的纯净安装快照，默认记录 `validated-installed-snapshot`；仓库导出使用 `--source-kind validated-repository-snapshot`。来源枚举说明构建路径，不等于自动完成测试；发布者仍须验证来源和测试结果。

`bundle-lock.json` 保持闭合 `1.0` 结构，记录当前契约及三个 Skill 的完整树摘要。只忽略 `.DS_Store`，不放宽文件完整性检查。包测试也会导出两个仓库源 Skill 并逐字节对照，不能仅刷新摘要掩盖副本漂移。

## 依赖与运行

编排器只使用 Node 内置模块。Runner 的图像验证依赖由其 `package-lock.json` 锁定，按 Runner 自身说明执行 `npm ci`；测试还使用其开发依赖。请先验证未安装依赖的发布包，再在单独运行副本中安装依赖和测试。`verify-bundle` 是源码包完整性门禁，不用于含 `node_modules` 的运行目录，不能把运行依赖重新打包入 Skill 快照。

全量子 Skill 验证方法：把纯净的 `skills/b2b-e2e-runner` 复制到新建的隔离目录，在该副本运行 `npm ci` 和 `npm test`；Generator 工程运行 `npm --prefix generate-test-cases-engineering run check`。包兼容测试还调用真实 Generator 编译/产物生成函数及实际 Runner 校验器；其中准备状态属于测试 fixture，不宣称是实际 Agent 执行证据。

不会自动安装或覆盖个人 Skill、修改当前 Codex profile、市场配置或 MCP 配置。安装冒烟仍需独立授权，状态见 `tests/install-smoke.md`。本版本变更依据见 [契约升级补充说明](../docs/prd-e2e-plugin/04-contract-upgrade-0.2.md)。
