# Preserve report content during export except for operational secrets

Ordinary export will preserve the report's selected internal or private content rather than proactively creating a sanitized copy. Broader redaction or rewriting occurs only when the user explicitly requests it, while credentials, access tokens, authentication material, and raw absolute local paths are always excluded because they are operational secrets or machine details rather than useful report content.
