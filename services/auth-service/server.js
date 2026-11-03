const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'my_secret_key_123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://auth-db:27017/auth_db';

app.use(cors());
app.use(express.json());

// User Schema (Auth Database)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Connect to Auth Database
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('[Auth Service] Connected to Auth Database (MongoDB)');
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({ username: 'user1', password: 'password123' });
      console.log('[Auth Service] Default user seeded: user1 / password123');
    }
  })
  .catch(err => console.error('[Auth Service] DB Connection Error:', err));

// Register API
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Please provide both username and password' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const newUser = new User({ username, password });
    await newUser.save();
    console.log(`[Auth Service] New user registered: ${username}`);
    res.status(201).json({ message: 'User registered successfully! You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login API
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username and password' });
    }

    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '2h' });
    console.log(`[Auth Service] User logged in: ${username}`);
    return res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'auth-service', status: 'UP' });
});

app.listen(PORT, () => {
  console.log(`[Auth Service] Running on port ${PORT}`);
});

