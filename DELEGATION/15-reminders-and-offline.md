# MODULE: Reminders and Offline

Owner: TBD

Goal:
Keep reminders firing and the essential screens readable when the hub is off or out of range.

Features:
- Local notifications for schedule and medications
- Cached home, schedule and people
- Queued patient actions

Tasks:
- [ ] REM-1 Local reminders
- [ ] REM-2 Offline cache
- [ ] REM-3 Queued actions

Dependencies:
- Mobile Foundation
- Schedule
- Medications

Definition of Done:
- A reminder fires on the phone with the hub switched off
- With the hub unreachable, the patient still sees home, schedule and people
- Responses made offline reach the hub once it is back

## REM-1

MODULE FROM: Reminders and Offline
Task: Local reminders
Owner: N/A
Goal: Fill in `src/reminders.ts` and the `ReminderBanner` component: on app open and every 30 minutes, fetch today's schedule and medication times and schedule local notifications for the next 24 hours.
Priority: P1
Dependencies: MOB-6, SCH-2, MED-1
Acceptance Criteria:
- [ ] Notifications fire at `starts_at − remind_before_min` and at each dose time
- [ ] Old notifications are cancelled before new ones are scheduled, so none are duplicated
- [ ] A reminder fires with the hub off
- [ ] Okay and Later post `acknowledged` and `snoozed`
Status: TODO

## REM-2

MODULE FROM: Reminders and Offline
Task: Offline cache
Owner: N/A
Goal: Fill in `src/cache.ts` to keep the last-fetched schedule, people and profile in AsyncStorage and serve them when the hub is unreachable.
Priority: P1
Dependencies: MOB-6
Acceptance Criteria:
- [ ] Home, Schedule and People render from the cache with the hub off
- [ ] Cached screens show that the information may not be current
- [ ] The cache refreshes on every successful fetch
Status: TODO

## REM-3

MODULE FROM: Reminders and Offline
Task: Queued actions
Owner: N/A
Goal: Queue reminder acknowledgements and medication confirmations in AsyncStorage when the hub is unreachable and send them when it returns.
Priority: P2
Dependencies: REM-1, SCH-3, MED-3
Acceptance Criteria:
- [ ] An action taken offline is stored and survives an app restart
- [ ] Queued actions are sent in order when the hub is reachable again
- [ ] A queued action is sent once and then removed
Status: TODO
