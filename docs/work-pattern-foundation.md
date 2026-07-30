# WorkPattern foundation (Sprint 2)

WorkPattern is a tenant-scoped master. `EARLY`, `NORMAL`, `LATE`, and `OFF` remain compatible with the existing `ShiftType` values. Existing `ShiftAssignment` rows with `workPatternId = NULL` continue to use `shiftType`.

## Current time calculation boundary

Sprint 2では`WorkPattern.breakMinutes`はマスター情報として保存・表示する。勤務時間集計は従来ロジックを維持する。

The existing generator allocation and monthly-hours algorithms are intentionally unchanged. System-pattern start/end times are supplied through the existing generator options, and generated assignments retain the corresponding nullable WorkPattern reference. This avoids introducing a second break deduction.

## Overnight work

現在は同日内勤務のみ対応する。`22:00`から翌`07:00`のような日付またぎ勤務は非対応。将来必要になった場合は、時刻の大小関係を暗黙に解釈せず、`crossesMidnight`等の明示フィールドを追加する。

## System patterns and defaults

- System codes and tenant ownership cannot be changed through the API.
- System patterns cannot be deactivated or deleted.
- `OFF` is always non-working, has no start/end time, and has zero break minutes.
- A default pattern must be active and working.
- Setting a default clears the previous default in the same transaction.
- Existing tenants receive missing system patterns idempotently. Existing master values are never overwritten by initialization.
