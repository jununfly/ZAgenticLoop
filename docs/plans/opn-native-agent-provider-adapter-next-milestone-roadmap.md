<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-native-agent-provider-adapter-next-milestone-roadmap.json` | 最后更新: 2026-08-01 02:26:23

[~][X+] 1. OPN Native Agent Provider Adapter 下一里程碑
├── [x][Y+] 1-1. Provider-neutral local process adapter contract
│   ├── [x][Y+] 1-1-1. Structured local process launch contract
│   └── [x][X+] 1-1-2. Bounded process result and termination contract
├── [~][Y+] 1-2. Real Agent process lifecycle and bounded execution
├── [ ][Y+] 1-3. Process output to structured Evidence
├── [ ][Y+] 1-4. Permission side-effect and cancellation gates
└── [ ][Y+] 1-5. Real Agent conformance and Human review

### 当前施工：1-2. Real Agent process lifecycle and bounded execution

**决策：**
- Q: 第一版 Codex Adapter 是否固定使用 codex exec --json --ephemeral --sandbox read-only --ask-for-approval never --cd <task cwd>，通过 stdin 接收任务并只读执行？ → 采用方案 A：只读、非交互、可重放执行 (先验证真实 Agent 驱动和 Evidence 转换；写入任务另开路线图。)
<!-- ROADMAP_SECTION_END -->
