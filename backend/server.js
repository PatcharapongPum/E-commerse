const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'my_secret_key_123';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// สร้างโฟลเดอร์ uploads อัตโนมัติหากยังไม่มี
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// ตั้งค่าที่เก็บรูปสลิป (Multer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// เชื่อมต่อ MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/ecommercedb';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
    seedInitialData();
  })
  .catch(err => console.error('MongoDB Connection Error:', err));

// Database Schemas
// 1. User Schema บันทึกข้อมูลบัญชีผู้ใช้ลง MongoDB
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// 2. Product Schema
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String
});
const Product = mongoose.model('Product', productSchema);

// 3. Order Schema
const orderSchema = new mongoose.Schema({
  username: String,
  items: Array,
  totalAmount: Number,
  slipPath: String,
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// ฟังก์ชันสร้างข้อมูลเริ่มต้นลง Database หากยังว่าง
async function seedInitialData() {
  // สร้างสินค้าตัวอย่าง
  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany([
      { name: 'MacBook Air M6', price: 34900, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWMXHsM5sK5Mgb-hcWCZD1JHm0xtKS0cJWIw7lH3dPVQ&s=10' },
      { name: 'iPad Pro gen 6', price: 29900, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNnhk2kx_NgtnItcCYq6TdpQ_rxJ5KVBi3FkLKBdiEQw&s=10' },
      { name: 'IPhone 18 super ultra galaxy pro max', price: 8990, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjgPZP7e0FWgux8BwXR5sgZcWSYBm0w-YM6nlSuvT6BQ&s=10' }
    ]);
    console.log('Seeded initial products!');
  }

  // สร้างบัญชีเริ่มต้นสำหรับการทดสอบ (username: user1 / password: password123)
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    await User.create({ username: 'user1', password: 'password123' });
    console.log('Default user created: user1 / password123');
  }
}

// Middleware ตรวจสอบ Login (Auth Guard)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Please log in to continue' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token is invalid or expired' });
    req.user = user;
    next();
  });
}

// ----------------- AUTH APIS -----------------

// 1. API: Sign Up / Register (บันทึกลง MongoDB)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Please provide both username and password' });
    }

    // ตรวจสอบว่าชื่อผู้ใช้ซ้ำหรือไม่
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // บันทึก User ลงฐานข้อมูล MongoDB จริง
    const newUser = new User({ username, password });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully! You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. API: Sign In / Login (ตรวจสอบกับ MongoDB)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username and password' });
    }

    // ค้นหาผู้ใช้จาก Database
    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // ออก JWT Token เมื่อข้อมูลถูกต้อง
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- STORE APIS -----------------

// 3. API: ดึงรายการสินค้า (ต้องล็อกอินก่อนตามโจทย์)
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. API: Checkout พร้อมอัปโหลด Slip
app.post('/api/checkout', authenticateToken, upload.single('slip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a payment slip' });
    }

    const cartItems = JSON.parse(req.body.cartItems || '[]');
    const totalAmount = Number(req.body.totalAmount);

    const newOrder = new Order({
      username: req.user.username,
      items: cartItems,
      totalAmount,
      slipPath: req.file.path
    });

    await newOrder.save();
    res.status(201).json({ message: 'Order submitted successfully!', orderId: newOrder._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));