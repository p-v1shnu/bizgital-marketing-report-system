# คู่มือติดตั้ง Extension (Developer Mode)

วิธีนี้ใช้สำหรับติดตั้งภายในทีม โดยไม่ต้องขึ้น Store

## เลือกวิธีให้ตรงบทบาท

- พนักงานทั่วไป: ใช้ไฟล์ `zip` แล้วติดตั้งเอง (ไม่ต้องรันสคริปต์ PowerShell)
- ทีมเทคนิค/IT: ใช้สคริปต์ `install-dev-mode.ps1` เพื่อลงไฟล์อัตโนมัติ

## วิธี A (แนะนำสำหรับพนักงาน): ติดตั้งจาก zip

1. รับไฟล์ zip จากทีมเทคนิค
2. แตกไฟล์ zip ไปโฟลเดอร์ถาวร เช่น:
`C:\Users\<ชื่อผู้ใช้>\AppData\Local\BIZGITAL\InsightCaptureBridge`
3. เปิดหน้า extension
- Chrome: `chrome://extensions`
- Edge: `edge://extensions`
4. เปิด `Developer mode`
5. กด `Load unpacked`
6. เลือกโฟลเดอร์ที่แตกไฟล์ไว้ในข้อ 2

หมายเหตุ:
- วิธี A ไม่ต้องรัน `install-dev-mode.ps1`

## วิธี B (สำหรับทีมเทคนิค/IT): ใช้สคริปต์ช่วยติดตั้ง

1. เข้าโฟลเดอร์ `deployment/dev-mode`
2. รัน:

```powershell
.\install-dev-mode.ps1 -Browser Both
```

3. สคริปต์จะคัดลอกไฟล์ extension ไป:
`%LOCALAPPDATA%\BIZGITAL\InsightCaptureBridge`
4. เปิดหน้า extension ให้อัตโนมัติ
5. เปิด `Developer mode` และกด `Load unpacked`
6. เลือกโฟลเดอร์:
`%LOCALAPPDATA%\BIZGITAL\InsightCaptureBridge`

## วิธีทำไฟล์ zip สำหรับแจก (ทีมเทคนิค)

คำสั่งเต็ม (copy ไปวางได้เลย):

```powershell
cd "C:\Users\ppele\OneDrive - BIZGITAL Company Limited\Documents\Cowork\Technical\Internal\Report System v2\apps\frontend\browser-extension\insight-capture-bridge\deployment\dev-mode"
.\build-devmode-zip.ps1
```

หรือถ้าอยู่ในโฟลเดอร์ `insight-capture-bridge` แล้ว ใช้:

```powershell
.\deployment\dev-mode\build-devmode-zip.ps1
```

ไฟล์ที่ได้จะอยู่ใน:
`deployment/dev-mode/out/`

## อัปเดตเวอร์ชัน

1. รับไฟล์ zip เวอร์ชันใหม่ แล้วแตกทับโฟลเดอร์เดิม
2. เปิด `chrome://extensions` หรือ `edge://extensions`
3. กด `Reload` ที่ extension

## หมายเหตุ

- ไม่ต้องใช้สิทธิ์แอดมิน
- ต้องเปิด `Developer mode` ใน browser
