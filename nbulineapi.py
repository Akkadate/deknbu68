from flask import Flask, request, abort
import os
import requests
import json
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import (
    MessageEvent, FollowEvent, PostbackEvent,
    TextMessage, TextSendMessage, TemplateSendMessage,
    ButtonsTemplate, PostbackAction
)

app = Flask(__name__)

# ตั้งค่า Channel Access Token และ Channel Secret จาก LINE Developer Console
LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_CHANNEL_ACCESS_TOKEN'
LINE_CHANNEL_SECRET = 'YOUR_CHANNEL_SECRET'

line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)
handler = WebhookHandler(LINE_CHANNEL_SECRET)

# รายชื่อคณะในมหาวิทยาลัย
FACULTIES = [
    "คณะวิศวกรรมศาสตร์",
    "คณะวิทยาศาสตร์",
    "คณะบริหารธุรกิจ",
    "คณะนิติศาสตร์",
    "คณะมนุษยศาสตร์",
    "คณะแพทยศาสตร์",
    "คณะสถาปัตยกรรมศาสตร์",
    "คณะศึกษาศาสตร์"
]

@app.route("/callback", methods=['POST'])
def callback():
    # รับ X-Line-Signature header
    signature = request.headers['X-Line-Signature']

    # รับข้อมูล request body
    body = request.get_data(as_text=True)
    app.logger.info("Request body: " + body)

    # ตรวจสอบลายเซ็น
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)

    return 'OK'

@handler.add(FollowEvent)
def handle_follow(event):
    """
    ฟังก์ชันนี้จะทำงานเมื่อมีคนกดติดตาม (Add เป็นเพื่อน) LINE Official Account
    """
    user_id = event.source.user_id
    
    # ส่งข้อความต้อนรับและถามว่าเป็นนักศึกษาคณะไหน
    welcome_message = "สวัสดีครับ ยินดีต้อนรับสู่ LINE Official ของมหาวิทยาลัย\nเพื่อให้เราสามารถส่งข่าวสารที่เกี่ยวข้องได้ตรงกลุ่ม กรุณาเลือกคณะของคุณ"
    
    # สร้างปุ่มเลือกคณะ
    faculty_buttons = create_faculty_selection()
    
    # ส่งข้อความและปุ่มเลือกคณะ
    line_bot_api.reply_message(
        event.reply_token,
        [
            TextSendMessage(text=welcome_message),
            faculty_buttons
        ]
    )

def create_faculty_selection():
    """
    สร้างปุ่มให้ผู้ใช้เลือกคณะ (แบ่งเป็น 2 ชุดเนื่องจาก LINE จำกัดปุ่มไม่เกิน 4 ปุ่มต่อเทมเพลต)
    """
    # สร้างปุ่มชุดแรก (4 คณะแรก)
    buttons_template = TemplateSendMessage(
        alt_text='เลือกคณะของคุณ',
        template=ButtonsTemplate(
            title='เลือกคณะของคุณ',
            text='กรุณาเลือกคณะที่คุณสังกัด',
            actions=[
                PostbackAction(
                    label=faculty[:12] + "..." if len(faculty) > 12 else faculty,
                    data=f"faculty_{i}"
                ) for i, faculty in enumerate(FACULTIES[:4])
            ]
        )
    )
    
    return buttons_template

@handler.add(PostbackEvent)
def handle_postback(event):
    """
    ฟังก์ชันนี้จะทำงานเมื่อผู้ใช้กดปุ่มเลือกคณะ
    """
    user_id = event.source.user_id
    data = event.postback.data
    
    # ตรวจสอบว่าเป็นการเลือกคณะหรือไม่
    if data.startswith("faculty_"):
        faculty_index = int(data.split("_")[1])
        selected_faculty = FACULTIES[faculty_index]
        
        # เพิ่ม tag คณะให้กับผู้ใช้
        add_faculty_tag(user_id, selected_faculty)
        
        # ส่งข้อความยืนยัน
        confirmation_message = f"ขอบคุณที่แจ้งข้อมูล คุณได้รับการติด tag '{selected_faculty}' เรียบร้อยแล้ว\n\nคุณจะได้รับข่าวสารที่เกี่ยวข้องกับคณะของคุณโดยเฉพาะ"
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=confirmation_message)
        )
    
    # กรณีผู้ใช้เลือกดูคณะชุดที่ 2
    elif data == "more_faculties":
        more_buttons = create_more_faculty_buttons()
        line_bot_api.reply_message(
            event.reply_token,
            more_buttons
        )

def create_more_faculty_buttons():
    """
    สร้างปุ่มเลือกคณะชุดที่ 2
    """
    buttons_template = TemplateSendMessage(
        alt_text='เลือกคณะของคุณ (เพิ่มเติม)',
        template=ButtonsTemplate(
            title='เลือกคณะของคุณ',
            text='กรุณาเลือกคณะที่คุณสังกัด',
            actions=[
                PostbackAction(
                    label=faculty[:12] + "..." if len(faculty) > 12 else faculty,
                    data=f"faculty_{i+4}"
                ) for i, faculty in enumerate(FACULTIES[4:])
            ]
        )
    )
    
    return buttons_template

def add_faculty_tag(user_id, faculty_name):
    """
    เพิ่ม tag คณะให้กับผู้ใช้ผ่าน LINE Messaging API
    """
    url = 'https://api.line.me/v2/bot/user/{}/tag'.format(user_id)
    
    # ก่อนอื่นต้องตรวจสอบว่ามี tag นี้ในระบบหรือไม่ ถ้าไม่มีให้สร้างใหม่
    tag_id = get_or_create_tag(faculty_name)
    
    # ทำการเพิ่ม tag ให้กับผู้ใช้
    headers = {
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Type': 'application/json'
    }
    
    data = {
        'tagId': tag_id
    }
    
    response = requests.post(url, headers=headers, data=json.dumps(data))
    
    # ตรวจสอบผลลัพธ์
    if response.status_code == 200:
        app.logger.info(f"เพิ่ม tag {faculty_name} ให้ผู้ใช้ {user_id} สำเร็จ")
    else:
        app.logger.error(f"เพิ่ม tag ล้มเหลว: {response.text}")

def get_or_create_tag(tag_name):
    """
    ตรวจสอบว่ามี tag นี้ในระบบหรือไม่ ถ้าไม่มีให้สร้างใหม่
    """
    # URL สำหรับดึงข้อมูล tag ทั้งหมด
    url = 'https://api.line.me/v2/bot/tag'
    
    headers = {
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
    }
    
    # ดึงข้อมูล tag ทั้งหมด
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        tags = response.json().get('tags', [])
        
        # ตรวจสอบว่ามี tag ชื่อนี้หรือไม่
        for tag in tags:
            if tag['name'] == tag_name:
                return tag['tagId']
        
        # ถ้าไม่มี tag ให้สร้างใหม่
        return create_new_tag(tag_name)
    else:
        app.logger.error(f"ไม่สามารถดึงข้อมูล tag ได้: {response.text}")
        return None

def create_new_tag(tag_name):
    """
    สร้าง tag ใหม่
    """
    url = 'https://api.line.me/v2/bot/tag'
    
    headers = {
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Type': 'application/json'
    }
    
    data = {
        'name': tag_name
    }
    
    response = requests.post(url, headers=headers, data=json.dumps(data))
    
    if response.status_code == 200:
        tag_id = response.json().get('tagId')
        app.logger.info(f"สร้าง tag {tag_name} สำเร็จ tagId: {tag_id}")
        return tag_id
    else:
        app.logger.error(f"สร้าง tag ล้มเหลว: {response.text}")
        return None

@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    """
    ฟังก์ชันนี้จะทำงานเมื่อผู้ใช้ส่งข้อความมา
    """
    text = event.message.text
    user_id = event.source.user_id
    
    # กรณีผู้ใช้ต้องการเปลี่ยนคณะ
    if "เปลี่ยนคณะ" in text:
        faculty_buttons = create_faculty_selection()
        line_bot_api.reply_message(
            event.reply_token,
            [
                TextSendMessage(text="คุณสามารถเลือกคณะใหม่ได้ที่นี่"),
                faculty_buttons
            ]
        )
    else:
        # ตอบกลับข้อความทั่วไป
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text="ขอบคุณสำหรับข้อความ หากต้องการเปลี่ยนคณะ พิมพ์ 'เปลี่ยนคณะ'")
        )

if __name__ == "__main__":
    # ใช้ environment variables หรือกำหนดพอร์ต
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
