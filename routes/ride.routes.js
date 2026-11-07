const express = require('express');
const router = express.Router();
const rideController = require('../controllers/ride.controller');
const { body, query } = require('express-validator');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/create',
    authMiddleware.authUser,
    body('pickup').isString().notEmpty().isLength({ min: 3 }).withMessage('Invalid Pickup Address'),
    body('destination').isString().notEmpty().isLength({ min: 3 }).withMessage('Invalid Destination Address'),
    body('vehicle').isString().notEmpty().isIn(['auto', 'car', 'moto', 'premier', 'sedan', 'xl']).withMessage('Invalid Vehicle Type'),
    rideController.createRide
)

router.post('/confirm',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    rideController.confirmRide
)

router.get('/start-ride',
    authMiddleware.authCaptain,
    query('rideId').isMongoId().withMessage('Invalid ride id'),
    query('otp').isString().isLength({ min: 6, max: 6 }).withMessage('Invalid OTP'),
    rideController.startRide
)

router.post('/end-ride',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    rideController.endRide
)

router.get('/history',
    authMiddleware.authUser,
    rideController.getUserHistory
)

router.get('/captain-history',
    authMiddleware.authCaptain,
    rideController.getCaptainHistory
)

// Trip detail / receipt — either side can fetch its own ride
router.get('/:rideId',
    authMiddleware.authEither,
    rideController.getRideDetail
)

// Cancel a ride — fee rules applied server-side
router.post('/cancel',
    authMiddleware.authEither,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    rideController.cancelRide
)

// Rate + tip a completed ride
router.post('/rate',
    authMiddleware.authEither,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('tip').optional().isInt({ min: 0 }).withMessage('Tip must be 0 or more'),
    rideController.rateRide
)

module.exports = router;
