# Live Studio agent review

VS-017 connects the policy-controlled MCP gateway to the current Studio project session without giving the agent any new authority.

## Data flow

```text
Canvas / Source Sync live session
  -> @afrodite/project-session snapshot subscriber
  -> StudioCollaborationBridge
  -> POST /api/session/publish
  -> .afrodite/collaboration.json
  -> agent read-only document provider
  -> semantic dry run
  -> POST /api/review/submit
  -> Studio Human Review Inbox
```

The project bridge stores one current live session and up to 500 review records. File updates use a temporary sibling file followed by rename.

## Live session identity

Studio keeps a browser-session collaboration ID and publishes:

```json
{
  "sessionId": "...",
  "revision": 12,
  "document": { "schemaVersion": 1 }
}
```

Project bridge derives `documentVersion` with the same deterministic semantic document hash used by `@afrodite/semantic-ops`.

For the same `sessionId`, a revision lower than the stored revision is rejected. Publishing another browser session is allowed and replaces the active snapshot because there is currently one active Studio owner rather than a multi-user merge model.

## Review request validation

Project bridge accepts an agent review request only when:

- a live Studio session exists;
- the semantic plan was produced by the gateway process requesting review;
- the plan document version equals the current live document version;
- the request passes the shared protocol schema;
- the request ID is new or is an idempotent repeat of the stored request.

The persisted record contains the typed command, `documentAfter`, exact source diffs, diagnostics, verification requirements, actor, agent session, timestamps, rationale, and later human decision.

## Human decision boundary

Studio can choose:

```text
approved
rejected
```

Project bridge rejects decisions for expired requests, already decided requests, or requests whose document version no longer matches the live session.

The decision endpoint does not call verified-write. Approval records intent only.

After approval, Studio may separately:

- load the exact reviewed `documentAfter` into Studio;
- apply one exact source plan through `/api/patch/apply`;
- leave either effect unapplied.

Loading `documentAfter` currently persists it to Studio storage and reloads the page, which starts a new command history. Source application retains compare-and-swap checks, verification, and rollback.

## Agent boundary

The MCP surface remains:

```text
afrodite_list_semantic_operations
afrodite_inspect_policy
afrodite_inspect_document
afrodite_plan_semantic_operation
afrodite_request_human_approval
afrodite_get_approval_request
```

There is no agent-facing endpoint or tool for:

```text
approve
reject
apply_patch
apply_transaction
write_file
shell
commit
merge
```

The gateway client used by MCP contains live-document read, semantic-plan, review-submit, and review-status methods only.

## Persistence and expiry

Collaboration records survive Studio and gateway restarts in:

```text
<project-root>/.afrodite/collaboration.json
```

This file contains the full Semantic UI IR and exact review diffs. Project bridge creates the directory with mode `0700` and replacement files with mode `0600` on POSIX systems. Add the following rule to the target application's `.gitignore` so local review data is not committed:

```gitignore
.afrodite/
```

On Windows, filesystem ACLs remain controlled by the current user and host configuration rather than POSIX mode bits.

Pending review records become `expired` after their request expiry time. Source plans have their own project-bridge TTL and may expire earlier or later independently. Persisting a review does not persist executable text edits outside the existing server plan store and does not extend source-plan lifetime.

## Current limits

- one active Studio snapshot is stored;
- no CRDT or concurrent editor merge exists;
- custom bridge URLs are configured separately by each Studio workbench;
- decisions are authenticated by the local bridge token, not signed user identities;
- source plans are not reconstructed from persisted review diffs;
- approved UI IR reload starts a new command history;
- crash-safe journaling beyond atomic JSON-file replacement is deferred.
