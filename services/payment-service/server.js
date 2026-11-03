const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5004;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://payment-db:27017/payment_db';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

app.use(cors());
app.use(express.json());

// Payment Schema (Payment Database)
const paymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  username: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  slipPath: { type: String },
  paymentStatus: { type: String, enum: ['VERIFIED', 'FAILED'], default: 'VERIFIED' },
  transactionRef: { type: String, required: true },
  processedAt: { type: Date, default: Date.now }
});
const Payment = mongoose.model('Payment', paymentSchema);

// Connect to Payment Database
mongoose.connect(MONGO_URI)
  .then(() => console.log('[Payment Service] Connected to Payment Database (MongoDB)'))
  .catch(err => console.error('[Payment Service] DB Connection Error:', err));

// RabbitMQ Channel & Consumer
let channel = null;

async function connectRabbitMQ() {
  while (!channel) {
    try {
      console.log('[Payment Service] Connecting to RabbitMQ at', RABBITMQ_URL);
      const connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      // Ensure queues and fanout exchange exist
      await channel.assertQueue('order.created', { durable: true });
      await channel.assertExchange('payment_exchange', 'fanout', { durable: true });

      console.log('[Payment Service] Connected to RabbitMQ successfully. Waiting for messages in order.created...');

      // Consume order.created events
      channel.consume('order.created', async (msg) => {
        if (msg !== null) {
          try {
            const orderData = JSON.parse(msg.content.toString());
            console.log('[Payment Service] [RabbitMQ] Received order.created:', orderData);

            // Generate unique transaction reference
            const transactionRef = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

            // Record payment in Payment Database
            const paymentRecord = new Payment({
              orderId: orderData.orderId,
              username: orderData.username,
              totalAmount: orderData.totalAmount,
              slipPath: orderData.slipPath,
              paymentStatus: 'VERIFIED',
              transactionRef,
              processedAt: new Date()
            });
            await paymentRecord.save();
            console.log(`[Payment Service] Payment record saved in DB with ref: ${transactionRef}`);

            // Broadcast payment.completed event to fanout exchange
            const paymentPayload = {
              orderId: orderData.orderId,
              username: orderData.username,
              paymentStatus: 'PAID',
              transactionRef,
              processedAt: paymentRecord.processedAt
            };

            channel.publish('payment_exchange', '', Buffer.from(JSON.stringify(paymentPayload)), {
              persistent: true
            });
            console.log(`[Payment Service] [RabbitMQ] Broadcasted payment.completed via payment_exchange for orderId: ${orderData.orderId}`);

            channel.ack(msg);
          } catch (err) {
            console.error('[Payment Service] Error processing payment queue:', err);
            channel.nack(msg, false, false);
          }
        }
      });
      break;
    } catch (err) {
      console.error('[Payment Service] RabbitMQ Connection failed, retrying in 4s...', err.message);
      await new Promise(res => setTimeout(res, 4000));
    }
  }
}
connectRabbitMQ();

// Get all payments (Audit / Admin)
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await Payment.find().sort({ processedAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    service: 'payment-service',
    status: 'UP',
    rabbitmq: channel ? 'CONNECTED' : 'DISCONNECTED'
  });
});

app.listen(PORT, () => {
  console.log(`[Payment Service] Running on port ${PORT}`);
});
