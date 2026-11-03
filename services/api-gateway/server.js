const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 5000;

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:5001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:5002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:5003';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:5004';
const SHIPPING_SERVICE_URL = process.env.SHIPPING_SERVICE_URL || 'http://shipping-plugin:5005';

app.use(cors());

// Serve static slip uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Gateway Overview / Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    gateway: 'API Gateway',
    services: {
      auth: AUTH_SERVICE_URL,
      product: PRODUCT_SERVICE_URL,
      order: ORDER_SERVICE_URL,
      payment: PAYMENT_SERVICE_URL,
      shippingPlugin: SHIPPING_SERVICE_URL
    }
  });
});

// Proxy routes using function pathFilter
// 1. Auth routes -> Auth Service
app.use(
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api/register') || pathname.startsWith('/api/login')
  })
);

// 2. Product routes -> Product Service
app.use(
  createProxyMiddleware({
    target: PRODUCT_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api/products')
  })
);

// 3. Order routes -> Order Service
app.use(
  createProxyMiddleware({
    target: ORDER_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api/checkout') || pathname.startsWith('/api/orders')
  })
);

// 4. Payment routes -> Payment Service
app.use(
  createProxyMiddleware({
    target: PAYMENT_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api/payments')
  })
);

// 5. Plugin: Shipping & Tracking Service (With Graceful Fallback if plugin is turned off)
app.use(
  createProxyMiddleware({
    target: SHIPPING_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api/shipping'),
    on: {
      error: (err, req, res) => {
        // Graceful degradation when plugin is stopped or not running
        if (!res.headersSent) {
          res.status(200).json({
            pluginActive: false,
            message: 'Shipping plugin is currently offline / disabled',
            shipments: []
          });
        }
      }
    }
  })
);

app.listen(PORT, () => {
  console.log(`[API Gateway] Running on port ${PORT}`);
  console.log(`Routing /api/register & /api/login -> ${AUTH_SERVICE_URL}`);
  console.log(`Routing /api/products -> ${PRODUCT_SERVICE_URL}`);
  console.log(`Routing /api/checkout & /api/orders -> ${ORDER_SERVICE_URL}`);
  console.log(`Routing /api/payments -> ${PAYMENT_SERVICE_URL}`);
  console.log(`Routing /api/shipping -> ${SHIPPING_SERVICE_URL} (Plugin)`);
});
