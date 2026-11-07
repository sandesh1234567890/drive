const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');
const blacklistTokenModel = require('../models/blacklistToken.model');
const captainModel = require('../models/captain.model');


module.exports.authUser = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const isBlacklisted = await blacklistTokenModel.findOne({ token: token });
    if (isBlacklisted) {
        res.status(401).json({ message: 'Unauthorized, Token expired!!' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded._id);
        req.user = user;
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

module.exports.authCaptain = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const isBlacklisted = await blacklistTokenModel.findOne({ token: token });
    if (isBlacklisted) {
        res.status(401).json({ message: 'Unauthorized, Token expired!!' });
        return;
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // //console.log("decoded ", decoded);
        const captain = await captainModel.findById(decoded._id);
        req.captain = captain;
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

// Accepts EITHER a rider token or a captain token.
// Sets req.user and/or req.captain so shared endpoints
// (cancel / rate / trip detail) can tell which side called.
module.exports.authEither = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const isBlacklisted = await blacklistTokenModel.findOne({ token: token });
    if (isBlacklisted) {
        return res.status(401).json({ message: 'Unauthorized, Token expired!!' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [user, captain] = await Promise.all([
            userModel.findById(decoded._id),
            captainModel.findById(decoded._id),
        ]);
        if (!user && !captain) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (user) req.user = user;
        if (captain) req.captain = captain;
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}