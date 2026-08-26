# Capture and Remember persistence workflow

1. Ask for a visible library directory only on the first persistence request.
   Initialize it with `progressbrief library init --directory <path>
   --workspace <name> --kind <employer|personal> --project <name>`. Add
   `--repository <path>` only for a repository the user selected.
2. Resolve the active Workspace explicitly. Employer content defaults to
   internal; personal content defaults to private. Never Capture into an
   archived Workspace.
3. Classify the fragment as Worklog, Knowledge, or both. An outcome, decision,
   blocker, plan, or collaboration belongs in the Worklog. A durable technique,
   shortcut, caveat, or lesson belongs in Knowledge. Link both records when the
   fragment contains both.
4. Search Knowledge in only the active Workspace before writing. For a simple
   exact or new fragment, run `progressbrief memory capture --library <path>
   --workspace <id-or-slug> --text <fragment> [--date <YYYY-MM-DD>]`.
   Enrichment, related-note linkage, and supersession use the library API so the
   chosen target and action remain explicit.
5. Return the exact single-line acknowledgement. Do not start a report
   confirmation interview.
6. For “undo that,” run `progressbrief memory undo --library <path>
   --workspace <id-or-slug>` and return its acknowledgement.

Markdown Worklog and Knowledge files are authoritative. Configuration and the
mutation journal are small JSON machine-state files. Do not edit a generated
host copy of this skill.
