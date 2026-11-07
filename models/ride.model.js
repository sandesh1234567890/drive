const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    pickup: {
        type: String,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    // Real map coordinates so tracking/captain screens render the actual
    // trip (Barshi etc.) instead of falling back to a default city.
    pickupLocation: {
        ltd: { type: Number },
        lng: { type: Number }
    },
    destinationLocation: {
        ltd: { type: Number },
        lng: { type: Number }
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'ongoing', 'completed', 'cancelled'],
        default: 'pending'
    },
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'captain'
    },
    fare: {
        type: Number,
        required: true
    },
    duration: {
        type: Number, // seconds
    },
    distance: {
        type: Number, // meters
    },
    paymentId: {
        type: String,
    },
    orderId: {
        type: String,
    },
    signature: {
        type: String,
    },
    otp: {
        type: String,
        select: false,
        required: true
    },
    // --- trip extras: cancellation, ratings, tips, receipts ---
    acceptedAt: {
        type: Date
    },
    cancelledBy: {
        type: String,
        enum: ['user', 'captain', null],
        default: null
    },
    cancellationFee: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        min: 1,
        max: 5
    },
    review: {
        type: String,
        maxlength: 500,
        default: ''
    },
    tip: {
        type: Number,
        default: 0
    },
    ratedBy: {
        type: String,
        enum: ['user', 'captain', null],
        default: null
    },
    vehicle: {
        type: String,
        enum: ['moto', 'auto', 'car', 'premier', 'sedan', 'xl'],
        default: 'car'
    }
});

rideSchema.set('timestamps', true);

const rideModel = mongoose.model('Ride', rideSchema);
module.exports = rideModel;
