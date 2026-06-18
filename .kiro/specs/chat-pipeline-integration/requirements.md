# Requirements Document

Chat Pipeline Integration

## Introduction

The Campus Recovery Hub chat assistant currently behaves as a standalone LLM conversation. It forwards user messages to the NVIDIA model and renders the reply, but it never persists reports to the in-memory store (`/api/items`) and never runs the real matching engine (`/api/match`). As a result:

- The assistant can claim it "checked the database" and "found a match" even when only a single lost item was described and no found item exists — the response is hallucinated, not grounded in data.
- The Admin Dashboard counters (Recovered / Active / Resolved) never change, because no items ever reach the store and the dashboard only fetches once on mount.

This spec defines the behavior needed to ground the assistant in the existing intake → store → match pipeline and to keep the dashboard in sync with real data.

## Glossary

- **Report**: A structured lost or found item record conforming to the `Item` type.
- **Intake**: The step that extracts structured fields from a user's natural-language message.
- **Match**: A scored comparison between a new report and existing opposite-type reports, produced by `lib/matching.ts`.
- **Store**: The server-side in-memory singleton in `lib/store.ts`.

## Requirements

### Requirement 1: Ground assistant replies in real data

**User Story:** As a student reporting a lost item, I want the assistant to only tell me about matches that actually exist, so that I am not misled by a fabricated result.

#### Acceptance Criteria

1. WHEN the user describes a lost or found item THEN the system SHALL extract a structured report (item name, category, color, brand, description, location, date, type) before producing a match statement.
2. WHEN a report is captured THEN the system SHALL persist it to the store via the items API before reporting any match outcome.
3. WHEN the system reports match results THEN it SHALL use only the output of the matching engine run against the opposite item type in the store.
4. IF no opposite-type items exist in the store THEN the system SHALL clearly state that no match has been found yet and that the report has been logged.
5. The system SHALL NOT invent match details, owner names, recovery instructions, or claims of having searched a database when no search was performed.

### Requirement 2: Honest no-match messaging

**User Story:** As a user whose item has no match yet, I want a clear and reassuring "no match found, report logged" message, so that I understand the current state.

#### Acceptance Criteria

1. WHEN the matching engine returns zero candidates THEN the system SHALL inform the user that no matching item has been reported yet and that their report is safely logged.
2. WHEN the matching engine returns candidates below the confidence threshold THEN the system SHALL treat the result as no confident match rather than presenting a low-confidence item as a found match.
3. WHEN at least one candidate meets the confidence threshold THEN the system SHALL present the candidate(s) with their match score and reasoning.

### Requirement 3: Use the canonical assistant prompt

**User Story:** As a maintainer, I want the chat to use the shared `RECOVERY_ASSISTANT_PROMPT`, so that assistant behavior is consistent and controlled from one place.

#### Acceptance Criteria

1. WHEN the chat issues a request to the model THEN the system SHALL use the `RECOVERY_ASSISTANT_PROMPT` defined in `lib/prompts.ts` instead of an inline hardcoded prompt.
2. WHEN the prompt is updated in `lib/prompts.ts` THEN the chat behavior SHALL reflect the change without edits to the component.

### Requirement 4: Live dashboard counts

**User Story:** As an admin viewing the dashboard, I want the Recovered / Active / Resolved counters to reflect the current store, so that the analytics are accurate after new reports are filed.

#### Acceptance Criteria

1. WHEN a new report is added to the store THEN the dashboard SHALL be able to reflect the updated counts without a full page reload.
2. WHEN the dashboard loads THEN it SHALL compute Recovered from items with status `RESOLVED`, Active from items with status `ACTIVE`, and resolution rate from the ratio of resolved to total items.
3. WHEN no items exist THEN the dashboard SHALL display zero counts and a 0% resolution rate without error.
4. WHEN items carry a missing or undefined `category` THEN the category chart SHALL render without throwing.

### Requirement 5: Default report status and integrity

**User Story:** As the system, I want every new report to have valid default fields, so that downstream matching and analytics behave correctly.

#### Acceptance Criteria

1. WHEN a report is persisted without an explicit status THEN the system SHALL default its status to `ACTIVE`.
2. WHEN a report is persisted THEN the system SHALL ensure required identity fields (`id`, `createdAt`, `type`) are present.
3. IF a report is missing a `category` THEN the system SHALL assign `Other` rather than leaving it undefined.

### Requirement 6: Ownership verification (hidden attributes)

**User Story:** As someone reporting an item, I want to set a private verification question and answer that only the true owner would know, so that found items can be returned safely to the rightful owner.

This is the "hidden feature" ported in concept from the atlas reference repo (`hiddenAttributes` + `evaluateClaimAnswer`), mapped onto this project's existing `privateAttributes`, `VERIFICATION_AGENT_PROMPT`, and the stubbed `/api/verify` and `/api/evaluate` routes.

#### Acceptance Criteria

1. WHEN a report is created THEN the system SHALL allow capturing one or more private verification details (e.g., a question and its expected answer) stored in `privateAttributes`.
2. WHEN a claimant attempts to claim a found item THEN the system SHALL present the verification question(s) without revealing the expected answer.
3. WHEN a claimant submits an answer THEN the system SHALL evaluate it against the stored expected answer using a tolerant comparison (case-insensitive, trimmed, substring-aware) and return a pass/fail (or confidence) result.
4. WHEN verification passes THEN the system SHALL transition the item's status toward resolved/returned (`RESOLVED`).
5. WHEN verification fails THEN the system SHALL NOT change the item status and SHALL allow a retry.
6. The system SHALL never expose `privateAttributes` (expected answers) through any public listing or aggregate view.

### Requirement 7: Privacy-friendly aggregate display

**User Story:** As a visitor to the dashboard, I want to see how many items are lost, found, and resolved — summarized by type (e.g., "Lost: 3 phones, 2 laptops") — without seeing anyone's full item details, so that the board is useful and respects privacy.

#### Acceptance Criteria

1. WHEN the dashboard renders THEN the system SHALL display counts grouped by status (Lost / Found / Resolved-Returned) and by item category or item-name bucket.
2. The aggregate view SHALL show only a label and a count (e.g., "Lost Phone × 3"), never descriptions, reporter identity, locations, or private attributes.
3. WHEN no items exist in a group THEN that group SHALL render as empty/zero without error.
4. WHEN a new item is reported or an item is resolved THEN the aggregate counts SHALL update consistently with Requirement 4's live-refresh behavior.

### Requirement 8: Advanced, presentation-ready UI

**User Story:** As a presenter at the hackathon, I want a clean, modern, polished interface that makes a strong first impression, so that the demo feels professional while staying simple to use.

#### Acceptance Criteria

1. The UI SHALL present a cohesive modern visual style (consistent spacing, typography, color, depth) across the chat, dashboard, and aggregate views.
2. The UI SHALL remain simple and uncluttered — visual polish SHALL NOT obscure the core flows (report, match, verify, view counts).
3. The UI SHALL be responsive enough to present cleanly on a typical laptop/projector resolution.
4. Visual enhancements SHALL NOT break existing functionality or the grounded-match and live-count behaviors defined above.
