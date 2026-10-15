const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('.'));
app.use(cors({ origin: process.env.SITE_URL || '*' }));

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Data load error:', err.message);
  }
  return { date: getToday(), usedIPs: [], usedUIDs: [], totalUsed: 0 };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Data save error:', err.message);
  }
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function checkAndResetDaily() {
  const data = loadData();
  const today = getToday();
  if (data.date !== today) {
    const newData = { date: today, usedIPs: [], usedUIDs: [], totalUsed: 0 };
    saveData(newData);
    console.log(`Daily reset for ${today}`);
    return newData;
  }
  return data;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() 
    || req.socket.remoteAddress 
    || 'unknown';
}

app.get('/api/slots', (req, res) => {
  const data = checkAndResetDaily();
  const clientIP = getClientIP(req);
  const MAX_SLOTS = 15;
  const slotsLeft = MAX_SLOTS - data.totalUsed;
  const userUsed = data.usedIPs.includes(clientIP);
  
  res.json({
    slots_left: Math.max(0, slotsLeft),
    total_slots: MAX_SLOTS,
    user_used: userUsed,
    date: data.date
  });
});

const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  message: { success: false, message: 'You already used today!' },
  keyGenerator: (req) => getClientIP(req)
});

app.post('/api/freelike', limiter, async (req, res) => {
  try {
    const { uid, server_name } = req.body;
    const clientIP = getClientIP(req);
    
    if (!uid || !server_name) {
      return res.status(400).json({ success: false, message: 'UID and Server required' });
    }
    
    if (!/^\d{5,15}$/.test(uid)) {
      return res.status(400).json({ success: false, message: 'Invalid UID' });
    }
    
    const data = checkAndResetDaily();
    const MAX_SLOTS = 15;
    
    if (data.totalUsed >= MAX_SLOTS) {
      return res.status(429).json({ success: false, message: 'All slots taken today!' });
    }
    
    if (data.usedIPs.includes(clientIP)) {
      return res.status(429).json({ success: false, message: 'You already used today!' });
    }
    
    if (data.usedUIDs.includes(uid)) {
      return res.status(429).json({ success: false, message: 'This UID already got likes today.' });
    }
    
    const API_KEY = process.env.MAGE_API_KEY;
    const API_URL = process.env.MAGE_API_URL;
    const url = `${API_URL}?api_key=${API_KEY}&uid=${uid}&server_name=${server_name}`;
    
    const response = await fetch(url);
    
    if (response.ok) {
      data.usedIPs.push(clientIP);
      data.usedUIDs.push(uid);
      data.totalUsed += 1;
      saveData(data);
      
      res.json({
        success: true,
        message: '30 Likes sent!',
        likes_sent: 30,
        slots_left: MAX_SLOTS - data.totalUsed
      });
    } else {
      res.status(400).json({ success: false, message: 'API error. Try again.' });
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Udith Free Likes running on port ${PORT}`);
});