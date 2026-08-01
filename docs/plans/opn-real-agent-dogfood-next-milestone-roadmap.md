<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-real-agent-dogfood-next-milestone-roadmap.json` | 最后更新: 2026-08-01 17:03:14

[~][X+] 1. OPN Real Agent Dogfood 下一里程碑
├── [x][X+] 1-1. Provider-neutral real-agent-dogfood contract
├── [x][Y+] 1-2. Deterministic Single-Agent OPN Atom conformance fixture
├── [ ][X+] 1-3. Provider-neutral real-agent-dogfood CLI entry
├── [ ][X+] 1-4. Opt-in real Agent read-only execution
├── [ ][Y+] 1-5. Dogfood Evidence and independent verification chain
└── [ ][Y+] 1-6. Human review and acceptance handoff

### 当前施工：1. OPN Real Agent Dogfood 下一里程碑

**决策：**
- Q: 问题1：是否冻结现有路线图，下一张路线图只聚焦 provider-neutral real-agent dogfood？ → 同意 (范围限定为通用 --real-agent-dogfood 入口、单 Agent OPN Atom、真实 Agent opt-in 执行、TrustedRunner 环境证明、read-only self-audit、Evidence/Verifier/Human review；多 Agent Graph、跨设备组网、写入型开发任务和新扩展框架另开范围。)
- Q: 问题16：里程碑是否只有在真实 Provider、Human approval、Trusted environment、clean worktree、完整进程边界、bounded output、structured result、独立 verifier、EvidenceStore 和 Human accept 全部通过时才算完成？ → 同意 (采用全量合取；任一 gate 失败只能进入 blocked 或 outcome-uncertain，不能生成最终完成事实。)
- Q: 问题29：本里程碑的产品成功标准是否是单 Agent OPN Atom 的责任链闭环可用，而不是比较 Agent 速度、Token 成本或 Human 单人效率？ → 同意 (验收用户发起委托、生命周期自动推进、风险可解释停下、证据可复核、Human accept/reject/revise 和中断恢复；Agent 能力、成本优化和多节点 ScaleUp 后置。)
- Q: 问题48：network-allowed 的首版 coarse 语义是否定义为允许执行期间的网络访问，不做 endpoint、域名或目的地细分，但必须由 Human approval、policy digest、execution/attempt 绑定和 TrustedRunner observation 证明实际采用且未漂移？ → 同意 (首版只实现 network-denied 与 network-allowed 两种可执行粗粒度模式；网络风险由 Human approval 明确承担，TrustedRunner 证明实际 mode 与 digest，endpoint 级治理另开路线图。)
- Q: 问题49：网络策略契约是否统一改为通用字段 network_policy，而不再使用 network_denied 专字段？ → 同意 (核心协议使用 network_policy.mode（network-denied 或 network-allowed）与 network_policy.policy_digest；TrustedRunner 和 post-run observation 必须绑定实际 mode/digest，network_denied 不再作为核心协议字段。)
- Q: 问题50：实现顺序是否采用先契约与 deterministic fixture，再改 macOS TrustedRunner/native helper，最后接入 orchestrator？ → 同意 (先固定 provider-neutral contract 与 deterministic fixture，再迁移 macOS TrustedRunner/native helper，最后接入 orchestrator；当前无线上正式用户，直接干净移除旧 network_denied 兼容分支。)
- Q: 问题51：network-allowed 是否仍必须运行在 macOS Seatbelt 等 TrustedRunner 沙箱中，只把网络规则切换为允许，而不是退化为无沙箱执行？ → 同意 (network-allowed 仅改变网络策略；进程边界、凭据清理、worktree 隔离、输出限制和 TrustedRunner 证明继续生效。)
- Q: 问题52：policy_digest 是否应覆盖完整的可执行策略，而不只是 network_policy.mode？ → 同意 (digest 至少覆盖网络模式、Seatbelt profile、凭据 allowlist、进程边界、输出限制和超时配置；approval、TrustedRunner、execution 和 verifier 使用同一份 canonical policy digest，任何漂移都进入 blocked。)
- Q: 问题53：deterministic fixture 是否必须同时覆盖 network-denied 与 network-allowed 两种模式，并覆盖 policy digest 漂移、实际 mode 不一致、TrustedRunner 未证明等失败场景？ → 同意 (fixture 完整锁定双模式成功路径与拒绝路径，再迁移真实 macOS 实现，避免只改字段名而没有实际策略验证。)
- Q: 问题54：network-allowed 的验证是否分为 deterministic fixture 与 macOS native smoke 两层，且不把外部 endpoint 可达性作为本 milestone 的稳定测试依赖？ → 同意 (fixture 只验证契约、digest、模式绑定和拒绝逻辑；macOS native smoke 验证 TrustedRunner 实际加载 allowed profile 且 observation 中 mode/digest 一致。)
- Q: 问题55：用户是否必须在 start 时显式选择 network-denied 或 network-allowed，并在 Human approval 摘要中看到该模式及完整 policy_digest？ → 同意 (start 必须显式选择网络模式；审批摘要展示模式和完整 policy_digest；两种模式都不静默默认切换，缺失或上下文不一致直接 blocked。)
- Q: 问题56：CLI/API 是否都应把网络模式设为必填字段，省略时直接拒绝而不是采用默认值？ → 同意 (CLI 必须显式传 network-denied 或 network-allowed；API 必须传 network_policy.mode；省略即拒绝，避免不同入口产生不同默认行为。)
- Q: 问题57：是否冻结以上网络策略决策，进入 TDD 实现阶段？ → 同意 (网络策略设计冻结；按先 provider-neutral contract、再 deterministic fixture、再 macOS TrustedRunner/native helper、最后 orchestrator 的顺序实现。)

**当前子树：**
├── [x][X+] 1-1. Provider-neutral real-agent-dogfood contract
├── [x][Y+] 1-2. Deterministic Single-Agent OPN Atom conformance fixture
├── [ ][X+] 1-3. Provider-neutral real-agent-dogfood CLI entry
├── [ ][X+] 1-4. Opt-in real Agent read-only execution
├── [ ][Y+] 1-5. Dogfood Evidence and independent verification chain
└── [ ][Y+] 1-6. Human review and acceptance handoff
<!-- ROADMAP_SECTION_END -->
