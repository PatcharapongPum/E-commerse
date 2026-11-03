# E-Commerce Microservices Web Application (with Plugin & Multi-Tag Architecture)

ระบบ E-Commerce แบบ **Microservices Architecture** พัฒนาตามข้อกำหนดครบถ้วน:
- Based on Mockup UI & Database Schema
- **Database per Service**: แต่ละ Service มี Database (MongoDB) แยกของตัวเองอย่างเด็ดขาด
- **Asynchronous Communication**: สื่อสารระหว่าง Service ด้วย **RabbitMQ Message Broker (Fanout Pub/Sub)**
- **Control with Docker Compose**: ควบคุมและ Orchestrate ทุก Service ผ่าน `docker-compose.yml`
- **Plugin Architecture**: ปลั๊กอิน **Shipping & Delivery Tracking Plugin** รองรับการรันทั้งแบบมีปลั๊กอินและไม่มีปลั๊กอิน (Graceful Degradation)
- **Multi-Tag Versioning (P1 vs P2)**: รองรับการสลับ Image Tag ระหว่าง **`shipping-plugin:p1`** และ **`shipping-plugin:p2`** บน VM เพื่อเปลี่ยนอัลกอริทึมการคำนวณขนส่งทันทีโดยไม่ต้องแก้โค้ด

---

## 🏗 สถาปัตยกรรมระบบ (Architecture)

```
[ Browser / Client ]
         │
         ▼
[ Frontend (React + Vite) :5173 ]
         │
         ▼ (HTTP REST)
[ API Gateway (Reverse Proxy with Fallback) :5000 ]
         ├──────────────┬──────────────┬──────────────┬───────────────────┐
         ▼              ▼              ▼              ▼                   ▼
  [Auth Service] [Product Service] [Order Service] [Payment Service] [Shipping Plugin]*
      (:5001)        (:5002)        (:5003)        (:5004)             (:5005)
         │              │              │              │                   │
         ▼              ▼              ▼              ▼                   ▼
     [auth-db]    [product-db]     [order-db]    [payment-db]       [shipping-db]*
     (MongoDB)      (MongoDB)      (MongoDB)      (MongoDB)          (MongoDB)
                                       │              ▲                   ▲
                                       │ (order.created)                  │
                                       ▼              │                   │
                                ┌──────────────────────────────────────────────┐
                                │           RabbitMQ Message Broker            │
                                │   order.created  /  payment_exchange (Fanout)│
                                └──────────────────────────────────────────────┘
                                                      │                   │
                                                      └─[broadcast event]─┘
```

---

## 🏷️ เปรียบเทียบ Algorithm Tag: P1 vs P2

| คุณสมบัติ | **Tag: `p1` (Standard Logistics)** | **Tag: `p2` (Smart Express AI)** |
|---|---|---|
| **ชื่อ Algorithm** | Standard Economy Postal | Smart Express AI (Next-Day Air) |
| **บริษัทขนส่ง** | Thailand Post (Standard Postal) | Kerry Express (Next-Day Air) |
| **รูปแบบ Tracking No.** | `STD-xxxxxx` (เช่น `STD-821992`) | `VIP-EXP-xxxxxx` (เช่น `VIP-EXP-649874`) |
| **ระยะเวลาส่งของ** | ส่งแบบปกติ (3 วัน) | ส่งด่วนพิเศษ พรุ่งนี้ถึง (1 วัน) |
| **สถานะที่แสดง** | `STANDARD_SHIPPING` | `NEXT_DAY_EXPRESS` |
| **การแสดงผลบนเว็บ** | `🚚 [Tag: P1 Standard Post]` | `⚡ [Tag: P2 Smart Express]` |

---

## 🚀 วิธีการทดสอบและสลับ Tags P1 / P2 (บน Linux VM หรือ Local)

### ขั้นตอนที่ 1: รันด้วย Tag P1 (Standard Algorithm)
ในโฟลเดอร์โปรเจกต์ ตรวจสอบไฟล์ `.env` มีค่า:
```env
PLUGIN_TAG=p1
```
จากนั้นสั่งรัน:
```bash
docker compose --profile plugin up -d
```
- เปิดหน้าเว็บ [http://localhost:5173](http://localhost:5173) (หรือ IP ของ VM เช่น `http://192.168.x.x:5173`)
- มุมขวาบนจะแสดง: **`● Plugin: Shipping Tracker [Tag: P1] (Active)`**
- สั่งซื้อสินค้า จะได้รับผลลัพธ์:
  > `🚚 [Tag: P1 Standard Post] Thailand Post (Standard Postal) Tracking: STD-xxxxxx`

---

### ขั้นตอนที่ 2: สลับไปใช้ Tag P2 (Smart Express AI Algorithm)
วิธีสลับมี 2 วิธีง่ายๆ:

#### วิธีที่ A (ผ่านไฟล์ `.env` - แนะนำ):
เปิดไฟล์ `.env` แล้วเปลี่ยนบรรทัด `PLUGIN_TAG`:
```env
PLUGIN_TAG=p2
```
แล้วสั่งรันให้ Docker สลับ Image Container:
```bash
docker compose --profile plugin up -d shipping-plugin
```

#### วิธีที่ B (แก้ใน `docker-compose.yml` โดยตรง):
ในไฟล์ `docker-compose.yml` บรรทัดของ `shipping-plugin`:
```yaml
  shipping-plugin:
    image: shipping-plugin:p2    # เปลี่ยนจาก p1 เป็น p2
```
แล้วสั่ง:
```bash
docker compose --profile plugin up -d shipping-plugin
```

- กลับมาที่หน้าเว็บ (กด Refresh หนึ่งครั้ง):
- มุมขวาบนจะเปลี่ยนเป็น: **`● Plugin: Shipping Tracker [Tag: P2] (Active)`** ทันที
- เมื่อสั่งซื้อสินค้า จะได้รับผลลัพธ์ของ Algorithm P2 ทันที:
  > `⚡ [Tag: P2 Smart Express] Kerry Express (Next-Day Air) Tracking: VIP-EXP-xxxxxx`

---

### ขั้นตอนที่ 3: สั่ง "ปิดปลั๊กอินโชว์" เพื่อแสดงว่าระบบยังรันได้ปกติ (No Error)
```bash
docker compose stop shipping-plugin shipping-db
```
- หน้าเว็บจะเปลี่ยนป้ายสถานะเป็น: **`○ Plugin: Offline (Standard Mode)`**
- สั่งซื้อสินค้าได้ปกติ สถานะอัปเดตเป็น `PAID` ผ่าน RabbitMQ ตามปกติโดย**ไม่มีข้อผิดพลาดใดๆ (Graceful Degradation)**

---

### คำสั่งสำหรับ Re-build Image ทั้งสอง Tags ใหม่ (ถ้าต้องการ):
```bash
docker build --build-arg ALGO=P1 -t shipping-plugin:p1 ./services/shipping-plugin
docker build --build-arg ALGO=P2 -t shipping-plugin:p2 ./services/shipping-plugin
```
