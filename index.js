const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;

// ตั้งค่า database
const db = new sqlite3.Database('./users.db');

// db.run(`CREATE TABLE IF NOT EXISTS users (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     username TEXT NOT NULL,
//     email TEXT NOT NULL,
//     phone TEXT NOT NULL,
//     password TEXT NOT NULL
// )`);

// ตั้งค่า EJS และ middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index');
});

// เส้นทางแสดงหน้า login
app.get('/login', (req, res) => {
    res.render('login');
});

// เส้นทางจัดการ login
app.post('/login', (req, res) => {
    const { identifier, password } = req.body;

    db.get(
        `SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?`,
        [identifier, identifier, password],
        (err, user) => {
            if (err) {
                return res.status(500).send('เกิดข้อผิดพลาดในระบบ');
            }
            if (user) {
                res.send(`ยินดีต้อนรับ, ${user.username}!`);
            } else {
                res.send('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง');
            }
        }
    );
});

// เส้นทางแสดงหน้า register
app.get('/register', (req, res) => {
    res.render('register');
});

// เส้นทางจัดการ register
app.post('/register', (req, res) => {
    const { username, email, phone, password } = req.body;

    db.run(
        `INSERT INTO users (username, email, phone, password) VALUES (?, ?, ?, ?)`,
        [username, email, phone, password],
        (err) => {
            if (err) {
                return res.status(500).send('เกิดข้อผิดพลาดในการลงทะเบียน');
            }
            res.send('ลงทะเบียนสำเร็จ! ไปที่ <a href="/login">เข้าสู่ระบบ</a>');
        }
    );
});

// เริ่มต้น server
app.listen(port, () => {
    console.log(`Server กำลังทำงานที่ http://localhost:${port}`);
});
