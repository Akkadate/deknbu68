# ระบบ LINE Official Account สำหรับมหาวิทยาลัย (Node.js)

## ความสามารถของระบบ

1. **เพิ่ม Tag คณะอัตโนมัติ**
   - เมื่อนักศึกษา Add เป็นเพื่อน ระบบจะถามข้อมูลคณะ
   - ระบบจะเพิ่ม Tag ตามคณะให้อัตโนมัติผ่าน LINE Messaging API
   - รองรับการเปลี่ยนคณะภายหลัง

2. **จัดเก็บข้อมูลผู้ใช้**
   - เก็บข้อมูล User ID และข้อมูลโปรไฟล์ใน PostgreSQL Database
   - เก็บประวัติการลงทะเบียนและการโต้ตอบล่าสุด
   - เก็บข้อมูลคณะที่เลือก

3. **ระบบจัดการสำหรับผู้ดูแล**
   - API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด
   - API สำหรับส่งข้อความหาผู้ใช้ตามคณะ (Broadcast)

## โครงสร้างโปรเจค

```
line-university-bot/
├── app.js              // โค้ดหลักของแอปพลิเคชัน
├── .env                // ไฟล์สำหรับตั้งค่าตัวแปรสภาพแวดล้อม
├── package.json        // ไฟล์กำหนด dependencies
├── schema.sql          // สคริปต์สร้างฐานข้อมูล PostgreSQL
└── node_modules/       // โฟลเดอร์เก็บ libraries ที่ติดตั้ง
```

## การติดตั้ง

1. **ติดตั้ง Node.js และ npm**:
   ```
   https://nodejs.org/
   ```

2. **ติดตั้ง PostgreSQL**:
   ```
   https://www.postgresql.org/download/
   ```

3. **Clone โปรเจค** (หรือสร้างไฟล์ตามที่ให้ไว้):
   ```
   git clone <repository-url>
   cd line-university-bot
   ```

4. **ติดตั้ง Dependencies**:
   ```
   npm install
   ```

5. **สร้างฐานข้อมูล PostgreSQL**:
   ```
   psql -U postgres -f schema.sql
   ```

6. **ตั้งค่า Environment Variables**:
   - แก้ไขไฟล์ `.env` ให้ตรงกับการตั้งค่าของคุณ

7. **เริ่มต้นแอปพลิเคชัน**:
   ```
   npm start
   ```

## การตั้งค่า LINE API

1. สร้าง LINE Official Account ในเว็บ [LINE Developers Console](https://developers.line.biz/)
2. เปิดใช้งาน Messaging API
3. ตั้งค่า Channel Access Token และ Channel Secret ในไฟล์ `.env`
4. ตั้งค่า Webhook URL ชี้ไปที่ `/webhook` ของเซิร์ฟเวอร์ที่รันโค้ดนี้

## คำอธิบายฟังก์ชันหลัก

1. **handleFollowEvent**: ทำงานเมื่อมีผู้ใช้กด Add เพื่อน
   - บันทึกข้อมูลผู้ใช้
   - ส่งข้อความต้อนรับและปุ่มเลือกคณะ

2. **handlePostbackEvent**: ทำงานเมื่อผู้ใช้กดปุ่มเลือกคณะ
   - เพิ่ม Tag คณะให้กับผู้ใช้
   - อัปเดตข้อมูลคณะในฐานข้อมูล

3. **handleTextMessage**: ทำงานเมื่อผู้ใช้ส่งข้อความ
   - รองรับคำสั่ง "เปลี่ยนคณะ" และ "ข้อมูลของฉัน"
   - อัปเดตเวลาโต้ตอบล่าสุด

4. **Admin APIs**:
   - `/admin/users`: API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด
   - `/admin/broadcast`: API สำหรับส่งข้อความหาผู้ใช้ตามคณะ

## ข้อแนะนำสำหรับการใช้งานจริง

1. **ความปลอดภัย**:
   - เพิ่มการรักษาความปลอดภัยให้กับ Admin API เช่น JWT Authentication
   - เก็บข้อมูลที่ละเอียดอ่อนใน environment variables

2. **การ Deploy**:
   - ใช้ PM2 หรือ Docker เพื่อจัดการการทำงานของแอปพลิเคชัน
   - ใช้ HTTPS ในการเปิดใช้งาน API

3. **การขยายระบบ**:
   - แยกโค้ดเป็นไฟล์ย่อยตามหน้าที่การทำงาน (routes, controllers, services)
   - พิจารณาใช้ ORM เช่น Sequelize หรือ TypeORM เพื่อจัดการฐานข้อมูล

4. **การดูแลรักษา**:
   - เพิ่มระบบ Logging เพื่อติดตามการทำงานและข้อผิดพลาด
   - เพิ่มการทดสอบอัตโนมัติเพื่อตรวจสอบการทำงานของระบบ

5. **กฎหมายและความเป็นส่วนตัว**:
   - ปฏิบัติตาม PDPA และกฎหมายคุ้มครองข้อมูลส่วนบุคคล
   - แจ้งให้ผู้ใช้ทราบถึงการเก็บข้อมูลและวัตถุประสงค์

## การใช้งาน API

### 1. ส่งข้อความหาผู้ใช้ตามคณะ

```
POST /admin/broadcast
Content-Type: application/json

{
  "faculty": "คณะวิศวกรรมศาสตร์",
  "message": "ขอเชิญนักศึกษาคณะวิศวกรรมศาสตร์เข้าร่วมกิจกรรม..."
}
```

*หมายเหตุ*: หากไม่ระบุ faculty จะส่งข้อความหาผู้ใช้ทุกคน

### 2. ดึงข้อมูลผู้ใช้ทั้งหมด

```
GET /admin/users
```

## ตัวอย่างการทดสอบ

1. **ทดสอบเพิ่มเพื่อน LINE Official Account**
2. **เลือกคณะจากปุ่มที่แสดง**
3. **ส่งข้อความ "ข้อมูลของฉัน" เพื่อดูข้อมูลตัวเอง**
4. **ทดสอบส่ง API เพื่อส่งข้อความหาผู้ใช้**