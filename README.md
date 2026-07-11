# SAO Toolkit by MSN

Private PDF Tools ธีมแมวสีเหลือง–ส้มแบบมินิมอล ประมวลผล PDF ภายใน Browser โดยไม่อัปโหลดเอกสารไปยัง Server

## เผยแพร่ GitHub Pages

1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ไปยัง Repository
2. ไปที่ Settings → Pages
3. เลือก Source เป็น GitHub Actions
4. รอ Workflow ทำงานสำเร็จ

เว็บไซต์มีปุ่มดาวน์โหลด `SAO-Toolkit-by-MSN-Offline.html` เพื่อให้ผู้ใช้นำไปเปิดแบบ Offline ได้

## พัฒนาและสร้างไฟล์

```bash
npm install
npm run build:offline
```

PDF, ภาพตัวอย่าง และผลลัพธ์ถูกประมวลผลใน Browser ไม่มี Backend, Analytics หรือ Upload API
