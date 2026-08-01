<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-native-agent-provider-adapter-next-milestone-roadmap.json` | 最后更新: 2026-08-01 11:21:48

[~][X+] 1. OPN Native Agent Provider Adapter 下一里程碑
├── [x][Y+] 1-1. Provider-neutral local process adapter contract
│   ├── [x][Y+] 1-1-1. Structured local process launch contract
│   └── [x][X+] 1-1-2. Bounded process result and termination contract
├── [x][Y+] 1-2. Real Agent process lifecycle and bounded execution
│   └── [x][Y+] 1-2-1. LocalExecutionPreflight 与 LocalExecutionApproval contract
├── [x][Y+] 1-3. Process output to structured Evidence
│   ├── [x][Y+] 1-3-1. Codex JSONL 与 agent_task_result bounded parser
│   └── [x][Y+] 1-3-2. 脱敏 Artifact 与 ProviderReviewPackage projection
├── [x][Y+] 1-4. Permission side-effect and cancellation gates
│   └── [x][Y+] 1-4-1. Execution policy、outcome persistence 与 failure gates
└── [~][Y+] 1-5. Real Agent conformance and Human review

### 当前施工：1-5. Real Agent conformance and Human review

**决策：**
- Q: 真实 Codex dogfood 是否默认 deterministic、真实调用显式 opt-in，固定 read-only/never/ephemeral/cwd，未满足环境时 skipped 或 blocked 而非 passed？ → 采用方案 A：默认 deterministic，真实 Codex 显式 opt-in (真实测试独立于默认回归，输出只保留脱敏 Evidence。)
- Q: 第一条真实 Codex dogfood 是否采用只读仓库分析/Review Evidence 任务，禁止修改文件、网络操作和外部资源创建，结果绑定文件引用与成功标准？ → 采用方案 A：只读仓库分析并生成 Review Evidence (先证明真实 Agent 做有价值工作；写入开发任务另开路线图。)
- Q: 首个真实 Codex dogfood 是否要求所有成功条件同时满足，任何一项失败都不能生成成功 Evidence？ → 采用方案 A：全量合取，失败即 blocked (成功必须同时满足进程、JSONL 终态、唯一结果 envelope、报告、file_refs、无修改、无外部副作用、策略一致和脱敏写入等条件。)
- Q: Review Evidence 中的 file_refs 是否必须绑定到精确 repository commit，并包含路径、行范围和内容 digest？ → 采用方案 A：精确 commit-bound file reference (Verifier 重新核验 repository、commit、relative path、合法行范围和 content_sha256，禁止引用漂移版本或路径逃逸。)
- Q: 首个只读 Codex dogfood 是否必须运行在启动前干净、运行后仍干净的专用 worktree 中？ → 采用方案 A：专用 isolated worktree，前后状态均需核验 (执行前后绑定 HEAD、status、workspace path 和 task cwd；运行前已有 dirty 状态直接 blocked，不猜测副作用归因。)
- Q: 首个真实 Codex dogfood 是否必须具备网络已禁用的可观测证据；无法证明时 blocked？ → 采用方案 A：必须具备 network-denied capability evidence (read-only 或 prompt 不等价于无网络；只接受已知 offline sandbox 的 policy digest 或运行器提供的明确 network-denied evidence。)
- Q: 首个真实 Codex dogfood 是否禁止继承父进程环境和本地登录凭据，只允许显式声明的非敏感环境变量？ → 采用方案 A：默认不继承任何环境和凭据 (只允许 Task 显式声明的 allowlist；首个 dogfood 不注入凭据，未登录或环境不满足只能 skipped/blocked。)
- Q: 即使 Provider 执行成功、Task verifier 通过，任务是否仍只能进入 review-pending，必须经过 Human 明确接受后才能标记最终完成？ → 采用方案 A：Provider、Task verifier、Human review、最终完成分层 (只有 Human acceptance 才能生成最终完成事实；拒绝或超时进入 blocked/revision-required。)
- Q: Human acceptance 是否必须对完整 review package digest 进行签名，并绑定 task、execution、attempt 和 Evidence refs？ → 采用方案 A：绑定完整 review package 并使用 HumanSigner 签名 (签名对象包含 task/execution/attempt、Task digest、verifier digest、review artifact digest、Evidence refs、Human identity 和 timestamp；review package 变化后旧签名失效。)
- Q: Provider 失败、Task verifier 失败或 Human 拒绝后，是否必须创建新的 execution attempt，禁止覆盖原 execution 的失败事实？ → 采用方案 A：新 attempt 迭代，旧 execution append-only (失败原因、退出元数据和 Evidence 保留；新 attempt 使用新的 execution_id/idempotency_key，并引用前一失败事实，禁止原地重跑和复用签名。)
- Q: 下一条实现切片是否限定为 deterministic fixtures，不执行真实 Codex？ → 采用方案 A：先完成 deterministic provider contract，再 opt-in dogfood (先实现 LocalExecutionPreflight、LocalExecutionApproval、Codex JSONL/task result parser、ProviderOutcome 映射、ReviewPackage 和完整失败矩阵；真实 Codex、网络探测、macOS sandbox、Web UI、写入任务后置。)
<!-- ROADMAP_SECTION_END -->
