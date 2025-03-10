-- สร้างฐานข้อมูลสำหรับ LINE Official Account ของมหาวิทยาลัย
CREATE DATABASE line_db;

-- เชื่อมต่อกับฐานข้อมูลที่สร้าง
\c line_db

-- สร้างตาราง users สำหรับเก็บข้อมูลผู้ใช้ LINE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    line_user_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    picture_url TEXT,
    faculty TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- สร้าง index เพื่อเพิ่มประสิทธิภาพในการค้นหา
CREATE INDEX idx_line_user_id ON users(line_user_id);
CREATE INDEX idx_faculty ON users(faculty);
CREATE INDEX idx_registered_at ON users(registered_at);

-- สร้างตาราง broadcast_history สำหรับเก็บประวัติการส่งข้อความ
CREATE TABLE IF NOT EXISTS broadcast_history (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    faculty TEXT,
    recipients_count INTEGER,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_by TEXT
);

-- สร้าง role และกำหนดสิทธิ์สำหรับแอปพลิเคชัน
CREATE ROLE line_app_user WITH LOGIN PASSWORD 'your_secure_password';
GRANT CONNECT ON DATABASE line_db TO line_app_user;
GRANT USAGE ON SCHEMA public TO line_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO line_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO line_app_user;

-- คำสั่งสำหรับเพิ่ม admin user (optional)
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- เพิ่ม admin user ตัวอย่าง (ในการใช้งานจริงต้องเปลี่ยน password hash)
INSERT INTO admin_users (username, password_hash, email) 
VALUES ('admin', '$2b$10$examplehashfordemopurposesonly', 'admin@university.ac.th');

-- ตาราง faculty_list สำหรับเก็บรายชื่อคณะที่มีในมหาวิทยาลัย
CREATE TABLE IF NOT EXISTS faculty_list (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT TRUE
);

-- เพิ่มข้อมูลคณะตัวอย่าง
INSERT INTO faculty_list (name) VALUES 
    ('คณะวิศวกรรมศาสตร์'),
    ('คณะวิทยาศาสตร์'),
    ('คณะบริหารธุรกิจ'),
    ('คณะนิติศาสตร์'),
    ('คณะมนุษยศาสตร์'),
    ('คณะแพทยศาสตร์'),
    ('คณะสถาปัตยกรรมศาสตร์'),
    ('คณะศึกษาศาสตร์');