# Release 1 authentication and future attendance boundaries

Release 1 issues a tenant-scoped staff account identified by `loginId`. A human administrator issues or resets a temporary password; the staff member must replace it at first login. Plaintext passwords are never persisted or returned. Deactivation and password reset invalidate existing tokens through `tokenVersion`.

Future Wi-Fi and trusted-device support must preserve these invariants:

- Connection to nursery Wi-Fi is only a risk signal, never proof of identity by itself.
- Any simplified login must combine a registered device, a valid session, `tokenVersion`, and risk-based reauthentication. An on-site QR challenge may be added later.
- Continuous GPS tracking is not a prerequisite.
- `Shift` remains the planned schedule. Future `Attendance` records actual clock-in/out events as separate data with human-reviewable audit history.

Release 1 does not add trusted-device records, Wi-Fi auto-login, refresh-token expansion, QR clock-in, location tracking, or an `Attendance` model.
