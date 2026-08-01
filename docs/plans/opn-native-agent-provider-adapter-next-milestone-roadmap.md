<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-native-agent-provider-adapter-next-milestone-roadmap.json` | 最后更新: 2026-08-01 15:45:55

[x][X+] 1. OPN Native Agent Provider Adapter 下一里程碑
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
└── [x][Y+] 1-5. Real Agent conformance and Human review
    ├── [x][Y+] 1-5-1. Provider-neutral TrustedRunner contract and fake runner
    ├── [x][Y+] 1-5-2. macOS Swift TrustedRunner helper process-group conformance
    ├── [x][Y+] 1-5-3. macOS TrustedRunner Keychain observation signing
    ├── [x][Y+] 1-5-4. Node macOS TrustedRunner adapter and active registry verification
    └── [x][Y+] 1-5-5. macOS trusted environment proof and fail-closed launch gate
<!-- ROADMAP_SECTION_END -->
