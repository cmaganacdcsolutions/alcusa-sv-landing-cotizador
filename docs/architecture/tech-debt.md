# Tech debt register

| Item | Impact | Trigger to revisit |
|---|---|---|
| No order database; Wompi webhook only verifies+logs, no persistence | Reconciliation of paid orders relies on manual cross-check between WhatsApp thread and Wompi dashboard | >20 paid orders/week, or first missed-reconciliation incident |
| Wompi OAuth token endpoint/grant unconfirmed against live docs (only public docs.wompi.sv reviewed, no sandbox creds yet) | `wompi-create-link.php` auth call may need a small fix once real credentials arrive | Immediately on receiving sandbox credentials — verify before first live test |
| Single-contributor `dev`-only branching, no PR review gate | Lower review coverage on day-to-day commits; architecture review substitutes at promotion to `main` | A second concurrent contributor joins |
| Hostinger plan/PHP/`.htaccess` support unconfirmed | ADR-002 assumes shared hosting capabilities that are not yet verified | Before the deploy slice — confirm plan details with client |
| Years-in-business, customer-count stat, Bronce surcharge, transport-fee-per-order assumption, and other `prototype-spec.md` §4 open questions | Some landing copy/pricing ships with placeholders or an assumption (transport charged once per order) | Client answers open questions (§4) — update `content/catalog.ts` / `pricingTables.ts` accordingly |
