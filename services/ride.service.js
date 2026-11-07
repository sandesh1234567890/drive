const rideModel = require("../models/ride.model");
const mapService = require("../services/maps.service");
const crypto = require('crypto');
const userModel = require("../models/user.model"); // Add this line to import the user model

// First, define helper functions
function getOtp(num) {
    function generateOtp(num) {
        return crypto.randomInt(Math.pow(10, num - 1), Math.pow(10, num)).toString();
    }
    return generateOtp(num);
}

// Upfront fare — Uber pricing model:
//   fare = (baseFare + bookingFee + distanceRate × km + timeRate × minutes), floored at minimumFare
// Product line matches Uber India: moto / auto / go(car) / premier
const RATES = {
    moto:    { baseFare: 20, bookingFee: 1.5, distanceRate: 8,  timeRate: 1.5, minimumFare: 25 },
    auto:    { baseFare: 30, bookingFee: 1.5, distanceRate: 10, timeRate: 2.0, minimumFare: 32 },
    car:     { baseFare: 50, bookingFee: 2.0, distanceRate: 14, timeRate: 3.0, minimumFare: 55 },
    sedan:   { baseFare: 65, bookingFee: 2.0, distanceRate: 17, timeRate: 3.5, minimumFare: 70 },
    xl:      { baseFare: 90, bookingFee: 2.5, distanceRate: 24, timeRate: 4.5, minimumFare: 95 },
    premier: { baseFare: 75, bookingFee: 2.0, distanceRate: 22, timeRate: 4.0, minimumFare: 80 },
};

const fareFor = (r, km, minutes) => {
    const subtotal = r.baseFare + r.bookingFee + r.distanceRate * km + r.timeRate * minutes;
    return Math.round(Math.max(r.minimumFare, subtotal));
};

// Define and immediately export getFare function
const getFare = async (pickup, destination) => {
    if (!pickup || !destination) {
        throw new Error('pickup and destination are required');
    }

    const distanceTime = await mapService.getDistance(pickup, destination);
    const km = (distanceTime.distance?.value || 0) / 1000;
    const minutes = (distanceTime.duration?.value || 0) / 60;

    return {
        moto: fareFor(RATES.moto, km, minutes),
        auto: fareFor(RATES.auto, km, minutes),
        car: fareFor(RATES.car, km, minutes),
        premier: fareFor(RATES.premier, km, minutes),
    };
};

// Export getFare before it's used
module.exports.getFare = getFare;

// Then define and export createRide
module.exports.createRide = async ({ user, pickup, destination, vehicle }) => {
    if (!user || !pickup || !destination || !vehicle) {
        throw new Error('All fields are required');
    }

    try {
        const latestUser = await userModel.findById(user._id); // Fetch the latest user data
        let fares;
        try {
            fares = await getFare(pickup, destination);
        } catch (fareErr) {
            console.error('Fare estimate unavailable, using fallback — ', fareErr.message);
            fares = { moto: 60, auto: 100, car: 150, sedan: 200, xl: 280, premier: 250 };
        }
        const ride = new rideModel({
            user: latestUser,
            pickup: pickup,
            destination: destination,
            otp: getOtp(6),
            fare: fares[vehicle],
            vehicle: vehicle
        });

        await ride.save();
        return ride;
    } catch (error) {
        console.error('Error creating ride:', error);
        throw new Error('Failed to create ride: ' + error.message);
    }
};

module.exports.confirmRide = async ({ rideId, captain }) => {
    if (!rideId) {
        throw new Error('Ride id is required');
    }

    await rideModel.findOneAndUpdate({
        _id: rideId
    }, {
        status: 'accepted',
        captain: captain._id,
        acceptedAt: new Date()
    });

    const ride = await rideModel.findOne({
        _id: rideId
    }).populate('user').populate('captain').select('+otp');
    //console.log("Ride id of new ride is ", rideId);

    if (!ride) {
        throw new Error('Ride not found');
    }

    // Fetch the latest user data
    const latestUser = await userModel.findById(ride.user._id);
    ride.user = latestUser;

    // Emit the ride-confirmed event to the user
    // sendMessageToSocketId(ride.user.socketId, 'ride-confirmed', ride);

    return ride;
};

module.exports.startRide = async ({ rideId, otp, captain }) => {
    if (!rideId || !otp) {
        throw new Error('Ride id and OTP are required');
    }

    const ride = await rideModel.findOne({
        _id: rideId
    }).populate('user').populate('captain').select('+otp');

    if (!ride) {
        throw new Error('Ride not found');
    }

    if (ride.status !== 'accepted') {
        throw new Error('Ride not accepted');
    }

    if (ride.otp !== otp) {
        throw new Error('Invalid OTP');
    }

    // Fetch the latest user data
    const latestUser = await userModel.findById(ride.user._id);
    ride.user = latestUser;

    await rideModel.findOneAndUpdate({
        _id: rideId
    }, {
        status: 'ongoing'
    });

    return ride;
};

module.exports.endRide = async ({ rideId, captain }) => {
    if (!rideId) {
        throw new Error('Ride id is required');
    }

    const ride = await rideModel.findOne({
        _id: rideId,
        captain: captain._id
    }).populate('user').populate('captain').select('+otp');

    if (!ride) {
        throw new Error('Ride not found');
    }

    if (ride.status !== 'ongoing') {
        throw new Error('Ride not ongoing');
    }

    // Fetch the latest user data
    const latestUser = await userModel.findById(ride.user._id);
    ride.user = latestUser;

    await rideModel.findOneAndUpdate({
        _id: rideId
    }, {
        status: 'completed'
    });

    return ride;
};

// ============================================================
// CANCELLATION — Uber-style fee rules
//   • Cancelled before a captain accepts        → ₹0
//   • Within 2 min of acceptance (free window)  → ₹0
//   • After the 2 min window                    → fee = min(₹25, 50% of fare)
//   • Once the ride has started (ongoing)       → not cancellable
// ============================================================
const CANCEL_FREE_WINDOW_MS = 2 * 60 * 1000;
const CANCEL_MAX_FEE = 25;

function cancellationFeeFor(ride, cancelledAt = new Date()) {
    if (ride.status === 'pending' || !ride.captain) return 0;
    const acceptedAt = ride.acceptedAt ? new Date(ride.acceptedAt) : cancelledAt;
    if (cancelledAt - acceptedAt < CANCEL_FREE_WINDOW_MS) return 0;
    return Math.round(Math.min(CANCEL_MAX_FEE, (ride.fare || 0) * 0.5));
}

module.exports.cancelRide = async ({ rideId, user, by = 'user' }) => {
    if (!rideId) throw new Error('Ride id is required');

    const query = by === 'captain'
        ? { _id: rideId, captain: user._id }
        : { _id: rideId, user: user._id };

    const ride = await rideModel.findOne(query).populate('captain').populate('user');
    if (!ride) throw new Error('Ride not found');

    if (ride.status === 'completed') throw new Error('Ride already completed');
    if (ride.status === 'cancelled') throw new Error('Ride already cancelled');
    if (ride.status === 'ongoing') {
        const err = new Error('Ride already started — cancellation not allowed');
        err.code = 'RIDE_STARTED';
        throw err;
    }

    const fee = cancellationFeeFor(ride);

    await rideModel.updateOne(
        { _id: rideId },
        { status: 'cancelled', cancelledBy: by, cancellationFee: fee }
    );

    ride.status = 'cancelled';
    ride.cancelledBy = by;
    ride.cancellationFee = fee;
    return ride;
};

// ============================================================
// RATINGS + TIPS — one rating per side on a completed ride
// ============================================================
module.exports.rateRide = async ({ rideId, user, by = 'user', rating, review = '', tip = 0 }) => {
    if (!rideId) throw new Error('Ride id is required');
    if (!rating || rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

    const query = by === 'captain'
        ? { _id: rideId, captain: user._id }
        : { _id: rideId, user: user._id };

    const ride = await rideModel.findOne(query).populate('captain').populate('user');
    if (!ride) throw new Error('Ride not found');
    if (ride.status !== 'completed') throw new Error('You can rate only completed rides');

    const alreadyRated = by === 'captain' ? ride.ratedBy === 'captain' : ride.ratedBy === 'user';
    if (alreadyRated) throw new Error('You have already rated this ride');

    const update = {
        rating: Math.round(rating),
        review: String(review || '').slice(0, 500),
        ratedBy: by,
    };
    // Tips only come from the rider side
    if (by === 'user') {
        update.tip = Math.max(0, Math.round(Number(tip) || 0));
    }

    await rideModel.updateOne({ _id: rideId }, update);
    return await rideModel.findOne({ _id: rideId }).populate('captain').populate('user');
};