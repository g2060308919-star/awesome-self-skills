# F03 answer semantics

This file is not an initial generation input. Use one row only after the run presents a matching current question.

| Script | User answer semantics |
| --- | --- |
| final | “本任务最终口径：发布时间距当前时间不超过 72 小时（含恰好 72 小时）的通知属于近期，可以撤回；超过 72 小时不可撤回。” |
| temporary | “暂按不超过 48 小时（含 48 小时）处理；这是临时口径，后续仍需确认。” |
| unknown | Use the advertised `mark_question_unknown` choice; do not invent a boundary. |
| defer | Use the advertised `defer_question_part` choice for this item only. |
| delivery | Use `request_delivery` only when this exact displayed item is explicitly selected for gap-bearing delivery. |
| partial | If a batch contains another independent item, answer only that other item and leave the time boundary unanswered. |
| invalid | Empty text or unrelated text; verify no accepted revision is created. |

A general “继续” before a unique current option is displayed is not one of these scripts and grants no authority.
