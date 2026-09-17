# B2B E2E 历史 Markdown 报告模板

> 仅供 `permission-batches-html-v1` 与无 profile 历史 Run 的兼容渲染使用。新建 `permission-batches-html-v2` Run 只生成 `report.html`，对话五列表由同一次报告模型返回，不使用本模板落盘。

- Run ID：{{run_id}}
- 开始/更新时间：{{created_at}} / {{updated_at}}
- 当前阶段：{{run_status}}
- 目标：{{target_urls}}
- 角色：{{roles}}
- 用例快照 SHA-256：{{test_cases_sha256}}

## 四态统计

- 通过：{{passed}}
- 未通过：{{failed}}
- 无法确定：{{undetermined}}
- 未执行：{{not_executed}}

| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |
|---|---|---|---|---|
{{one_row_per_input_case_in_input_order}}

## 未通过详情

{{failed_details}}

## 无法确定详情

{{undetermined_details}}

## 用户协助与阻塞

{{assistance_and_blockers}}

## 权限准备与执行批次

{{permission_groups_batches_waits_and_verifications}}

## 证据状态与数据处理

{{evidence_states_and_secret_scan}}

## 代理状态与真实验证

{{proxy_state_and_real_verification}}

## 清理结果

{{cleanup_attempts_failures_and_residuals}}

## 产物一致性校验

{{hash_ids_counts_paths_contract_and_scan}}

> `report.html` 与本兼容报告必须来自同一快照、事件读取边界和结果行；对话全表从本文件复制。
