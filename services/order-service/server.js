const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5003;
const JWT_SECRET = process.env.JWT_SECRET || 'my_secret_key_123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://order-db:27017/order_db';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

app.use(cors());
app.use(express.json());

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Order Schema (Order Database)
const orderSchema = new mongoose.Schema({
  username: { type: String, required: true },
  items: { type: Array, required: true },
  totalAmount: { type: Number, required: true },
  slipPath: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'CANCELLED'], default: 'PENDING' },
  transactionRef: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Connect to Order Database
mongoose.connect(MONGO_URI)
  .then(() => console.log('[Order Service] Connected to Order Database (MongoDB)'))
  .catch(err => console.error('[Order Service] DB Connection Error:', err));

// RabbitMQ Channel & Consumer
let channel = null;

async function connectRabbitMQ() {
  while (!channel) {
    try {
      console.log('[Order Service] Connecting to RabbitMQ at', RABBITMQ_URL);
      const connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      // Ensure exchange & queues
      await channel.assertQueue('order.created', { durable: true });
      await channel.assertExchange('payment_exchange', 'fanout', { durable: true });

      // Dedicated queue for Order Service bound to payment_exchange
      const q = await channel.assertQueue('order_payment_queue', { durable: true });
      await channel.bindQueue(q.queue, 'payment_exchange', '');

      console.log('[Order Service] Connected to RabbitMQ successfully. Listening for payment events...');

      // Listen for payment completion from fanout exchange
      channel.consume(q.queue, async (msg) => {
        if (msg !== null) {
          try {
            const data = JSON.parse(msg.content.toString());
            console.log('[Order Service] [RabbitMQ] Received payment event for orderId:', data.orderId);

            await Order.findByIdAndUpdate(data.orderId, {
              status: data.paymentStatus || 'PAID',
              transactionRef: data.transactionRef
            });

            console.log(`[Order Service] Order ${data.orderId} status updated to ${data.paymentStatus}`);
            channel.ack(msg);
          } catch (consumeErr) {
            console.error('[Order Service] Error processing payment message:', consumeErr);
            channel.nack(msg, false, false);
          }
        }
      });
      break;
    } catch (err) {
      console.error('[Order Service] RabbitMQ Connection failed, retrying in 4s...', err.message);
      await new Promise(res => setTimeout(res, 4000));
    }
  }
}
connectRabbitMQ();

// Auth Middleware
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

// Checkout API
app.post('/api/checkout', authenticateToken, upload.single('slip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a payment slip' });
    }

    const cartItems = JSON.parse(req.body.cartItems || '[]');
    const totalAmount = Number(req.body.totalAmount);

    const slipPath = 'uploads/' + path.basename(req.file.path);

    // 1. Save new Order in Order Database with status 'PENDING'
    const newOrder = new Order({
      username: req.user.username,
      items: cartItems,
      totalAmount,
      slipPath,
      status: 'PENDING'
    });
    await newOrder.save();
    console.log(`[Order Service] Order saved in DB: ${newOrder._id} (Status: PENDING)`);

    // 2. Publish order.created event to RabbitMQ
    if (channel) {
      const orderPayload = {
        orderId: newOrder._id.toString(),
        username: req.user.username,
        totalAmount,
        slipPath,
        itemsCount: cartItems.length,
        createdAt: newOrder.createdAt
      };

      channel.sendToQueue('order.created', Buffer.from(JSON.stringify(orderPayload)), {
        persistent: true
      });
      console.log(`[Order Service] [RabbitMQ] Published order.created event for orderId: ${newOrder._id}`);
    } else {
      console.warn('[Order Service] RabbitMQ channel not ready; message not sent');
    }

    res.status(201).json({
      message: 'Order submitted successfully!',
      orderId: newOrder._id,
      status: newOrder.status
    });
  } catch (err) {
    console.error('[Order Service] Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Orders API
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ username: req.user.username }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    service: 'order-service',
    status: 'UP',
    rabbitmq: channel ? 'CONNECTED' : 'DISCONNECTED'
  });
});

app.listen(PORT, () => {
  console.log(`[Order Service] Running on port ${PORT}`);
});
