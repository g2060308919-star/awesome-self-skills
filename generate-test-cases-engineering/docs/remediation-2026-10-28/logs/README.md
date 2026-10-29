# 验证日志

`*-red.txt` 是改动前已观察到的缺陷，不表示最终通过。`*-green*` 是相应定向复验；`final-check.txt` 是最终全量检查的完整 TAP 输出，退出码和计数另在 ../verification.json。

故障注入、协议复核夹具和实际业务独立审阅分开记录；真实审阅全文在 ../../../test/fixtures/remediation，正式交付 verifier 在 final-delivery.txt。未复制包含大量重复内容的中途全量失败日志，其真实计数与原因已列入 ../self-checks.md。

日志仅清除行尾空白和末尾空行，诊断及测试结果内容保留。
