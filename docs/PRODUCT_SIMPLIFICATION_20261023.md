# Reid product simplification — 2026-10-23

## Product direction

Reid now focuses on the company workflow: Home, projects, clients, WhatsApp, the company team, and requests. The assistant, settings, connections, and system monitoring remain supporting tools. This release does not add another operational module.

## What changed

- Research, workshops, general forms, and the live meeting bot are retired from navigation and runtime routes.
- Their exclusive records and storage buckets are removed by `202610230001_product_simplification.sql`. Project-linked tasks are preserved; research-only tasks are deleted.
- Project pages expose four sections only: Overview, Tasks, Files, and Activity. Milestones, KPIs, and manual project meetings remain available inside Overview.
- The public homepage has a Company Achievements section. COR is presented there with a generated concept image and an accurate summary that does not claim diagnosis, treatment, or completed clinical validation.
- The existing COR project receives the same Arabic overview only when its description is currently empty.

## Release order

1. Take and verify an encrypted database and storage backup outside the repository.
2. Deploy the web, API, and Edge Function changes from this release so no runtime path queries retired tables.
3. Apply `202610230001_product_simplification.sql` to the reviewed target.
4. Verify projects, tasks, files, clients, requests, WhatsApp, and team access with owner and employee accounts.
5. Keep the recovery copy for seven days after production verification, then remove it under the normal backup procedure.

The generated COR image is a visual concept, not evidence that the physical kiosk or medical validation is complete.
