const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { authMiddleware, ownerMiddleware } = require('./middleware/auth');

const app = express();
const port = 3000;
app.use(express.static('public'));
// ตั้งค่า database
const db = new sqlite3.Database('./database/users.db');

// ตั้งค่า session
app.use(session({
    secret: 'myboy',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60, // 1 ชั่วโมง
    }
}));

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

// แจ้งชำระ
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

    let query = '';
    let params = [];

    if (userRole === 'user') {
        query = `
            SELECT 
                payment_history.*, 
                users.username AS tenant_name 
            FROM 
                payment_history
            JOIN 
                rental_contracts ON payment_history.contract_id = rental_contracts.contract_id
            JOIN 
                users ON rental_contracts.tenant_id = users.user_id
            WHERE 
                rental_contracts.tenant_id = ?`;
        params = [tenantId];
    } else if (userRole === 'owner') {
        query = `
            SELECT 
                payment_history.*, 
                users.username AS tenant_name 
            FROM 
                payment_history
            JOIN 
                rental_contracts ON payment_history.contract_id = rental_contracts.contract_id
            JOIN 
                users ON rental_contracts.tenant_id = users.user_id`;
        params = [];
    }

    db.all(query, params, (err, payments) => {
        if (err) {
            console.error("Database error: ", err); // เพิ่มการพิมพ์ error จากฐานข้อมูล
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน');
        }
        res.render('payment-history', { payments, role: userRole });
    });
});
// // จัดการห้อง
app.get('/rooms', authMiddleware, ownerMiddleware, (req, res) => {
    const userRole = req.session.user?.role;

    if (userRole !== 'owner') {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
    }

    // ดึงข้อมูลห้องพักจากฐานข้อมูล
    const query = 'SELECT * FROM rooms';
    db.all(query, [], (err, rooms) => {
        if (err) {
            console.error("Database error: ", err);
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลห้องพัก');
        }

        res.render('room', { rooms, role: userRole }); // ส่ง role ไปยัง EJS
    });
});
// เพิ่มห้อง
app.post('/add-room', (req, res) => {
    const { price_per_month, internet_conditioner, air_conditioner } = req.body;

    // ถ้าไม่ได้ติ๊ก จะเก็บเป็น 0
    const internetConditionerValue = internet_conditioner ? 1 : 0;
    const airConditionerValue = air_conditioner ? 1 : 0;

    const query = `INSERT INTO rooms (price_per_month, internet_conditioner, air_conditioner, tenant_id, status) 
                   VALUES (?, ?, ?, 0, ?)`;

    const params = [price_per_month, internetConditionerValue, airConditionerValue, 'Available'];

    db.run(query, params, function (err) {
        if (err) {
            console.error('Error inserting room: ', err);
            return res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มห้อง');
        }
        res.redirect('/rooms');
    });
});
// อัพเดทห่้อง
app.post('/update-room', (req, res) => {
    const { room_id, price_per_month, internet_conditioner, air_conditioner, status } = req.body;

    const internetConditionerValue = internet_conditioner ? 1 : 0;
    const airConditionerValue = air_conditioner ? 1 : 0;

    let query = `UPDATE rooms SET price_per_month = ?, internet_conditioner = ?, air_conditioner = ?, status = ?`;
    const params = [price_per_month, internetConditionerValue, airConditionerValue, status];

    // ถ้าสถานะเป็น "ว่าง" ให้ตั้ง tenant_id เป็น 0
    if (status === "Available") {
        query += `, tenant_id = 0`;
    }

    query += ` WHERE room_id = ?`;
    params.push(room_id);

    db.run(query, params, function (err) {
        if (err) {
            console.error('Error updating room: ', err);
            return res.status(500).send('เกิดข้อผิดพลาดในการแก้ไขข้อมูลห้อง');
        }
        res.redirect('/rooms');
    });
});

// ลบห้อง
app.get('/delete-room/:room_id', (req, res) => {
    const roomId = req.params.room_id;

    // ลบห้องจากฐานข้อมูล
    const query = `DELETE FROM rooms WHERE room_id = ?`;
    const params = [roomId];

    db.run(query, params, function (err) {
        if (err) {
            console.error('Error deleting room: ', err);
            return res.status(500).send('เกิดข้อผิดพลาดในการลบข้อมูลห้อง');
        }
        res.redirect('/rooms');  // กลับไปที่หน้าแสดงห้อง
    });
});
// ห้องสำหรับจอง
app.get('/book', authMiddleware, (req, res) => {
    const userRole = req.session.user?.role;

    if (userRole !== 'user') {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
    }

    // ดึงข้อมูลห้องพักจากฐานข้อมูล
    const query = 'SELECT * FROM rooms';
    db.all(query, [], (err, rooms) => {
        if (err) {
            console.error("Database error: ", err);
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลห้องพัก');
        }

        res.render('booking', { rooms, role: userRole }); // ส่ง role ไปยัง EJS
    });
});
// จองห้อง
app.get('/booking-room/:room_id', (req, res) => {
    const roomId = req.params.room_id;
    const tenantId = req.session.user?.user_id;

    if (!tenantId) {
        return res.status(403).send('คุณต้องล็อกอินเพื่อจองห้อง');
    }

    // วันที่เริ่มต้นและสิ้นสุดสัญญา (ตัวอย่าง: เริ่มวันนี้ + 1 ปี)
    const startDate = new Date().toISOString().split('T')[0]; 
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    const endDateFormatted = endDate.toISOString().split('T')[0];

    // เริ่ม transaction เพื่อให้ทั้งสองคำสั่งทำงานพร้อมกัน
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // อัปเดตสถานะห้อง
        const updateRoomQuery = `
            UPDATE rooms
            SET tenant_id = ?, status = 'Rented'
            WHERE room_id = ? AND status = 'Available'
        `;

        db.run(updateRoomQuery, [tenantId, roomId], function (err) {
            if (err) {
                console.error("Error booking room: ", err);
                db.run("ROLLBACK");
                return res.status(500).send('เกิดข้อผิดพลาดในการจองห้อง');
            }

            // เพิ่มสัญญาเช่า
            const insertContractQuery = `
                INSERT INTO rental_contracts (tenant_id, room_id, start_date, end_date, status)
                VALUES (?, ?, ?, ?, 'Active')
            `;

            db.run(insertContractQuery, [tenantId, roomId, startDate, endDateFormatted], function (err) {
                if (err) {
                    console.error("Error creating rental contract: ", err);
                    db.run("ROLLBACK");
                    return res.status(500).send('เกิดข้อผิดพลาดในการสร้างสัญญาเช่า');
                }

                db.run("COMMIT");
                res.redirect('/book');
            });
        });
    });
});

// แจ้งซ้อม
app.get('/request', authMiddleware, (req, res) => {
    const tenantId = req.session.user?.user_id;
    const userRole = req.session.user?.role;

    let query = '';
    let params = [];

    if (userRole === 'user') {
        query = `
            SELECT 
                repair_requests.request_id,
                users.username AS tenant_name,
                repair_requests.room_id,
                repair_requests.description,
                repair_requests.status
            FROM 
                repair_requests
            JOIN 
                users ON repair_requests.tenant_id = users.user_id
            WHERE 
                repair_requests.tenant_id = ?`;
        params = [tenantId];
    } else if (userRole === 'owner') {
        query = `
            SELECT 
                repair_requests.request_id,
                users.username AS tenant_name,
                repair_requests.room_id,
                repair_requests.description,
                repair_requests.status
            FROM 
                repair_requests
            JOIN 
                users ON repair_requests.tenant_id = users.user_id`;
        params = [];
    }

    db.all(query, params, (err, repairRequests) => {
        if (err) {
            console.error("Database error: ", err);
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลแจ้งซ่อม');
        }

        res.render('request', { repairRequests, role: userRole });
    });
});

// การแจ้งปัญหาซ่อม
app.post('/request-problem', (req, res) => {
    const { description } = req.body;

    const tenantId = req.session.user?.user_id;

    const stmt = db.prepare('INSERT INTO repair_requests (tenant_id, room_id, description, status) VALUES (?, ?, ?, ?)');
    stmt.run(tenantId, tenantId, description, 'Waiting', (err) => {
        if (err) {
            console.error(err.message);
        }
        res.redirect('/request');
    });
});
// ลบปัญหา
app.get('/delete-problem/:request_id', (req, res) => {
    const requestId = req.params.request_id;

    // ลบห้องจากฐานข้อมูล
    const query = `DELETE FROM repair_requests WHERE request_id = ?`;
    const params = [requestId];

    db.run(query, params, function (err) {
        if (err) {
            console.error('Error deleting room: ', err);
            return res.status(500).send('เกิดข้อผิดพลาดในการลบข้อมูลห้อง');
        }
        res.redirect('/request');
    });
});


// เริ่มต้น server
app.listen(port, () => {
    console.log(`Server กำลังทำงานที่ http://localhost:${port}`);
});