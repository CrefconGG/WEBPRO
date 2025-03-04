const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { authMiddleware, ownerMiddleware } = require('./middleware/auth');

const app = express();
const port = 3000;

// ตั้งค่า database
const db = new sqlite3.Database('./database/users.db');

// ตั้งค่า session
app.use(
    session({
        secret: 'secret-key',
        resave: false,
        saveUninitialized: true,
    })
);

// ตั้งค่า EJS และ middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// หน้าแรก
app.get('/', (req, res) => {
    res.redirect('/login');
});

// เส้นทางแสดงหน้า login
app.get('/login', (req, res) => {
    const message = req.query.message;
    res.render('login', { message });
});

// เส้นทางหลังจาก login สำเร็จ
app.get('/index', authMiddleware, (req, res) => {
    const role = req.session.user?.role || 'user'; // รับ role จาก session
    res.render('index', { role });
});

// เส้นทางเฉพาะ Owner
app.get('/owner-dashboard', authMiddleware, ownerMiddleware, (req, res) => {
    const role = req.session.user?.role || 'user'; // รับ role จาก session
    res.render('owner-dashboard', { role });
});

// เส้นทางจัดการ login
app.post('/login', (req, res) => {
    const { identifier, password } = req.body;

    db.get(
        `SELECT * FROM users WHERE (username = ? OR email = ?)`,
        [identifier, identifier],
        (err, user) => {
            if (err) return res.status(500).send('เกิดข้อผิดพลาดในระบบ');
            if (user) {
                bcrypt.compare(password, user.password, (err, result) => {
                    if (result) {
                        req.session.user = user;
                        if (user.role === 'owner') {
                            res.redirect('/owner-dashboard');
                        } else {
                            res.redirect('/index');
                        }
                    } else {
                        res.send('รหัสผ่านไม่ถูกต้อง');
                    }
                });
            } else {
                res.send('ชื่อผู้ใช้/อีเมล ไม่ถูกต้อง');
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
    const { username, email, phone, password, role } = req.body;

    db.get(
        `SELECT * FROM users WHERE username = ? OR email = ?`,
        [username, email],
        (err, row) => {
            if (err) return res.status(500).send('เกิดข้อผิดพลาดในระบบ');
            if (row) return res.send('ชื่อผู้ใช้หรืออีเมลซ้ำ!');

            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).send('เกิดข้อผิดพลาดในการแฮชรหัสผ่าน');

                db.run(
                    `INSERT INTO users (username, email, phone, password, role) VALUES (?, ?, ?, ?, ?)`,
                    [username, email, phone, hash, role || 'user'],
                    (err) => {
                        if (err) return res.status(500).send('เกิดข้อผิดพลาดในการลงทะเบียน');
                        res.redirect('/login');
                    }
                );
            });
        }
    );
});

// เส้นทาง logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('เกิดข้อผิดพลาดในการออกจากระบบ');
        }
        res.redirect('/login');
    });
});

// จองห้องพัก
app.get('/booking', authMiddleware, (req, res) => {
    const role = req.session.user?.role || 'user'; // รับ role จาก session
    res.render('booking', { role });
});

// ------------------------------------------------- 66070257 ------------------------------------------------- //

app.get('/edit_room', (req, res) => {
    res.render('edit_room');
});

// เริ่มต้น server
app.listen(port, () => {
    console.log(`Server กำลังทำงานที่ http://localhost:${port}`);
});