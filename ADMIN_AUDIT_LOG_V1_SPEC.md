# Admin Audit Log v1 Spec (Admin Only)

## 1) เป้าหมายรอบนี้

สรุปสเปก `Admin Audit Log` ให้พร้อมเริ่มทำทันทีในรอบถัดไป โดยอ้างอิง UX จากตัวอย่างตาราง (Time, Actor, Action, Entity, Summary) และข้อกำหนดล่าสุดของ Settings UI

## 2) Decisions (Locked)

1. **ตำแหน่ง UI**
   - เพิ่มแท็บใหม่ชื่อ `Audit Log` ในหน้า `Settings` ระดับเดียวกับ `Users & Access`, `Brands`, `Table Display`, ...
   - URL: `/app/settings?tab=audit-log`

2. **สิทธิ์การเข้าถึง**
   - แสดงเฉพาะผู้ใช้ที่มี role `admin`
   - Non-admin:
     - Frontend: redirect กลับ `/app`
     - Backend API: ตอบ `403 Forbidden`

3. **รูปแบบตาราง**
   - คอลัมน์: `Time | Actor | Action | Entity | Summary`
   - ด้านบนมี search box: ค้นจาก `actor/action/entity/summary`
   - เรียงข้อมูลล่าสุดก่อนเสมอ (`createdAt DESC`)

4. **การแสดงเวลา**
   - เก็บเวลาใน DB เป็น UTC
   - แสดงผลด้วย timezone ระบบ `Asia/Vientiane` เสมอ
   - รูปแบบแนะนำ: `Apr 20, 2026, 9:58 AM` (อ่านง่าย)

5. **ID handling**
   - หน้า list ไม่โชว์ long id/code เป็นค่า default
   - ถ้าต้องดูเพิ่ม ใช้ drawer/modal แสดงรายละเอียด (`entityId`, diff, metadata)

6. **Performance**
   - รองรับ pagination/limit: ค่า default `50` ต่อหน้า
   - รองรับ limit แบบ whitelist: `20 | 50 | 100`

7. **v1 Feature Scope**
   - เริ่มจาก `search + pagination` ก่อน
   - ยังไม่ใส่ filter แยกวันที่/actor/action/entity ใน UI v1 (เก็บไว้ v1.1)

8. **Retention (ล็อกเพื่อเริ่มทำได้เลย)**
   - เก็บย้อนหลัง `180 วัน` สำหรับ v1
   - ผ่าน scheduled cleanup job (daily) ใน backend

## 3) Data Model (v1)

ตารางใหม่: `admin_audit_logs`

- `id` (string/cuid)
- `created_at` (datetime(3), UTC)
- `actor_user_id` (string, nullable)
- `actor_name_snapshot` (string, nullable)
- `actor_email_snapshot` (string, nullable)
- `action_key` (string) — เช่น `USER_CREATED`, `REPORT_APPROVED`
- `entity_type` (string enum-like) — `USER | BRAND | REPORT | CONTENT`
- `entity_id` (string, nullable)
- `entity_label` (string, nullable) — เช่นชื่อ user/brand/month label สำหรับแสดงผล
- `summary` (string) — ข้อความสั้นในคอลัมน์ Summary
- `metadata_json` (json, nullable) — before/after, changedFields, note

Index แนะนำ:

- `(created_at DESC)`
- `(entity_type, created_at DESC)`
- `(actor_user_id, created_at DESC)`
- `(action_key, created_at DESC)`
- Full-text หรือ fallback LIKE บน field ที่ใช้ค้นหา (actor/action/entity/summary)

## 4) Event Catalog (v1)

### USER

- `USER_CREATED`
- `USER_UPDATED`
- `USER_DELETED`
- `USER_STATUS_CHANGED`
- `USER_SIGNIN_METHOD_CHANGED`

### BRAND

- `BRAND_CREATED`
- `BRAND_UPDATED`
- `BRAND_DELETED`
- `BRAND_STATUS_CHANGED`
- `BRAND_RESPONSIBLE_USERS_CHANGED`

### REPORT

- `REPORT_SUBMITTED`
- `REPORT_APPROVED`
- `REPORT_REJECTED`
- `REPORT_REOPENED`
- `REPORT_REVISED`

### CONTENT

- `CONTENT_TOP_CONTENT_UPDATED`
- `CONTENT_COMPETITOR_EVIDENCE_UPDATED`
- `CONTENT_QUESTION_HIGHLIGHTS_UPDATED`

## 5) Hook Points ในโค้ดปัจจุบัน

Backend (write log):

- `apps/backend/src/modules/users/users.service.ts`
  - `createUser`, `updateUser`, `deleteUser`
- `apps/backend/src/modules/brands/brands.service.ts`
  - `createBrand`, `updateBrand`, `deleteBrand`
- `apps/backend/src/modules/reporting/reporting.service.ts`
  - submit/approve/reject/reopen/revise (จุดเดิมที่เขียน report activity log)
- `apps/backend/src/modules/top-content/top-content.service.ts`
  - `updateCard`
- `apps/backend/src/modules/competitors/competitors.service.ts`
  - `saveMonitoring`
- `apps/backend/src/modules/questions/questions.service.ts`
  - `saveHighlights`

Frontend (read/list UI):

- `apps/frontend/src/app/app/settings/page.tsx`
  - เพิ่ม `audit-log` tab และโหลดข้อมูล
- เพิ่ม component ใหม่ เช่น
  - `apps/frontend/src/app/app/settings/audit-log-manager.tsx`
- เพิ่ม API client ใน
  - `apps/frontend/src/lib/reporting-api.ts`

## 6) API Contract (v1)

### GET `/admin/audit-logs`

Query:

- `q` (optional string)
- `page` (default `1`)
- `limit` (default `50`, allowed `20|50|100`)

Response:

- `items[]`:
  - `id`
  - `time` (ISO UTC)
  - `actor` `{ userId, name, email }`
  - `action` `{ key, label }`
  - `entity` `{ type, id, label }`
  - `summary`
- `pagination`:
  - `page`
  - `limit`
  - `total`
  - `totalPages`

Rules:

- sort ล่าสุดก่อน
- search ต้อง match `actor/action/entity/summary`
- role ไม่ใช่ admin => `403`

## 7) Summary Format Guideline

ตัวอย่าง Summary ให้สั้น อ่านเร็ว:

- `Created user "Jane Doe" (content).`
- `Changed sign-in method for "john@brand.com" to Microsoft + Password.`
- `Updated responsible users for "Demo Brand" (+2, -1).`
- `Submitted report Apr 2026 (v3).`
- `Updated Top Content screenshot for slot Top Views #1.`

## 8) Acceptance Criteria (Pass/Fail)

1. ผู้ใช้ non-admin เปิดหน้า Audit Log ไม่ได้
2. ผู้ใช้ admin เห็นหน้า Audit Log พร้อม search และตารางได้
3. เมื่อทำ action สำคัญในระบบ จะมี log ใหม่ขึ้นในตารางภายใน 1 refresh
4. search ค้น actor/action/entity/summary แล้วผลลัพธ์ตรง
5. เวลาแสดงผลเป็น timezone `Asia/Vientiane`
6. หน้า list ไม่โชว์ brand code/id ยาวเป็น default
7. หน้าแรกโหลดได้ลื่นในสภาพใช้งานจริง (ไม่ค้าง/ไม่ช้าอย่างมีนัยสำคัญ)

## 9) Implementation Order (Next Session)

1. เพิ่ม `admin_audit_logs` model + migration + index
2. ทำ `AuditLogService` กลางสำหรับ write/query
3. ผูก write log ที่ hook points ตามข้อ 5
4. ทำ API `GET /admin/audit-logs` (search + pagination + admin guard)
5. เพิ่มแท็บ `Audit Log` ใน Settings + table + search + pagination
6. ทดสอบ E2E ตาม Acceptance Criteria

## 10) Out of Scope (v1)

- Export CSV
- Advanced filters (date range, action dropdown, actor dropdown, entity dropdown)
- Real-time streaming (websocket)
- Diff viewer แบบละเอียดใน list view

