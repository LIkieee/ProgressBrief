# Security policy

ProgressBrief processes work evidence that may be private or internal. Treat
credentials, authentication material, raw absolute local paths, malicious
HTML, repository text, and source URLs as untrusted data.

## Supported versions

Security fixes are applied to the latest development version until a V1
release exists. Published support ranges will be documented with releases.

## Reporting a vulnerability

Do not place credentials, private work content, or exploit payloads containing
real data in a public issue. Use GitHub's **Privately report a vulnerability**
flow from the repository's Security tab:

<https://github.com/LIkieee/skill/security/advisories/new>

If private reporting is temporarily unavailable, open a public issue containing
no sensitive details and ask the maintainer to establish a private channel.

Include the affected revision, impact, a minimal synthetic reproduction, and
whether the issue crosses a Workspace boundary or exposes a local service.
Replace every real secret and local path with an unmistakably fake sentinel.

## Security boundaries

- Workspaces are privacy boundaries; retrieval must not cross them by default.
- GitHub access is read-only and uses existing host authentication.
- Finalized reports must contain no credential, authentication material, or
  raw absolute local path.
- Finalized HTML must require no network request and must not contain review
  controls, queues, or session tokens.
- Local review services must bind only to loopback and serve only authorized
  report roots.

These are product requirements, not claims that later-gate implementations
already exist. Report suspected boundary failures even during development.
