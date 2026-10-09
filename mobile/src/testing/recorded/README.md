# Recorded hub responses

These files are real responses from the hub code, captured on 2026-10-10. Tests use
them as their data, and `contract.test.ts` checks the types in `src/hub.ts` against them.

| File | Request (header `X-Role: patient`) |
|---|---|
| `schedule-today.json` | `GET /schedule/today?date=2026-10-10` |
| `schedule-tomorrow.json` | `GET /schedule/today?date=2026-10-11` |
| `medications-today.json` | `GET /medications/today` |
| `medications.json` | `GET /medications` |
| `patient.json` | `GET /patient` |
| `writes.json` | `POST /schedule/{id}/ack` and `POST /medications/logs/{id}`, accepted and rejected |

They came from one hub running the schedule router (`feature/05-schedule`), the
medications router (`feature/06-medications`) and the settings router (`main`) on
`main`'s schema and demo seed, plus Losartan (08:00, 20:00 daily) and Metformin
(06:30 on MO,WE,FR,SA) added through `POST /medications`.

`people.json` (`GET /people`) and `places.json` (`GET /places`) were captured the same
way from the people and places routers (`feature/03-people-and-places`) on the demo seed.
`contract.test.ts` checks the `Person` and `Place` types against them; the cache tests
still use the hand-written people in `fixtures.ts`.

To refresh a file once the routers are merged, start the hub and save the response,
for example:

    curl -H "X-Role: patient" "http://<hub>:8000/schedule/today?date=2026-10-10" > schedule-today.json

Several tests name items and times from these files (Lunch at 12:00, Losartan at 08:00),
so re-recording against different demo data means updating those expectations too.
