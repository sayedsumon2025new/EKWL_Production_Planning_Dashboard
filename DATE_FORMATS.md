# CSV and SQL date formats

CONFIRMED / High: before the fixes, csvDate (index.html:7017) returned NULL for named-month dates, and uploadNewPlan (index.html:7091) inserted them without error. The exact original Seq 6 CSV verifies this cause; see SLIDE06_DATA_REVIEW.md.

CONFIRMED / Medium: old ewo_readiness_date (supabase/migrations/20261014020815_ewo_readiness_board.sql:18) supported ISO and abbreviated day-month-year only. Its replacement delegates to dashboard_parse_date (supabase/migrations/20261014032704_flexible_date_parser.sql:2), with the same rules as csvDate. Both preserve written calendar date, and do not convert timezones.

Supported examples: 2026-10-14, 2026/10/14, 2026.10.14, 20261014; 14-Oct-26, 14/October/2026, 14 October 2026, October 14, 2026; unambiguous 14/10/2026, 10/14/2026, 14.10.2026; strict ISO timestamps with optional seconds/fraction (up to 6 digits) and timezone. Two-digit years mean 2000–2099. All dates require a supplied year; invalid calendar days return NULL.

Ambiguous numeric dates such as 03/04/2026 return NULL in auto mode. The order argument can explicitly choose dmy or mdy. No preference reply was received during implementation, so auto mode uses the first offered option: reject ambiguity. Existing Planning daily headers with MM/DD/YYYY retain their documented mdy convention in rawHeaderDate (index.html:7051). Other daily header formats use auto mode. parseRawPlanFile (index.html:7068) rejects invalid date headers, duplicate normalized daily dates and non-empty invalid/ambiguous milestone values before database writes.

Excel serials require explicit excel mode; they are not guessed from numeric text. Serial 60 is rejected because 1900-02-29 does not exist. Fractional serials use the date part. These are 1900-system serials; 1904-workbook serials are not inferred.

SQL examples:

```sql
select public.dashboard_parse_date('14 October 2026');
select public.dashboard_parse_date('03/04/2026','dmy');
select public.dashboard_parse_date('46309','excel');
```

Typed SQL DATE columns receive normalized ISO dates from Planning uploadNewPlan. The generic SQL helper is available to authenticated callers; its existing readiness wrapper retains prior privileges. No table, RLS policy or stored source date is changed by this parser migration. On the user's explicit request, the broken Seq 6/P06 SQL upload and its cascading plan_records/plan_daily data were permanently deleted. All three remaining counts were verified as zero. The source repair is superseded; re-upload is now the chosen recovery path.

Verification: tests/date-parser.cjs passes 52 JS cases and generates identical PostgreSQL assertions; all cases pass under SQL/DMY and ISO/MDY DateStyle in isolated PostgreSQL 17.6. Actual uploaded CSV passes 5,500 rows / 22,000 milestones / 18 daily columns. Loading, feeding and Chromium navigation/upload regressions pass; production helper queries verify all main formats. Minimal frontend diff: flexible-date-parser.patch; SQL change is the small new migration above.

## Planning upload convention chosen by the user

The user explicitly chose MM/DD/YYYY for all dates on re-upload. planningCsvDate (index.html:7052) uses explicit mdy mode for four-digit-year slash dates, including 10/11/2026 = 11 October 2026. parseRawPlanFile validates through this helper, and uploadNewPlan serializes the same normalized values into SQL DATE columns. Generic csvDate and dashboard_parse_date still reject ambiguity in auto mode. Tests verify 03/04/2026 = 4 March in Planning upload, 10/14/2026, invalid days and a complete sample upload.

## Two-digit slash years

CONFIRMED / Medium: the newly supplied CSV contains PSD 10/05/26 on record 2. planningCsvDate (index.html:7052) originally selected explicit mdy mode only for four-digit slash years; the two-digit date fell through to generic auto mode and was rejected as ambiguous. Minimal fix: recognize two- or four-digit slash years in both planningCsvDate and rawHeaderDate (index.html:7051), keeping validation and serialization aligned. Both MM/DD/YY and MM/DD/YYYY now use the user-selected mdy convention. Two-digit years retain the documented 2000–2099 mapping. No SQL helper change is necessary: dashboard_parse_date already accepts explicit mdy with two-digit years.

Actual new CSV validation passed all 5,500 rows, 22,000 milestone dates and 18 daily columns. All 22,000 dates equal the original named-month CSV dates after normalization; 10/05/26 means 5 October 2026. Regression tests cover ambiguous two-digit dates and invalid calendar days. Minimal patch: planning-mdy-short-year.patch. No production records were inserted as part of this fix; user will re-upload the CSV.
