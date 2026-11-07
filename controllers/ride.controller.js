const rideService = require('../services/ride.service');
const { validationResult } = require('express-validator');
const mapService = require('../services/maps.service');
const { sendMessageToSocketId } = require('../socket');
const rideModel = require('../models/ride.model');

module.exports.createRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pickup, destination, vehicle, pickupLocation, destinationLocation, distanceKm, durationMin } = req.body;

    // //console.log(req.user._id)

    try {
        const ride = await rideService.createRide({
            user: req.user._id,
            pickup,
            destination,
            vehicle,
            pickupLocation,
            destinationLocation,
            distanceKm,
            durationMin,
        });

        // Geocode for captain dispatch — prefer the coordinates the app
        // already resolved (OSRM/Nominatim on device), fall back to address.
        let pickupCoordinates = null;
        if (pickupLocation && typeof pickupLocation.ltd === 'number' && typeof pickupLocation.lng === 'number') {
            pickupCoordinates = { ltd: pickupLocation.ltd, lng: pickupLocation.lng };
        } else {
            try {
                pickupCoordinates = await mapService.getAddressCoordinates(pickup);
            } catch (geoErr) {
                console.error('Pickup geocode failed:', geoErr.message);
            }
        }

        let captainsInRadius = [];
        if (pickupCoordinates) {
            try {
                captainsInRadius = await mapService.getCaptainsInTheRadius(pickupCoordinates.ltd, pickupCoordinates.lng, 2);
            } catch (e) {
                console.error('Captain radius query failed:', e.message);
            }
        }

        ride.otp = ""

        res.status(201).json(ride);

        const rideWithUser = await rideModel.findOne({ _id: ride._id }).populate('user');
        // //console.log(rideWithUser);
        captainsInRadius.map(captain => {

            sendMessageToSocketId(captain.socketId, {
                event: 'new-ride',
                data: rideWithUser
            })

        })

    } catch (err) {

        //console.log(err);
        return res.status(500).json({ message: err.message });
    }

};

module.exports.getFare = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pickup, destination } = req.query;

    try {
        const fare = await rideService.getFare(pickup, destination);
        return res.status(200).json(fare);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

module.exports.confirmRide = async (req, res) => {
    // //console.log("ride confirmation sent")
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId } = req.body;

    try {
        const ride = await rideService.confirmRide({ rideId, captain: req.captain });
        // //console.log(ride.user.socketId)
        // //console.log(ride.user.socketId)
        sendMessageToSocketId(ride.user.socketId, {
            event: 'ride-confirmed',
            data: ride
        })

        return res.status(200).json(ride);
    } catch (err) {

        //console.log(err);
        return res.status(500).json({ message: err.message });
    }
}

module.exports.startRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId, otp } = req.query;

    try {
        const ride = await rideService.startRide({ rideId, otp, captain: req.captain });

        // //console.log(ride);

        sendMessageToSocketId(ride.user.socketId, {
            event: 'ride-started',
            data: ride
        })

        return res.status(200).json(ride);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

module.exports.endRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId } = req.body;

    try {
        const ride = await rideService.endRide({ rideId, captain: req.captain });
        // //console.log("almost final ", ride.user.socketId)
        sendMessageToSocketId(ride.user.socketId, {
            event: 'ride-ended',
            data: ride
        })

        return res.status(200).json(ride);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

module.exports.getUserHistory = async (req, res) => {
    try {
        const rides = await rideModel.find({ user: req.user._id }).populate('captain', 'fullname vehicle isOnline').sort({ _id: -1 });
        return res.status(200).json(rides);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getCaptainHistory = async (req, res) => {
    try {
        const rides = await rideModel.find({ captain: req.captain._id, status: { $in: ['accepted', 'ongoing', 'completed', 'cancelled'] } })
            .populate('user', 'fullname email').sort({ _id: -1 });
        return res.status(200).json(rides);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// --- Trip detail / receipt ----------------------------------
module.exports.getRideDetail = async (req, res) => {
    try {
        const { rideId } = req.params;
        const ride = await rideModel.findById(rideId)
            .populate('captain', 'fullname vehicle isOnline')
            .populate('user', 'fullname email');
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const isRider = req.user && String(ride.user?._id || ride.user) === String(req.user._id);
        const isCaptain = req.captain && String(ride.captain?._id || ride.captain) === String(req.captain._id);
        if (!isRider && !isCaptain) return res.status(403).json({ message: 'Not authorized for this ride' });

        return res.status(200).json(ride);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// --- Cancel (rider or captain) ------------------------------
module.exports.cancelRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const by = req.captain ? 'captain' : 'user';
    const actor = req.captain || req.user;
    try {
        const ride = await rideService.cancelRide({ rideId: req.body.rideId, user: actor, by });

        // Tell everyone in the ride room so both apps react instantly
        sendMessageToSocketId(ride.user?.socketId, { event: 'ride-cancelled', data: ride });
        if (ride.captain?.socketId) {
            sendMessageToSocketId(ride.captain.socketId, { event: 'ride-cancelled', data: ride });
        }
        return res.status(200).json(ride);
    } catch (err) {
        if (err.code === 'RIDE_STARTED') return res.status(409).json({ message: err.message });
        return res.status(400).json({ message: err.message });
    }
};

// --- Rate + tip ---------------------------------------------
module.exports.rateRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const by = req.captain ? 'captain' : 'user';
    const actor = req.captain || req.user;
    try {
        const ride = await rideService.rateRide({
            rideId: req.body.rideId,
            user: actor,
            by,
            rating: req.body.rating,
            review: req.body.review,
            tip: req.body.tip,
        });
        return res.status(200).json(ride);
    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
};
