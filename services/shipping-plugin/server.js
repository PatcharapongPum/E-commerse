const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5005;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://shipping-db:27017/shipping_db';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const ALGORITHM_VERSION = (process.env.ALGORITHM_VERSION || 'P1').toUpperCase();

app.use(cors());
app.use(express.json());

console.log(`[Shipping Plugin] Booting with Algorithm Version: [${ALGORITHM_VERSION}]`);

// Shipment Schema (Dedicated Shipping Database)
const shipmentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  username: { type: String },
  courier: { type: String, required: true },
  trackingNumber: { type: String, required: true },
  shippingStatus: { type: String, required: true },
  algorithm: { type: String, required: true, default: ALGORITHM_VERSION },
  estimatedDelivery: { type: Date, required: true },
  dispatchedAt: { type: Date, default: Date.now }
});
const Shipment = mongoose.model('Shipment', shipmentSchema);

// Connect to Shipping Database
mongoose.connect(MONGO_URI)
  .then(() => console.log('[Shipping Plugin] Connected to Shipping Database (MongoDB)'))
  .catch(err => console.error('[Shipping Plugin] DB Connection Error:', err));

// RabbitMQ Consumer for Payment Completed Events via Fanout Exchange
let channel = null;

async function connectRabbitMQ() {
  while (!channel) {
    try {
      console.log('[Shipping Plugin] Connecting to RabbitMQ at', RABBITMQ_URL);
      const connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      // Ensure exchange exists
      await channel.assertExchange('payment_exchange', 'fanout', { durable: true });

      // Dedicated queue for Shipping Plugin bound to payment_exchange
      const q = await channel.assertQueue('shipping_payment_queue', { durable: true });
      await channel.bindQueue(q.queue, 'payment_exchange', '');

      console.log(`[Shipping Plugin] Connected to RabbitMQ. Listening for payment events (Algorithm: ${ALGORITHM_VERSION})...`);

      channel.consume(q.queue, async (msg) => {
        if (msg !== null) {
          try {
            const data = JSON.parse(msg.content.toString());
            console.log('[Shipping Plugin] [RabbitMQ] Order payment confirmed. Creating shipment for orderId:', data.orderId);

            const existing = await Shipment.findOne({ orderId: data.orderId });
            if (!existing) {
              let courier, trackingNumber, deliveryDays, shippingStatus;

              if (ALGORITHM_VERSION === 'P2') {
                // Algorithm P2: Smart Express AI Logistics (Next-Day Air)
                courier = 'Kerry Express (Next-Day Air)';
                trackingNumber = 'VIP-EXP-' + Math.floor(100000 + Math.random() * 900000);
                deliveryDays = 1;
                shippingStatus = 'NEXT_DAY_EXPRESS';
              } else {
                // Algorithm P1: Standard Economy Logistics
                courier = 'Thailand Post (Standard Postal)';
                trackingNumber = 'STD-' + Math.floor(100000 + Math.random() * 900000);
                deliveryDays = 3;
                shippingStatus = 'STANDARD_SHIPPING';
              }

              const estimatedDelivery = new Date();
              estimatedDelivery.setDate(estimatedDelivery.getDate() + deliveryDays);

              const newShipment = new Shipment({
                orderId: data.orderId,
                username: data.username,
                courier,
                trackingNumber,
                shippingStatus,
                algorithm: ALGORITHM_VERSION,
                estimatedDelivery,
                dispatchedAt: new Date()
              });
              await newShipment.save();
              console.log(`[Shipping Plugin] [Algorithm ${ALGORITHM_VERSION}] Shipment created: ${courier} (${trackingNumber})`);
            }

            channel.ack(msg);
          } catch (err) {
            console.error('[Shipping Plugin] Error handling message:', err);
            channel.nack(msg, false, false);
          }
        }
      });
      break;
    } catch (err) {
      console.error('[Shipping Plugin] RabbitMQ connection failed, retrying in 4s...', err.message);
      await new Promise(res => setTimeout(res, 4000));
    }
  }
}
connectRabbitMQ();

// APIs
// Get all shipments
app.get('/api/shipping', async (req, res) => {
  try {
    const shipments = await Shipment.find().sort({ dispatchedAt: -1 });
    res.json({
      pluginActive: true,
      algorithm: ALGORITHM_VERSION,
      algorithmName: ALGORITHM_VERSION === 'P2' ? 'P2: Smart Express AI' : 'P1: Standard Logistics',
      shipments
    });
  } catch (err) {
    res.status(500).json({ pluginActive: true, error: err.message, shipments: [] });
  }
});

// Get shipment by orderId
app.get('/api/shipping/:orderId', async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ orderId: req.params.orderId });
    if (!shipment) {
      return res.json({ pluginActive: true, found: false });
    }
    res.json({
      pluginActive: true,
      algorithm: ALGORITHM_VERSION,
      found: true,
      shipment
    });
  } catch (err) {
    res.status(500).json({ pluginActive: true, error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    service: 'shipping-plugin',
    status: 'UP',
    algorithm: ALGORITHM_VERSION,
    pluginActive: true
  });
});

app.listen(PORT, () => {
  console.log(`[Shipping Plugin] Running on port ${PORT} [Algorithm: ${ALGORITHM_VERSION}]`);
});
