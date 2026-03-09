const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dns = require('dns');
require('dotenv').config();

// หากเครื่องไม่สามารถ resolve DNS ของ MongoDB Atlas ได้ (เช่น DNS ในเครือข่ายบล็อก)
// ให้บังคับใช้ public DNS servers (Google/Cloudflare) เพื่อให้เชื่อม Atlas ได้
dns.setServers(['8.8.8.8', '1.1.1.1']);
console.log('DEBUG: URI is', process.env.MONGODB_URI); // ลองรันแล้วดูว่าค่าขึ้นไหม

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // ให้เข้าถึงไฟล์ในโฟลเดอร์ public ได้
app.use('/Assets', express.static('Assets')); // ให้เข้าถึงรูปภาพได้

// Local JSON fallback storage (used if MongoDB is unavailable)
const fs = require('fs');
const dataFilePath = path.join(__dirname, 'data', 'players.json');
let fileStore = {};
let useMongoDB = false;

function ensureDataFile() {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(dataFilePath)) {
        fs.writeFileSync(dataFilePath, JSON.stringify({}), 'utf8');
    }
}

function loadFileStore() {
    try {
        ensureDataFile();
        const raw = fs.readFileSync(dataFilePath, 'utf8');
        fileStore = raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error('❌ Failed to load local storage file:', err);
        fileStore = {};
    }
}

function saveFileStore() {
    try {
        ensureDataFile();
        fs.writeFileSync(dataFilePath, JSON.stringify(fileStore, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ Failed to save local storage file:', err);
    }
}

// โหลดข้อมูลจากไฟล์สำรอง (ใช้งานได้แม้ MongoDB จะไม่พร้อม)
loadFileStore();

// เชื่อมต่อ MongoDB (ใช้ URL จาก .env หรือใส่ตรงๆ เพื่อทดสอบ)
// - ถ้าใช้ MongoDB Atlas ให้ใส่ MONGODB_URI ในไฟล์ .env
// - ถ้าใช้ MongoDB ท้องถิ่น ให้แน่ใจว่า mongod กำลังรันอยู่ (พอร์ต 27017)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/farming_game';

mongoose.set('strictQuery', false);

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    useMongoDB = true; // เปิดใช้ MongoDB
})
.catch(err => {
    console.error("❌ MongoDB connection failed, using local JSON storage");
    console.error(err.message);
    useMongoDB = false;
});

// กำหนดโครงสร้างข้อมูล (Schema)
const PlayerSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    coins: Number,
    playTimeSeconds: Number,
    inventory: Object, // เก็บ { 'crinum': 5, 'pinus': 2 }
    plots: Array       // เก็บ [ { state: 'watered', type: 'crinum', growthStage: 2 }, ... ]
});

const Player = mongoose.model('Player', PlayerSchema);

async function savePlayerData(userId, data) {
    if (useMongoDB) {
        await Player.findOneAndUpdate({ userId }, data, { upsert: true });
    } else {
        fileStore[userId] = data;
        saveFileStore();
    }
}

async function loadPlayerData(userId) {
    if (useMongoDB) {
        return Player.findOne({ userId });
    }
    return fileStore[userId] || null;
}

// API สำหรับ Save
app.post('/api/save', async (req, res) => {
    try {
        const { userId, data } = req.body;
        await savePlayerData(userId, data);
        res.json({ message: "Saved successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API สำหรับ Load
app.get('/api/load/:userId', async (req, res) => {
    try {
        const player = await loadPlayerData(req.params.userId);
        res.json(player);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));