# High-Opus plan audit — video meetings and daily notes

You are the independent plan auditor. This is a read-only advisory pass requested explicitly by the owner before any
implementation worker is launched. Do not edit files, create tasks, write tests, launch other agents, or touch any
server/database. Work in `/home/dev/dev-projects/bcb-wt-video-meetings-jitsi-20260908`.

First run `grep -n "^## \\|^### " AGENTS.md`, then read the complete relevant sections: «Как решать, что делать»,
§1 taskdb/checklists, §2–§5, §10a–§10b, §12, §15–§17, §21–§22 and §24. Read
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` in full. Its section 2 is the full atomic owner acceptance scope; audit
every ID VM-01…VM-08, ACC-01…ACC-06, NOTE-01…NOTE-09, UI-01…UI-07 and GATE-01…GATE-04, not only this brief.

Owner direction to preserve exactly:

- quick MVP now on fully self-hosted Jitsi, P2P first, own coturn/JVB fallback, no foreign runtime services;
- exactly two people, no recording/transcription, minimal video/audio mute controls and no Jitsi branding;
- provider-neutral application boundary prepared for later PeerJS/native RTCPeerConnection + own signalling + coturn;
- secret guest link works without an account; authenticated patient may see only their permitted cabinet data;
- doctor live screen has video plus right-side tabs for notes and the existing encounter protocol;
- existing client notes become a full date-separated history: one editable note per date, today expanded, past dates
  collapsed by default to at most three visual lines with ellipsis, past dates can be expanded and edited, every edit
  autosaves with no manual save button, reopening anywhere the same day returns the same daily note;
- add only the named call entry buttons/pages/panels; do not redesign other UI;
- availability requires both the active built-in «Онлайн» branch/location and a configurable tariff entitlement;
  enable that entitlement for the owner's developer tariff through the existing tariff mechanism;
- orchestrator may use up to three parallel workstreams, workers do not write tests, independent auditor owns the
  blind behavior kill-set, then lead lands, validates and deploys to TEST. PROD is forbidden.

Inspect the actual repository before judging the plan. Use code-search before blind grep. In particular inspect the
existing doctor-notes append-only path, encounter write-path, Online branch gate, tariff entitlement mechanism,
notification channel resolver, current TEST/deploy topology, and current UI entry components named or discoverable
from the plan.

Return one binary verdict:

- `PASS` if the plan is executable, complete for owner scope, architecture-safe, correctly staged for parallel work,
  and its validation strategy follows repo test policy; or
- `MUST FIX` with a short numbered list. Every finding must name the reachable failure/impact, exact plan ID or repo
  rule it violates, and the concrete correction required before workers launch.

Do not report style preferences, speculative hardening, alternative product scope, or post-MVP ideas as findings.
Separate any non-blocking recommendation after the verdict. Pay special attention to hidden contradictions in P2P vs
JVB/TURN fallback, guest admission/Jitsi JWT, tariff seeding without grants in migrations, legacy-note backfill,
autosave concurrency, TEST DNS/firewall feasibility, and wave dependencies/file overlap.
