const authMiddleware = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

const ownerMiddleware = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'owner') {
        next();
    } else {
        res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
    }
};

module.exports = { authMiddleware, ownerMiddleware };
