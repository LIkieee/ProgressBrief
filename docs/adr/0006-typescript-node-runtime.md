# Use TypeScript and Node.js 24 LTS for the shared runtime

ProgressBrief will use one strict TypeScript codebase on Node.js 24 LTS for the CLI, deterministic rendering, local review server, file-native Work Library, GitHub adapter, and cross-platform installers. Python and Rust were viable alternatives, but Node provides the most direct shared ecosystem for browser testing, local web tooling, npm distribution, and macOS/Linux/WSL2 support while keeping one runtime for both agent hosts.
