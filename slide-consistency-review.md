পর্যালোচনার ভিত্তি: commit `25a32494c97c2f57df59fe3102a5342bef82873b`। নিচের পুরোনো line number ওই commit-এর; নতুন implementation-এর references শেষে দেওয়া হয়েছে।

| Finding | অবস্থা / Severity | সঠিক source / function | মূল কারণ ও ছোট fix |
|---|---|---|---|
| মেনু, কার্ড ও heading-এর নাম আলাদা | CONFIRMED / Medium | `index.html:2140–2159` top-menu HTML; `2350–2369` home-card HTML; `2390, 2481, 2506, 2555, 2621, 2659, 2741, 2895, 2951, 2976, 3009, 3023, 3071, 3097, 3121` heading HTML। এখানে function নেই—static markup। বিশেষত `2146/2356/2555`: Slide 07; `2149/2359/2659`: Slide 10। | একই metadata তিন জায়গায় লেখা। `slides-config.js`-এর `SLIDES` ও `initializeSlideUI()` দিয়ে menu/card/title তৈরি করা হয়েছে। সক্রিয় নম্বর বদলানো হয়নি। 07 = EWO Gantt Chart; 10 = Chassis Analysis; 06 = EWO Detail & Feeding Analysis। |
| User Module ভুল/মৃত নামকেও permission column করে | CONFIRMED / Medium | `getDashboardSlideRegistry()` — `index.html:6633–6648`; `slidePermissionKey()` — `3683–3689`; `getUserPermissionKeys()` — `6649`; `loadSiteUsers()` — `6723`, heading তৈরি `6738–6741`। | DOM-এর home-card text প্রথম পছন্দ; menu/heading থেকে fallback; permission mapping আরেক জায়গায়। Registry ও permission lookup এখন `SLIDES` থেকে আসে। `admin_settings`, `user_admin` ও সব সক্রিয় `slide_N` key রাখা হয়েছে। |
| 02/09 placeholder; 04-ও একইভাবে সরানো হয়েছে | CONFIRMED / Medium | HTML: `index.html:2422–2437` (02), `2476` (04), `2644–2654` (logical 09, DOM `s8`); `goSlide()` — `3753`; `restoreActiveTab()` — `3796`; `renderSlide()` — `4820`; anonymous keyboard handler — `7444–7448`। | Report অন্য slide-এ সরেছে, কিন্তু পুরোনো panel/menu/paging রয়ে গেছে। Panel সরিয়ে logical 02/09 → 06, 04 → 10 redirect; destination permission যাচাই; pager/keyboard active permitted list ধরে চলে। Shared EWO popup/feeding helper রাখা হয়েছে; `renderS2()` (`5063`) ও `renderS8()` (`6195`) অনুপস্থিত পুরোনো panel-এর জন্য safe return করে। |
| Admin-এর tab count, chassis label ও modal label ছড়ানো | CONFIRMED / Low | HTML: `index.html:2848–2859`; `ADMIN_SETTING_NAMES` — `3245–3251` (constant, function নয়); `openAdminSetting()` — `3644`; `loadS4StrengthsFromSQL()` — `5393`, stale strings `5400/5409`; `s4StrengthChanged()` — `5419`, text `5424`; `renderS4StrengthSettings()` — `5427`, text `5430/5434`; `saveS4Strengths()` — `5448`, text `5449/5482`; `captureS4Image()` — `5501`, message `5528`; Gantt dialog HTML — `8365`। | ৫টি setting থাকলেও ৪টি লেখা; chassis-এর পুরোনো 04 label; modal-এ hardcoded 07। Count এখন `ADMIN_SETTING_NAMES` থেকে, chassis/admin/modal label `slideLabel()` থেকে আসে। Database table/RPC ও `slide4strength` internal setting key rename করা হয়নি। |
| Logical Slide 10 ব্যবহারকারীর chassis strength SQL read ব্যর্থ হতে পারে | CONFIRMED / Medium — live policy-তে `slide_10` অনুপস্থিত পাওয়া গেছে; fix ও SQL regression পাস | `supabase/migrations/20260929_slide4_chassis_strength.sql:29–37`, `slide4_chassis_strength_read` policy (function নয়); `loadS4StrengthsFromSQL()` — `index.html:5393–5413`; `goSlide()` — `3753–3756` আগে strength load logical 04-এ ছিল। | পুরোনো policy-তে `slide_4` আছে, `slide_10` নেই। নতুন migration `20261012093837_chassis_slide10_read_access.sql` live database-এ প্রয়োগ করা হয়েছে। Historical migration rewrite করা হয়নি। |

শেষ finding-এর প্রয়োগ করা SQL পরিবর্তনের সারাংশ (existing policy-এর predicate):

```diff
--- a/supabase/migrations/20260929_slide4_chassis_strength.sql
+++ b/supabase/migrations/20260929_slide4_chassis_strength.sql
@@
       and (lower(u.role::text)='admin'
         or coalesce(u.permissions ->> 'slide_4','false')='true'
+        or coalesce(u.permissions ->> 'slide_10','false')='true'
         or coalesce(u.permissions ->> 'admin_settings','false')='true'))
```

এই diff predicate-এর পরিবর্তন দেখায়। প্রয়োগ করা নতুন migration-এ `ALTER POLICY slide4_chassis_strength_read ... USING (...)` দিয়ে পুরো predicate আছে। Active user with only `slide_10`, active user without either permission, disabled user এবং admin দিয়ে live SQL read test পাস করেছে। পুরোনো `slide_4` read access রাখা হয়েছে; frontend redirect destination-এর `slide_10` permission চায়। পুরোনো `slide_2/slide_4/slide_9` permission থেকে নতুন report-এর permission স্বয়ংক্রিয়ভাবে দেওয়া হয়নি।

সব definition/reference-এর inventory: `slide-reference-inventory.txt`। প্রতিটি entry-তে original file ও exact line আছে; includes production HTML/JS/CSS, SQL policy/RPC identifiers, tests এবং historical comments। মূল জায়গাগুলো:

| জায়গা | পুরোনো source |
|---|---|
| Top menu number/title/route/permission attribute | `index.html:2138–2160` |
| Home card number/title/icon/route/description | `index.html:2348–2370` |
| Slide logical number বনাম internal DOM ID এবং headings/pager buttons | `index.html:2388–3130` |
| Legacy heading icons (CSS; report ID ধরে লেখা) | `index.html:1527–1537` |
| Admin tab 05 title/subtitle ও tab-count text | `index.html:2848–2859` |
| Admin modal/panel labels ও status/error messages | `ADMIN_SETTING_NAMES`, `openAdminSetting()`, `loadS4StrengthsFromSQL()`, `s4StrengthChanged()`, `renderS4StrengthSettings()`, `saveS4Strengths()`, `captureS4Image()` — finding table-এ exact lines |
| Permission key, DOM activation, persisted numeric tab, render dispatch | `slidePermissionKey():3683`, `canAccessSlide():3690`, `applySitePermissions():3694`, `goSlide():3753`, `restoreActiveTab():3796`, `renderSlide():4820` |
| User Module headings ও permission lists | `getDashboardSlideRegistry():6633`, `getUserPermissionKeys():6649`, `getMaxDashboardSlide():6653`, `addNewSiteUser():6663`, `loadSiteUsers():6723`, `saveSiteUser():6768` |
| Keyboard navigation ও Gantt dialog | anonymous handler `index.html:7444`; dialog HTML `8365` |
| External JS module slide references | `gantt-hover.js:1`, `gantt-action-calendars.js:1`, `order-execution-bridge.js:19/35/39/51`, `load-analysis-bridge.js:21`; these retain active module numbers |
| Database permissions/legacy identifiers | `supabase/migrations/20260929_slide4_chassis_strength.sql:1/35`, `20260926_size_set_module.sql:35`, `20260926_accessories_daily.sql:40/66`, `20260927_embellishment_send_receive.sql:53`, `supabase/order-bank-read-access.sql:8/12` |
| Embedded page context ও docs | `order-execution-plan.html:796`; `README.md:21` |

Compatibility:

- `goSlide(2)` / `goSlide(9)` → 06; `goSlide(4)` → 10; saved localStorage tab একই redirect পায়।
- Logical URLs: `#slide=2`, `#slide-9` → 06; `#slide=4` → 10।
- DOM anchors: `#s2`, `#s8` → 06; `#s4` → 10; `#s9` এখনও 10; `#s11` এখনও 07। কারণ legacy DOM ID logical slide number নয়।
- Supabase recovery/token hash-কে slide route হিসেবে ধরা হয় না। Redirect destination-এর access না থাকলে Home।
- 05 ও 08-এর actual report আছে; সেগুলো রাখা হয়েছে এবং config থেকে home-card পায়।
- Static card descriptions report metadata নয়; আগের descriptions রাখা হয়েছে। Upload / Data Control report-slide নয়; তার action-card রাখা হয়েছে।
- Historical CSS/comments, database names এবং calculation function names renumber করা হয়নি। এগুলো display label-এর source নয়।

পরীক্ষা: `python tests/slides-navigation.py` — offline Chromium-এ সব ১৮টি active config entry-এর menu/card/title/permission label, aliases, DOM anchors, saved tabs, destination authorization, pager/keyboard ও admin/modal labels পাস। সব external request intercept করা হয়েছে; production Supabase touch করা হয়নি। `node tests/line-popup.cjs`, `node tests/ewo-feeding.cjs`, `node tests/loading.cjs`, JS syntax ও `git diff --check` পাস।

Live verification: `slide4_chassis_strength_read` policy-তে `slide_10` যোগ হয়েছে। `tests/chassis-slide10-access.sql` দিয়ে authenticated role-এর অধীনে Slide 10 only, permission denied, disabled, admin, legacy Slide 04, admin_settings এবং anonymous access পরীক্ষা পাস করেছে। সব temporary fixture change rollback হয়েছে।
