const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || 'my_secret_key_123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://product-db:27017/product_db';

app.use(cors());
app.use(express.json());

// Product Schema (Product Database)
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

// Connect to Product Database
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('[Product Service] Connected to Product Database (MongoDB)');
    const count = await Product.countDocuments();
    if (count === 0) {
      await Product.insertMany([
        {
          name: 'MacBook Air M6',
          price: 34900,
          image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWMXHsM5sK5Mgb-hcWCZD1JHm0xtKS0cJWIw7lH3dPVQ&s=10'
        },
        {
          name: 'iPad Pro gen 6',
          price: 29900,
          image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNnhk2kx_NgtnItcCYq6TdpQ_rxJ5KVBi3FkLKBdiEQw&s=10'
        },
        {
          name: 'IPhone 18 super ultra galaxy pro max',
          price: 8990,
          image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjgPZP7e0FWgux8BwXR5sgZcWSYBm0w-YM6nlSuvT6BQ&s=10'
        }
      ]);
      console.log('[Product Service] Initial products seeded successfully');
    }
  })
  .catch(err => console.error('[Product Service] DB Connection Error:', err));

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

// Get all products
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'product-service', status: 'UP' });
});

app.listen(PORT, () => {
  console.log(`[Product Service] Running on port ${PORT}`);
});

