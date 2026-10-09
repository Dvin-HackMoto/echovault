# MODULE: Backup and Restore

Owner: TBD

Goal:
Let a caregiver export all records and photos to one file and restore them on a replaced or reset hub.

Features:
- Export database and photos as a zip
- Import and replace
- Optional password protection

Tasks:
- [x] BKP-1 Export
- [x] BKP-2 Import

Dependencies:
- Hub Foundation
- Auth and Access Control

Definition of Done:
- An exported zip restored on an empty hub reproduces the same records and photos
- Import cannot happen without an explicit confirmation

## BKP-1

MODULE FROM: Backup and Restore
Task: Export
Owner: N/A
Goal: Fill in `features/backup/router.py` with `GET /backup/export` returning a zip of `echovault.db` and `photos/`.
Priority: P2
Dependencies: HUB-4
Acceptance Criteria:
- [x] The zip contains a consistent copy of the database and every photo
- [x] The file name includes the export date
- [x] Caregiver only
- [ ] Optional password protection, if time allows
Status: DONE

## BKP-2

MODULE FROM: Backup and Restore
Task: Import
Owner: N/A
Goal: Add `POST /backup/import` that replaces the database and photos after confirmation, then re-runs `migrate()`.
Priority: P2
Dependencies: BKP-1
Acceptance Criteria:
- [x] The request must carry an explicit confirmation or it is rejected
- [x] A file that is not a valid EchoVault backup is rejected and the current data is untouched
- [x] The previous database is kept as a copy until the import succeeds
- [x] The hub serves the restored data without a restart
Status: DONE
