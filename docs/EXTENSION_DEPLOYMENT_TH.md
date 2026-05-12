# คู่มือ Extension Deployment (TH)

เอกสารนี้เป็น runbook กลางสำหรับปล่อย `BIZGITAL Insight Capture Bridge` ทั้งฝั่ง Local และ Production
เพื่อให้ทีมทำตามขั้นตอนเดียวกันได้อย่างสม่ำเสมอ

เกี่ยวข้องกับโฟลเดอร์:
`apps/frontend/browser-extension/insight-capture-bridge`

---

## 1) สรุปภาพรวม Dev vs Prod

### Dev (Local/ทดสอบภายใน)
- ใช้ `manifest` profile: `dev`
- รองรับ `localhost` และ `127.0.0.1`
- ติดตั้งด้วย `Load unpacked` (Developer mode)
- เหมาะกับทีม dev / QA

### Prod (Chrome Web Store)
- ใช้ `manifest` profile: `prod`
- อนุญาตเฉพาะโดเมน production ที่กำหนด
- แพ็กเป็นไฟล์ zip สำหรับอัปโหลดขึ้น Store

### Prod Internal (Managed Policy, ไม่ผ่าน Store)
- แพ็กเป็น CRX + `update.xml`
- deploy ผ่าน policy องค์กร (GPO/Intune/MDM)
- ใช้ private key เดิมทุก release (สำคัญมาก)

---

## 2) ไฟล์ที่ต้องรู้

- Shared manifest version:  
  `apps/frontend/browser-extension/insight-capture-bridge/manifest.shared.json`
- Manifest profiles:  
  `apps/frontend/browser-extension/insight-capture-bridge/manifest.profiles/dev.json`  
  `apps/frontend/browser-extension/insight-capture-bridge/manifest.profiles/prod.json`
- Build scripts:
  - `apps/frontend/browser-extension/insight-capture-bridge/deployment/build-manifest.ps1`
  - `apps/frontend/browser-extension/insight-capture-bridge/deployment/dev-mode/build-devmode-zip.ps1`
  - `apps/frontend/browser-extension/insight-capture-bridge/deployment/build-prod-zip.ps1`
- Managed policy scripts:
  - `apps/frontend/browser-extension/insight-capture-bridge/deployment/windows/pack-extension-crx.ps1`
  - `apps/frontend/browser-extension/insight-capture-bridge/deployment/windows/generate-update-xml.ps1`
  - `apps/frontend/browser-extension/insight-capture-bridge/deployment/windows/install-managed-extension.ps1`

---

## 3) Local / Dev Mode (คำสั่งใช้งาน)

### 3.1 สร้าง manifest สำหรับ dev

```powershell
cd "C:\Users\ppele\OneDrive - BIZGITAL Company Limited\Documents\Cowork\Technical\Internal\Report System v2\apps\frontend\browser-extension\insight-capture-bridge"
.\deployment\build-manifest.ps1 -Profile dev
```

### 3.2 แพ็ก zip สำหรับแจกทีม

```powershell
cd "C:\Users\ppele\OneDrive - BIZGITAL Company Limited\Documents\Cowork\Technical\Internal\Report System v2\apps\frontend\browser-extension\insight-capture-bridge\deployment\dev-mode"
.\build-devmode-zip.ps1
```

ผลลัพธ์: `deployment/dev-mode/out/bizgital-insight-capture-bridge-v<version>-devmode.zip`

### 3.3 ติดตั้งใน browser
1. เปิด `chrome://extensions` หรือ `edge://extensions`
2. เปิด `Developer mode`
3. กด `Load unpacked`
4. เลือกโฟลเดอร์ extension ที่แตก zip ไว้

---

## 4) Production สำหรับ Chrome Web Store

### 4.1 แพ็ก prod zip

```powershell
cd "C:\Users\ppele\OneDrive - BIZGITAL Company Limited\Documents\Cowork\Technical\Internal\Report System v2\apps\frontend\browser-extension\insight-capture-bridge\deployment"
.\build-prod-zip.ps1
```

ผลลัพธ์: `deployment/out/bizgital-insight-capture-bridge-v<version>-prod.zip`

### 4.2 อัปโหลดขึ้น Store
1. เข้า Chrome Web Store Developer Dashboard
2. เลือก extension เดิม
3. อัปโหลด zip เวอร์ชันใหม่
4. ใส่ release notes
5. ส่ง review/publish ตาม flow ของ Store

---

## 5) Production Internal แบบ Managed Policy (ไม่ผ่าน Store)

> ใช้กรณีองค์กรต้อง force install โดยไม่เปิด Developer mode และไม่ใช้ Store

### 5.1 Pack CRX (ใช้ private key เดิมทุกครั้ง)

```powershell
cd "C:\Users\ppele\OneDrive - BIZGITAL Company Limited\Documents\Cowork\Technical\Internal\Report System v2\apps\frontend\browser-extension\insight-capture-bridge\deployment\windows"
.\pack-extension-crx.ps1 -PrivateKeyPath "C:\secure\insight-capture.pem"
```

### 5.2 Generate update.xml

```powershell
.\generate-update-xml.ps1 `
  -ExtensionId "YOUR_EXTENSION_ID" `
  -CrxCodebaseUrl "https://report.bizgital.com/extensions/insight-capture/insight-capture.crx" `
  -Version "0.1.1" `
  -OutputPath ".\update.xml"
```

### 5.3 Deploy files ขึ้น HTTPS endpoint
- `insight-capture.crx`
- `update.xml`

### 5.4 Apply install policy

```powershell
.\install-managed-extension.ps1 `
  -ExtensionId "YOUR_EXTENSION_ID" `
  -UpdateManifestUrl "https://report.bizgital.com/extensions/insight-capture/update.xml" `
  -Browser Both `
  -UseExtensionSettingsOverride
```

### 5.5 ตรวจสอบ
- `chrome://policy`
- `edge://policy`

---

## 6) Release Checklist ก่อนปล่อยทุกครั้ง

1. อัปเดต `version` ใน `manifest.shared.json`
2. ตรวจว่า `manifest.profiles/dev.json` และ `prod.json` ยังถูกต้อง (โดเมน/permission)
3. build แพ็กเกจที่ต้องใช้ (`devmode zip` หรือ `prod zip` หรือ `crx`)
4. ทดสอบติดตั้งจริงบน Chrome/Edge อย่างน้อย 1 เครื่อง
5. ทดสอบ flow หลักจากหน้า `/app/internal/insight-capture-workspace`
6. เตรียม release notes (ระบุ bug fix/feature/change)
7. ถ้าเป็น Managed Policy:
   - ใช้ `.pem` เดิม
   - อัปเดต `update.xml` version ให้ตรงกับ manifest
   - อัปโหลด `crx` + `update.xml` ชุดใหม่พร้อมกัน

---

## 7) จุดที่พลาดบ่อย

- ลืม bump version -> Store/Browser ไม่เห็นว่าเป็น release ใหม่
- ใช้ private key คนละไฟล์ -> Extension ID เปลี่ยน, auto-update พัง
- build profile ผิด (dev ไป prod) -> permission ไม่ตรง environment
- แก้ไฟล์แล้วไม่ได้แพ็กใหม่ -> ไฟล์ที่ปล่อยไม่ตรงโค้ดล่าสุด

---

## 8) เอกสารอ้างอิงใน repo

- `apps/frontend/browser-extension/insight-capture-bridge/README.md`
- `apps/frontend/browser-extension/insight-capture-bridge/deployment/README.md`
- `apps/frontend/browser-extension/insight-capture-bridge/deployment/dev-mode/INSTALL_TH.md`
