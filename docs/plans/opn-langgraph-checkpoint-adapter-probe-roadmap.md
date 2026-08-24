<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-langgraph-checkpoint-adapter-probe-roadmap.json` | 最后更新: 2026-08-24 15:32:14

[~][X+] 1. LangGraph checkpoint/resume 单能力探针
├── [x][Y+] 1-1. Native baseline 与 conformance fixture
│   ├── [x][Y+] 1-1-1. Define native checkpoint fixture and resume oracle
│   └── [x][Y+] 1-1-2. Record authority and Evidence invariants
├── [x][Y+] 1-2. Provider-neutral checkpoint adapter contract
│   ├── [x][Y+] 1-2-1. Define adapter input/output and digest binding
│   └── [x][Y+] 1-2-2. Define dependency, version-skew, and exit boundary
├── [ ][Y+] 1-3. LangGraph checkpoint/resume probe
│   ├── [ ][Y+] 1-3-1. Implement isolated LangGraph checkpoint bridge
│   └── [ ][Y+] 1-3-2. Exercise checkpoint, resume, duplicate, namespace, and metadata cases
├── [ ][Y+] 1-4. Authority、Evidence 与 failure-gate conformance
│   ├── [ ][Y+] 1-4-1. Run crash, timeout, retry, approval, and authority negative cases
│   └── [ ][Y+] 1-4-2. Run Evidence digest and Human acceptance checks
└── [ ][Y+] 1-5. Adapter removal and decision closeout
    ├── [ ][Y+] 1-5-1. Remove the adapter and rerun the native fixture
    └── [ ][Y+] 1-5-2. Record continue, defer, or stop decision
<!-- ROADMAP_SECTION_END -->
