# Retired Docker runtime tests

These files remain as historical test evidence. The active Windows native suite
excludes this directory through `vitest.config.ts`; a skip or missing Docker
daemon is not counted as a passing Windows acceptance result.

| File | Retired behavior | Windows replacement |
| --- | --- | --- |
| `docker-isolation.test.ts` | Docker container isolation, network and quota probes (AC39/AC40) | WN14-WN22 native process, source protection and toolchain tests |
| `fin00-isolated-loop.test.ts` | Docker default runner and container mount behavior | WN14-WN22 native runner and WN58-WN60 accepted set tests |
| `fin02-capability.test.ts` | Docker daemon/image capability and container security probes | WN14-WN22 explicit native readiness and process controls |
| `p07b-dispatch-egress.test.ts` | Docker egress policy and proxy enforcement | K02 removes container egress enforcement; WN19 preserves settings secret handling and WN14 covers the native MCP run |

The full legacy obligation decisions are recorded per ID in
`ai/acceptance/legacy-to-006.json`. General data, source, and process
protections remain active there. These files are not evidence of a Windows
runtime pass.
