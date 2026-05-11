# คู่มือ Deploy Production แบบปลอดภัย (กรณีมีการแก้โครงสร้างฐานข้อมูล)

เอกสารนี้เป็น runbook สำหรับอัปเดต production โดย **ไม่ทำข้อมูลเก่าหาย**  
ใช้กับโปรเจกต์ `bizgital-marketing-report-system` (Docker Compose)

## ลำดับขั้นตอนแบบสั้น (อ่านก่อนเริ่ม)

1. เข้าโฟลเดอร์โปรเจกต์บน production และ `git pull` โค้ดล่าสุด
2. ทำ backup ฐานข้อมูลทันที (บังคับทุกครั้ง)
3. ตรวจว่ารอบนี้มีไฟล์ SQL migration แบบ manual หรือไม่
4. ถ้ามี manual SQL ให้รัน migration ก่อน deploy backend
5. ตรวจผล migration (เช่นตรวจ index/column/table ตามที่เปลี่ยน)
6. Deploy service (`backend` อย่างน้อย หรือทั้งระบบ)
7. รันเฉพาะคำสั่ง DB ที่ปลอดภัย (`db:generate`, backfill ที่จำเป็น)
8. หลีกเลี่ยง `db:push` บน production; ถ้าจำเป็นต้องรันและเห็น data loss warning ให้ยกเลิกทันที
9. ทำ smoke test หลัง deploy (login/import/report/competitor flow)
10. ถ้าพบปัญหารุนแรง ให้ rollback โค้ดและ/หรือ restore DB จาก backup

## เป้าหมาย
- Deploy โค้ดใหม่ได้
- เปลี่ยนโครงสร้าง DB ได้อย่างปลอดภัย
- หลีกเลี่ยงคำสั่งที่ทำให้ตาราง/ข้อมูลถูกลบโดยไม่ตั้งใจ

## กฎสำคัญ (จำสั้นๆ)
- ต้อง backup ก่อนทุกครั้ง
- ถ้ามีไฟล์ SQL migration แบบ manual ให้ใช้ SQL นั้นก่อน
- ถ้า `db:push` โชว์ข้อความ `There might be data loss...` ให้ **ยกเลิกทันที** (`N` หรือ `Ctrl+C`)
- ห้ามกดยอมรับการลบข้อมูลใน production

---

## 1) ขั้นตอนมาตรฐานก่อน deploy

```bash
cd "/home/automation-hub-sgp01/bizgital-marketing-report-system"
git pull origin main
```

---

## 2) Backup ฐานข้อมูล (บังคับ)

แนะนำใช้ root + `--no-tablespaces` เพื่อลดปัญหา permission:

```bash
docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_before_deploy_$(date +%F_%H%M%S).sql
```

ตรวจว่า backup สำเร็จ:

```bash
ls -lh backup_before_deploy_*.sql
tail -n 5 backup_before_deploy_*.sql
```

---

## 3) ใช้ SQL migration แบบปลอดภัย (ถ้ามี)

ตัวอย่าง (เคสลบ unique index ของชื่อ competitor):

```bash
cat apps/backend/prisma/manual/20260509_competitor_name_per_brand.sql | docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
```

ตรวจผลทันที:

```bash
docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "SHOW INDEX FROM competitors;"'
```

### 3.1 รัน SQL แบบ idempotent (แนะนำ)

ไฟล์ manual SQL ล่าสุดควรเขียนให้ **รันซ้ำได้** โดยเช็ค `information_schema` ก่อน `ALTER TABLE`  
เพื่อหลีกเลี่ยง `ERROR 1060 Duplicate column name ...` เวลารันซ้ำ

สำหรับชุด `20260511` ให้รันได้ตรงๆตามนี้ (รันซ้ำได้):

```bash
cat apps/backend/prisma/manual/20260511_question_master_description.sql \
| docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

cat apps/backend/prisma/manual/20260511_question_highlight_note_optional.sql \
| docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

cat apps/backend/prisma/manual/20260511_question_related_product_breakdown.sql \
| docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

cat apps/backend/prisma/manual/20260511_company_format_option_description.sql \
| docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
```

ถ้าคอลัมน์มีอยู่แล้ว ไฟล์ idempotent จะรายงาน `skip: ... already exists` แทนการ fail

---

## 4) Deploy service

Deploy เฉพาะ backend:

```bash
docker compose up -d --build backend
```

หรือ deploy ทั้งระบบ:

```bash
docker compose up -d --build
```

---

## 5) คำสั่ง DB ที่ใช้ได้/ไม่ควรใช้บน production

### ใช้ได้ (ปลอดภัยกว่า)
- `db:generate` (สร้าง Prisma client)
- SQL manual migration ที่ review แล้ว
- backfill script ที่ออกแบบมาเพื่อเติมข้อมูล

```bash
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:generate
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:backfill-competitor-assignments
```

### หลีกเลี่ยงใน production
- `db:push` (เพราะอาจพยายาม drop ตาราง/คอลัมน์)
- โดยเฉพาะเมื่อมีข้อความเตือน data loss

ถ้าจำเป็นต้องรัน `db:push` จริงๆ:
1. ต้องมี backup ล่าสุด
2. ต้องอ่าน warning ทุกบรรทัด
3. ถ้าเห็นว่าจะ drop table/column ที่มีข้อมูล ให้ยกเลิกทันที

---

## 6) เช็กลิสต์หลัง deploy

```bash
docker compose ps
docker compose logs --tail=200 backend
```

ตรวจฟังก์ชันหลักในระบบ:
- ล็อกอินได้
- เปิดหน้า import/report ได้
- หน้า competitors ทำงานปกติ
- งานที่แก้ล่าสุดทำงานตรงตามคาด

---

## 7) Rollback (ถ้าพบปัญหารุนแรง)

### 7.1 Rollback โค้ด (กลับ commit ก่อนหน้า)
```bash
git log --oneline -n 5
git checkout <previous_commit_sha>
docker compose up -d --build backend
```

### 7.2 กู้ข้อมูลจาก backup
```bash
cat backup_before_deploy_YYYY-MM-DD_HHMMSS.sql | docker compose exec -T mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
```

---

## 8) Quick Template (คัดลอกใช้ได้ทันที)

```bash
cd "/home/automation-hub-sgp01/bizgital-marketing-report-system"
git pull origin main

docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_before_deploy_$(date +%F_%H%M%S).sql

# ถ้ามี manual SQL migration ให้รันตรงนี้
# cat apps/backend/prisma/manual/<file>.sql | docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

# ตัวอย่างชุด 20260511 (idempotent)
# cat apps/backend/prisma/manual/20260511_question_master_description.sql | docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
# cat apps/backend/prisma/manual/20260511_question_highlight_note_optional.sql | docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
# cat apps/backend/prisma/manual/20260511_question_related_product_breakdown.sql | docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
# cat apps/backend/prisma/manual/20260511_company_format_option_description.sql | docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

docker compose up -d --build backend
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:generate
# docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:backfill-competitor-assignments
```

---

## หมายเหตุ
- warning `Using a password on the command line interface can be insecure` เป็น warning ปกติของ mysql client
- ความปลอดภัยจริงอยู่ที่การ backup ก่อน และไม่ยอมรับคำสั่งที่ลบข้อมูลโดยไม่ตั้งใจ
