# Case-level evidence matrix

Actual และ status ดึงจาก [`browser-uat.json`](browser-uat.json) ของ run นี้เท่านั้น คำว่า `NOT_RUN` ในคอลัมน์ภาพหมายถึง runner ไม่ได้เก็บ screenshot ของ state เฉพาะนั้น จึงไม่ยืมภาพอื่นมาอ้างแทน

| Case ID | ขั้นตอนหลัก | Expected | Actual | Status | Screenshot evidence |
|---|---|---|---|---|---|
| UI-01 | home → keyboard tabs/theme/search | tab/theme/search ทำงานและไม่ล้น | ทำงานครบ, no overflow | PASS | [home-1440.png](home-1440.png) |
| UI-02 | catalog → filter/empty/reset/sort/back | URL/state/filter/sort ถูกต้อง | ทำงานครบ | PASS | [catalog-1440.png](catalog-1440.png) |
| UI-02b | abort catalog request → retry | แสดง error และ retry กลับมาได้ | error/retry ผ่าน | PASS | NOT_RUN: ไม่มีภาพ error state เฉพาะ |
| UI-03 | เลือก 3 package → compare → clear | limit/table/clear/assistant link ถูกต้อง | ผ่าน | PASS | [compare-1440.png](compare-1440.png) |
| UI-04 | package detail → booking; open invalid package | guest ถูกขอ account และ P99 เป็น 404 | ผ่าน | PASS | NOT_RUN |
| UI-05 | create account → reload | label/session คงอยู่ | ผ่าน | PASS | NOT_RUN |
| UI-06 | booking form → slot → request | request เป็น awaiting confirmation | ผ่าน | PASS | [book-1440.png](book-1440.png) |
| UI-07 | chat booking proposal → explicit request | proposal ไม่สร้าง booking เอง และไม่ duplicate | ผ่าน | PASS | [chat-preview-1440.png](chat-preview-1440.png) |
| UI-08 | failed reply → retry → sources | retry ไม่ซ้ำข้อความและ source แสดง | ผ่าน | PASS | NOT_RUN |
| UI-09 | upload → edit → checkbox confirm → reload | report ต้อง confirm ก่อนใช้และ source image โหลด | ผ่าน | PASS | [report-review-1440.png](report-review-1440.png) |
| UI-10 | organization form invalid → valid submit | validation และ inquiry สำเร็จ | ผ่าน | PASS | [organization-done-1440.png](organization-done-1440.png) |
| UI-11 | staff sign-in → inbox → organization ticket | staff เห็นรายละเอียด ticket | ผ่าน | PASS | [staff-overview-1440.png](staff-overview-1440.png) |
| UI-12 | take over → quote v1 → revise v2 | version และ total เปลี่ยนตาม revision | ผ่าน | PASS | [staff-quote-1440.png](staff-quote-1440.png) |
| UI-13 | confirm one → decline another | state/reason ถูกบันทึก | ผ่าน | PASS | [staff-appointments-1440.png](staff-appointments-1440.png) |
| UI-14 | customer notifications → calendar/quote/PDF | event/history/เอกสารล่าสุดแสดง | ผ่าน | PASS | [notifications-1440.png](notifications-1440.png) |
| UI-15 | simulated PromptPay → signed success | payment เป็น simulation และ paid state คงอยู่ | ผ่าน | PASS | [payment-simulator-1440.png](payment-simulator-1440.png) |
| UI-16 | customer handoff → staff takeover → staff reply | customer ได้ reply, assistant paused | ผ่าน | PASS | [staff-inbox-1440.png](staff-inbox-1440.png) |
| UI-17 | manager price edit → public catalog; branch staff | ราคาเผยหลัง save, manager controls ไม่รั่ว | ผ่าน | PASS | NOT_RUN: ไม่มีภาพหลัง price edit เฉพาะ |
| UI-18 | LINE simulator enqueue → worker | delivery ถูกบันทึกเป็น simulated | ผ่าน | PASS | [channels-1440.png](channels-1440.png) |
| UI-28 | provider save → masked key | key ไม่ถูกส่งกลับ/แสดงเต็ม | ผ่าน | PASS | [ai-providers-1440.png](ai-providers-1440.png) |
| UI-23 | dashboard → capacity/roles/audit | metrics/settings/audit สอดคล้อง | ผ่าน | PASS | [staff-audit-1440.png](staff-audit-1440.png) |
| UI-25 | customers/payment filters → history dialog | list/scope/history/payment state ถูกต้อง | ผ่าน | PASS | [staff-customers-1440.png](staff-customers-1440.png), [staff-payments-1440.png](staff-payments-1440.png) |
| UI-24 | public package → assistant dock → booking | dock aware และ shortcut prefill ถูกต้อง | ผ่าน | PASS | [dock-1440.png](dock-1440.png) |
| UI-19 | customer staff API → staff URL without auth | customer ได้ 403 และ staff sign-in prompt | ผ่าน | PASS | NOT_RUN |
| UI-20 | tab/focus → menu/dialog → Escape | focus visible และ dialog ปิด | ผ่าน | PASS | NOT_RUN |
| UI-26 | Free report → Plus simulated payment → trend/print | plan gates และ report comparison ถูกต้อง | ผ่าน | PASS | [labs-free-1440.png](labs-free-1440.png), [labs-plus-1440.png](labs-plus-1440.png), [lab-report-1440.png](lab-report-1440.png) |
| UI-27 | deck/search/dropdown → lab reports | navigation/search และ page content ถูกต้อง | ผ่าน | PASS | [search-dialog-1440.png](search-dialog-1440.png), [lab-reports-1440.png](lab-reports-1440.png) |
| UI-29 | typed demo sign-in admin/test-02 | admin route/Plus entitlement ถูกต้อง; accounts ไม่ถูก list | ผ่าน | PASS | [signin-1440.png](signin-1440.png) |
| UI-30 | attach report → send → confirm values → explain | draft ไม่ถูกใช้ก่อน confirm และ answer once | ผ่าน | PASS | [chat-report-card-1440.png](chat-report-card-1440.png), [chat-report-answer-1440.png](chat-report-answer-1440.png) |
| UI-31 | new project/chat → rename/switch → mobile drawer | chat isolation, rename และ drawer ถูกต้อง | ผ่าน | PASS | [chats-1440.png](chats-1440.png), [chats-390.png](chats-390.png) |
| UI-32 | header sign-in/menu/sign-out → AI agents | journey/header/agent controls แสดง | ผ่าน | PASS | [header-menu-1440.png](header-menu-1440.png), [ai-agents-1440.png](ai-agents-1440.png) |
| UI-33 | guest upload/send → reload/close/signup | guest token/chat/image ไม่กลายเป็น history | ผ่าน | PASS | [guest-temporary-1440.png](guest-temporary-1440.png) |
| UI-34 | delayed view → booking → sign-in → staff URL | latest view ชนะ, fields คงอยู่, customer ไม่เห็น staff inbox | ผ่าน | PASS | NOT_RUN |
| UI-21-tablet | 768px pages/nav/filter/app | no overflow และ controls ใช้งานได้ | ผ่าน | PASS | [home-768.png](home-768.png), [catalog-filters-768.png](catalog-filters-768.png), [app-768.png](app-768.png) |
| UI-21-mobile | 390px pages/nav/filter/app | no overflow และ drawer/filter ใช้งานได้ | ผ่าน | PASS | [home-390.png](home-390.png), [catalog-filters-390.png](catalog-filters-390.png), [app-390.png](app-390.png) |
| UI-22 | inspect pageerror/console error list | ไม่มี uncaught browser JS error | `errors=[]` | PASS | NOT_RUN: เป็น aggregate assertion |

## Focused GL-03 API evidence

| Check | Expected | Actual | Status |
|---|---|---|---|
| `test_handoff_binds_exact_chat_and_stale_staff_mutations_fail_closed` | ticket stores exact `chat_id`; archive lookup never follows active chat; stale version/assignment returns 409; missing binding returns 404 | assertion ผ่านใน focused pytest run | PASS |
| `test_staff_requires_role_and_takeover` | customer cannot staff API; take over then staff reply works | assertion ผ่าน | PASS |
| `test_staff_takeover_discards_inflight_model` | late model result is discarded after version/mode change | assertion ผ่าน | PASS |

Focused command: `.venv\Scripts\python.exe -m pytest -q tests/test_business_v3.py tests/test_chat_features.py tests/test_business_full.py`  
Result: `91 passed, 1 warning` (exit code 0), rerun after final GL-03 patch.
