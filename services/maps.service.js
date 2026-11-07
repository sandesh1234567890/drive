const axios = require('axios');
const captainModel = require('../models/captain.model');

function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    const durationMins = Math.round(distanceKm / 20 * 60); // assume 20 km/h avg city speed
    return {
        distance: { value: Math.round(distanceKm * 1000), text: distanceKm.toFixed(1) + ' km' },
        duration: { value: durationMins * 60, text: durationMins + ' mins' },
    };
}

module.exports.getAddressCoordinates = async (address) => {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: { address: address, key: process.env.GOOGLE_MAPS_API },
        });
        if (response.data.status === 'OK') {
            const location = response.data.results[0].geometry.location;
            return { ltd: location.lat, lng: location.lng };
        }
    } catch (error) {
        console.error(error);
    }
    try {
        const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: { q: address, format: 'json', limit: 1 },
            headers: { 'User-Agent': 'UberCloneApp/1.0' },
        });
        if (Array.isArray(data) && data.length > 0) {
            return { ltd: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (error) {
        console.error(error);
    }
    throw new Error('Unable to fetch coordinates');
};

module.exports.getDistance = async (origin, destination) => {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
            params: {
                origins: origin,
                destinations: destination,
                key: process.env.GOOGLE_MAPS_API,
            },
        });
        const el = response.data.rows?.[0]?.elements?.[0];
        if (el && el.status === 'OK' && el.distance && el.distance.value && !isNaN(el.distance.value)) {
            return el;
        }
    } catch (error) {
        console.error(error);
    }
    // Straight-line fallback using geocoded coordinates
    try {
        const o = await module.exports.getAddressCoordinates(origin);
        const d = await module.exports.getAddressCoordinates(destination);
        return haversineDistance(o.ltd, o.lng, d.ltd, d.lng);
    } catch (error) {
        console.error(error);
        throw new Error('Unable to calculate distance');
    }
};

module.exports.getSuggestions = async (address) => {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
            params: {
                input: address,
                key: process.env.GOOGLE_MAPS_API,
                types: 'address',
            },
        });
        if (response.data.status === 'OK' && response.data.predictions) {
            return response.data.predictions;
        }
    } catch (error) {
        console.error(error);
    }
    try {
        const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: { q: address, format: 'json', limit: 5, addressdetails: 1 },
            headers: { 'User-Agent': 'UberCloneApp/1.0' },
        });
        if (Array.isArray(data)) {
            return data.map((p) => ({ description: p.display_name }));
        }
        return [];
    } catch (error) {
        console.error(error);
        throw error;
    }
};

module.exports.getCaptainsInTheRadius = async (ltd, lng, radius) => {
    const captains = await captainModel.find({
        isOnline: true,
        status: 'active',
        location: {
            $geoWithin: {
                $centerSphere: [[lng, ltd], radius / 6371],
            },
        },
    });
    return captains;
};
