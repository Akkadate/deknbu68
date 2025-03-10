// app.js - เป็นไฟล์หลักของแอปพลิเคชัน

require("dotenv").config();
const express = require("express");
const { Client } = require("pg");
const line = require("@line/bot-sdk");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 3000;

// กำหนดค่า LINE API
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// สร้าง LINE client
const lineClient = new line.Client(lineConfig);

// กำหนดค่าการเชื่อมต่อกับ PostgreSQL
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "line_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
};

// รายชื่อคณะในมหาวิทยาลัย
const FACULTIES = [
  "คณะวิศวกรรมศาสตร์",
  "คณะวิทยาศาสตร์",
  "คณะบริหารธุรกิจ",
  "คณะนิติศาสตร์",
  "คณะมนุษยศาสตร์",
  "คณะแพทยศาสตร์",
  "คณะสถาปัตยกรรมศาสตร์",
  "คณะศึกษาศาสตร์",
];

// สร้างการเชื่อมต่อกับฐานข้อมูล PostgreSQL
async function getDbClient() {
  const client = new Client(dbConfig);
  await client.connect();
  return client;
}

// สร้างฐานข้อมูลและตารางหากยังไม่มี
async function initDatabase() {
  try {
    const client = await getDbClient();

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        line_user_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        picture_url TEXT,
        faculty TEXT,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_line_user_id ON users(line_user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faculty ON users(faculty)
    `);

    console.log("ตารางในฐานข้อมูลถูกสร้างเรียบร้อยแล้ว");
    await client.end();
  } catch (error) {
    console.error("ไม่สามารถสร้างฐานข้อมูลได้:", error);
  }
}

// Middleware สำหรับ LINE Webhook
app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map((event) => handleEvent(event)));
    res.status(200).end();
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการประมวลผลเหตุการณ์:", error);
    res.status(500).end();
  }
});

// ฟังก์ชันสำหรับจัดการกับเหตุการณ์ต่างๆ จาก LINE
async function handleEvent(event) {
  switch (event.type) {
    case "follow":
      return handleFollowEvent(event);
    case "message":
      if (event.message.type === "text") {
        return handleTextMessage(event);
      }
      break;
    case "postback":
      return handlePostbackEvent(event);
  }

  // ส่งข้อความตอบกลับพื้นฐานสำหรับเหตุการณ์ที่ไม่ได้จัดการ
  return lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: "ขอบคุณที่ติดต่อเรา หากต้องการความช่วยเหลือโปรดติดต่อเจ้าหน้าที่",
  });
}

// จัดการเหตุการณ์เมื่อผู้ใช้กด Add เป็นเพื่อน
async function handleFollowEvent(event) {
  try {
    const userId = event.source.userId;

    // ดึงข้อมูลโปรไฟล์ผู้ใช้
    const profile = await lineClient.getProfile(userId);

    // บันทึกผู้ใช้ลงฐานข้อมูล
    await saveUserToDatabase(userId, profile);

    // สร้างข้อความต้อนรับและปุ่มเลือกคณะ
    const welcomeMessage = {
      type: "text",
      text: `สวัสดีครับคุณ ${profile.displayName} ยินดีต้อนรับสู่ LINE Official ของมหาวิทยาลัย\nเพื่อให้เราสามารถส่งข่าวสารที่เกี่ยวข้องได้ตรงกลุ่ม กรุณาเลือกคณะของคุณ`,
    };

    // สร้างปุ่มเลือกคณะ
    const facultyButtons = createFacultySelection();

    // ส่งข้อความต้อนรับและปุ่มเลือกคณะ
    return lineClient.replyMessage(event.replyToken, [
      welcomeMessage,
      facultyButtons,
    ]);
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการจัดการเหตุการณ์ follow:", error);
  }
}

// บันทึกข้อมูลผู้ใช้ลงฐานข้อมูล
async function saveUserToDatabase(userId, profile) {
  try {
    const client = await getDbClient();

    // ตรวจสอบว่ามีผู้ใช้นี้ในฐานข้อมูลหรือไม่
    const checkResult = await client.query(
      "SELECT line_user_id FROM users WHERE line_user_id = $1",
      [userId]
    );

    const currentTime = new Date();

    if (checkResult.rows.length > 0) {
      // อัปเดตข้อมูลผู้ใช้ที่มีอยู่แล้ว
      await client.query(
        `UPDATE users 
         SET display_name = $1, picture_url = $2, last_interaction = $3
         WHERE line_user_id = $4`,
        [profile.displayName, profile.pictureUrl, currentTime, userId]
      );
    } else {
      // เพิ่มผู้ใช้ใหม่
      await client.query(
        `INSERT INTO users 
         (line_user_id, display_name, picture_url, registered_at, last_interaction)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          profile.displayName,
          profile.pictureUrl,
          currentTime,
          currentTime,
        ]
      );
    }

    console.log(`บันทึกข้อมูลผู้ใช้ ${userId} เรียบร้อยแล้ว`);
    await client.end();
  } catch (error) {
    console.error("ไม่สามารถบันทึกข้อมูลผู้ใช้ได้:", error);
  }
}

// สร้างปุ่มเลือกคณะ
function createFacultySelection() {
  // สร้างปุ่มไม่เกิน 4 ปุ่มตามข้อจำกัดของ LINE
  const actions = FACULTIES.slice(0, 4).map((faculty, index) => {
    return {
      type: "postback",
      label: faculty.length > 12 ? faculty.substring(0, 12) + "..." : faculty,
      data: `faculty_${index}`,
      displayText: faculty, // ข้อความที่จะแสดงในห้องแชทเมื่อกดปุ่ม
    };
  });

  // เพิ่มปุ่มเพิ่มเติม หากมีคณะมากกว่า 4 คณะ
  if (FACULTIES.length > 4) {
    actions.push({
      type: "postback",
      label: "ดูคณะเพิ่มเติม",
      data: "more_faculties",
      displayText: "ดูคณะเพิ่มเติม",
    });
  }

  return {
    type: "template",
    altText: "เลือกคณะของคุณ",
    template: {
      type: "buttons",
      title: "เลือกคณะของคุณ",
      text: "กรุณาเลือกคณะที่คุณสังกัด",
      actions: actions,
    },
  };
}

// สร้างปุ่มเลือกคณะชุดที่ 2
function createMoreFacultyButtons() {
  const remainingFaculties = FACULTIES.slice(4);
  const actions = remainingFaculties.slice(0, 4).map((faculty, index) => {
    return {
      type: "postback",
      label: faculty.length > 12 ? faculty.substring(0, 12) + "..." : faculty,
      data: `faculty_${index + 4}`,
      displayText: faculty,
    };
  });

  return {
    type: "template",
    altText: "เลือกคณะของคุณ (เพิ่มเติม)",
    template: {
      type: "buttons",
      title: "เลือกคณะของคุณ",
      text: "กรุณาเลือกคณะที่คุณสังกัด",
      actions: actions,
    },
  };
}

// จัดการกับการกดปุ่ม Postback
async function handlePostbackEvent(event) {
  try {
    const userId = event.source.userId;
    const data = event.postback.data;

    // ตรวจสอบว่าเป็นการเลือกคณะหรือไม่
    if (data.startsWith("faculty_")) {
      const facultyIndex = parseInt(data.split("_")[1]);
      const selectedFaculty = FACULTIES[facultyIndex];

      // เพิ่ม tag คณะให้กับผู้ใช้
      await addFacultyTag(userId, selectedFaculty);

      // อัปเดตข้อมูลคณะในฐานข้อมูล
      await updateUserFaculty(userId, selectedFaculty);

      // ส่งข้อความยืนยัน
      const confirmationMessage = {
        type: "text",
        text: `ขอบคุณที่แจ้งข้อมูล คุณได้รับการติด tag '${selectedFaculty}' เรียบร้อยแล้ว\n\nคุณจะได้รับข่าวสารที่เกี่ยวข้องกับคณะของคุณโดยเฉพาะ`,
      };

      return lineClient.replyMessage(event.replyToken, confirmationMessage);
    }

    // กรณีผู้ใช้เลือกดูคณะชุดที่ 2
    else if (data === "more_faculties") {
      const moreButtons = createMoreFacultyButtons();
      return lineClient.replyMessage(event.replyToken, moreButtons);
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการจัดการ postback:", error);
  }
}

// เพิ่ม tag คณะให้กับผู้ใช้ผ่าน LINE API
async function addFacultyTag(userId, facultyName) {
  try {
    // ก่อนอื่นต้องตรวจสอบว่ามี tag นี้ในระบบหรือไม่ ถ้าไม่มีให้สร้างใหม่
    const tagId = await getOrCreateTag(facultyName);

    if (!tagId) {
      console.error(`ไม่สามารถหรือสร้าง tag ${facultyName} ได้`);
      return;
    }

    // ทำการเพิ่ม tag ให้กับผู้ใช้
    const url = `https://api.line.me/v2/bot/user/${userId}/tag`;

    const headers = {
      Authorization: `Bearer ${lineConfig.channelAccessToken}`,
      "Content-Type": "application/json",
    };

    const data = {
      tagId: tagId,
    };

    const axios = require("axios");
    const response = await axios.post(url, data, { headers });

    if (response.status === 200) {
      console.log(`เพิ่ม tag ${facultyName} ให้ผู้ใช้ ${userId} สำเร็จ`);
    } else {
      console.error(`เพิ่ม tag ล้มเหลว: ${response.statusText}`);
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเพิ่ม tag:", error);
  }
}

// ดึงหรือสร้าง tag
async function getOrCreateTag(tagName) {
  try {
    const axios = require("axios");
    // URL สำหรับดึงข้อมูล tag ทั้งหมด
    const url = "https://api.line.me/v2/bot/tag";

    const headers = {
      Authorization: `Bearer ${lineConfig.channelAccessToken}`,
    };

    // ดึงข้อมูล tag ทั้งหมด
    const response = await axios.get(url, { headers });

    if (response.status === 200) {
      const tags = response.data.tags || [];

      // ตรวจสอบว่ามี tag ชื่อนี้หรือไม่
      for (const tag of tags) {
        if (tag.name === tagName) {
          return tag.tagId;
        }
      }

      // ถ้าไม่มี tag ให้สร้างใหม่
      return await createNewTag(tagName);
    } else {
      console.error(`ไม่สามารถดึงข้อมูล tag ได้: ${response.statusText}`);
      return null;
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการดึงข้อมูล tag:", error);
    return null;
  }
}

// สร้าง tag ใหม่
async function createNewTag(tagName) {
  try {
    const axios = require("axios");
    const url = "https://api.line.me/v2/bot/tag";

    const headers = {
      Authorization: `Bearer ${lineConfig.channelAccessToken}`,
      "Content-Type": "application/json",
    };

    const data = {
      name: tagName,
    };

    const response = await axios.post(url, data, { headers });

    if (response.status === 200) {
      const tagId = response.data.tagId;
      console.log(`สร้าง tag ${tagName} สำเร็จ tagId: ${tagId}`);
      return tagId;
    } else {
      console.error(`สร้าง tag ล้มเหลว: ${response.statusText}`);
      return null;
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการสร้าง tag:", error);
    return null;
  }
}

// อัปเดตข้อมูลคณะของผู้ใช้ในฐานข้อมูล
async function updateUserFaculty(userId, faculty) {
  try {
    const client = await getDbClient();
    const currentTime = new Date();

    await client.query(
      `UPDATE users 
       SET faculty = $1, last_interaction = $2
       WHERE line_user_id = $3`,
      [faculty, currentTime, userId]
    );

    console.log(
      `อัปเดตข้อมูลคณะของผู้ใช้ ${userId} เป็น ${faculty} เรียบร้อยแล้ว`
    );
    await client.end();
  } catch (error) {
    console.error("ไม่สามารถอัปเดตข้อมูลคณะได้:", error);
  }
}

// จัดการกับข้อความที่ผู้ใช้ส่งมา
async function handleTextMessage(event) {
  try {
    const userId = event.source.userId;
    const text = event.message.text;

    // อัปเดตเวลาโต้ตอบล่าสุด
    await updateLastInteraction(userId);

    // กรณีผู้ใช้ต้องการเปลี่ยนคณะ
    if (text.includes("เปลี่ยนคณะ")) {
      const facultyButtons = createFacultySelection();
      return lineClient.replyMessage(event.replyToken, [
        {
          type: "text",
          text: "คุณสามารถเลือกคณะใหม่ได้ที่นี่",
        },
        facultyButtons,
      ]);
    }

    // กรณีผู้ใช้ต้องการดูข้อมูลของตัวเอง
    else if (text.includes("ข้อมูลของฉัน")) {
      const userInfo = await getUserInfo(userId);

      if (userInfo) {
        const infoMessage = {
          type: "text",
          text: `ข้อมูลของคุณ\n\nชื่อ: ${userInfo.display_name}\nคณะ: ${
            userInfo.faculty || "ยังไม่ได้ระบุ"
          }\nลงทะเบียนเมื่อ: ${new Date(userInfo.registered_at).toLocaleString(
            "th-TH"
          )}`,
        };

        return lineClient.replyMessage(event.replyToken, infoMessage);
      } else {
        return lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: "ไม่พบข้อมูลของคุณในระบบ กรุณาลองใหม่อีกครั้ง",
        });
      }
    }

    // ตอบกลับข้อความทั่วไป
    else {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: 'ขอบคุณสำหรับข้อความ\n- หากต้องการเปลี่ยนคณะ พิมพ์ "เปลี่ยนคณะ"\n- หากต้องการดูข้อมูลของคุณ พิมพ์ "ข้อมูลของฉัน"',
      });
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการจัดการข้อความ:", error);
  }
}

// อัปเดตเวลาโต้ตอบล่าสุดของผู้ใช้
async function updateLastInteraction(userId) {
  try {
    const client = await getDbClient();
    const currentTime = new Date();

    await client.query(
      `UPDATE users 
       SET last_interaction = $1
       WHERE line_user_id = $2`,
      [currentTime, userId]
    );

    await client.end();
  } catch (error) {
    console.error("ไม่สามารถอัปเดตเวลาโต้ตอบล่าสุดได้:", error);
  }
}

// ดึงข้อมูลผู้ใช้จากฐานข้อมูล
async function getUserInfo(userId) {
  try {
    const client = await getDbClient();

    const result = await client.query(
      `SELECT display_name, faculty, registered_at
       FROM users
       WHERE line_user_id = $1`,
      [userId]
    );

    await client.end();

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    return null;
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลผู้ใช้ได้:", error);
    return null;
  }
}

// API สำหรับผู้ดูแลระบบในการดึงข้อมูลผู้ใช้ทั้งหมด
app.get("/admin/users", bodyParser.json(), async (req, res) => {
  try {
    // ในการใช้งานจริงควรเพิ่มการตรวจสอบความปลอดภัย เช่น การยืนยันตัวตนด้วย API key
    const client = await getDbClient();

    const result = await client.query(`
      SELECT line_user_id, display_name, picture_url, faculty,
             registered_at, last_interaction
      FROM users
      ORDER BY registered_at DESC
    `);

    await client.end();

    res.json({
      status: "success",
      total_users: result.rows.length,
      users: result.rows,
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// API สำหรับส่งข้อความหาผู้ใช้ตาม tag คณะ
app.post("/admin/broadcast", bodyParser.json(), async (req, res) => {
  try {
    // ในการใช้งานจริงควรเพิ่มการตรวจสอบความปลอดภัย
    const { faculty, message } = req.body;

    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "ไม่ได้ระบุข้อความที่ต้องการส่ง",
      });
    }

    const client = await getDbClient();
    let users;

    if (faculty) {
      const result = await client.query(
        "SELECT line_user_id FROM users WHERE faculty = $1",
        [faculty]
      );
      users = result.rows.map((row) => row.line_user_id);
    } else {
      const result = await client.query("SELECT line_user_id FROM users");
      users = result.rows.map((row) => row.line_user_id);
    }

    await client.end();

    // ส่งข้อความแบบ multicast (ส่งหาหลายคน)
    // LINE API จำกัดให้ส่งได้ครั้งละไม่เกิน 500 คน
    const chunks = [];
    for (let i = 0; i < users.length; i += 500) {
      chunks.push(users.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      await lineClient.multicast(chunk, {
        type: "text",
        text: message,
      });
    }

    res.json({
      status: "success",
      total_recipients: users.length,
      message: "ส่งข้อความเรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการส่งข้อความ broadcast:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// เริ่มต้นเซิร์ฟเวอร์
app.listen(port, async () => {
  console.log(`เซิร์ฟเวอร์ทำงานที่พอร์ต ${port}`);
  await initDatabase();
});

module.exports = app;
