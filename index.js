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
                            res.redirect('/index');
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

// เส้นทางแสดงรายการชำระเงิน
app.get('/payment', authMiddleware, (req, res) => {
    const tenantId = req.session.user?.user_id;
    
    db.all(
        `SELECT * FROM payments WHERE contract_id IN (SELECT contract_id FROM rental_contracts WHERE tenant_id = ?)`,
        [tenantId],
        (err, payments) => {
            if (err) {
                return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน');
            }
            res.render('payment', { payments, role: req.session.user.role });
        }
    );
});

// เส้นทางจัดการการชำระเงิน
app.post('/payment/pay', authMiddleware, (req, res) => {
    const { payment_id } = req.body;
    db.run(
        `UPDATE payments SET status = 'Waiting' WHERE payment_id = ?`,
        [payment_id],
        (err) => {
            if (err) {
                return res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตสถานะการชำระเงิน');
            }
            res.redirect('/payment');
        }
    );
});

// เส้นทางสำหรับเจ้าของเพิ่มรายการชำระ
app.get('/notify-rent', authMiddleware, ownerMiddleware, (req, res) => {
    if (req.session.user?.role !== 'owner') {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
    }
    
    db.all('SELECT * FROM payments WHERE status = "Waiting"', (err, payments) => {
        if (err) {
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน');
        }
        res.render('notify-rent', { role: req.session.user?.role, payments });
    });
});

app.post('/notify-rent', authMiddleware, ownerMiddleware, (req, res) => {
    const { contract_id, amount, electricity_bill, water_bill, payment_date } = req.body;

    if (req.session.user?.role !== 'owner') {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
    }

    db.run(
        `INSERT INTO payments (contract_id, amount, electricity_bill, water_bill, payment_date, status) 
         VALUES (?, ?, ?, ?, ?, 'Pending')`,
        [contract_id, amount, electricity_bill, water_bill, payment_date],
        (err) => {
            if (err) {
                return res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มข้อมูลการแจ้งค่าใช้จ่าย');
            }
            res.redirect('/notify-rent');
        }
    );
});

// ย้ายการชำระเงินไปยังตาราง archived_payments
app.post('/archive-payment', authMiddleware, ownerMiddleware, (req, res) => {
    const { payment_id } = req.body;

    if (req.session.user?.role !== 'owner') {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
    }

    // ดึงข้อมูลการชำระเงินจาก payments
    db.get('SELECT * FROM payments WHERE payment_id = ? AND status = "Waiting"', [payment_id], (err, payment) => {
        if (err) {
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน');
        }

        if (!payment) {
            return res.status(404).send('ไม่พบการชำระเงินที่ต้องการ');
        }

        // ย้ายข้อมูลไปยัง payment_history
        const { payment_id, contract_id, amount, electricity_bill, water_bill, payment_date, status } = payment;
        db.run('INSERT INTO payment_history (payment_id, contract_id, amount, electricity_bill, water_bill, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [payment_id, contract_id, amount, electricity_bill, water_bill, payment_date, 'Complete'], (err) => {
                if (err) {
                    return res.status(500).send('เกิดข้อผิดพลาดในการย้ายข้อมูล');
                }

                // ลบข้อมูลจาก payments หลังจากย้ายสำเร็จ
                db.run('DELETE FROM payments WHERE payment_id = ? AND status = "Waiting"', [payment_id], (err) => {
                    if (err) {
                        return res.status(500).send('เกิดข้อผิดพลาดในการลบข้อมูลการชำระเงิน');
                    }
                    res.redirect('/notify-rent');
                });
            });
    });
});
// ประวัติการชำระ
app.get('/payment-history', authMiddleware, (req, res) => {
    const tenantId = req.session.user?.user_id;
    const userRole = req.session.user?.role;

    // ตรวจสอบว่า user มี tenantId และ role หรือไม่
    if (!tenantId || !userRole) {
        return res.status(400).send('ข้อมูลผู้ใช้ไม่ถูกต้อง');
    }

    // เช็คหากเป็น user หรือ owner ก็สามารถดึงข้อมูลได้
    let query = '';
    let params = [];

    if (userRole === 'user') {
        query = `SELECT * FROM payment_history WHERE contract_id IN (SELECT contract_id FROM rental_contracts WHERE tenant_id = ?)`;
        params = [tenantId];
    } else if (userRole === 'owner') {
        query = `SELECT * FROM payment_history`;
        params = [];
    }

    console.log("Query: ", query); // เพิ่มการพิมพ์ query ที่ใช้งาน
    console.log("Params: ", params); // เพิ่มการพิมพ์ parameters ที่ใช้

    db.all(query, params, (err, payments) => {
        if (err) {
            console.error("Database error: ", err); // เพิ่มการพิมพ์ error จากฐานข้อมูล
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน');
        }

        if (!payments) {
            return res.status(404).send('ไม่พบข้อมูลการชำระเงิน');
        }

        res.render('payment-history', { payments, role: userRole });
    });
});

// เริ่มต้น server
app.listen(port, () => {
    console.log(`Server กำลังทำงานที่ http://localhost:${port}`);
});