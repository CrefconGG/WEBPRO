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
        return res.status(403).redirect('/login');
    }
};

module.exports = { authMiddleware, ownerMiddleware };
