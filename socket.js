const socketIo = require('socket.io');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');

let io;

function initializeSocket(server) {
    io = socketIo(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {


        socket.on('join', async (data) => {
            const { userId, userType } = data;
            if (!userId || !userType) return;

            if (userType === 'user') {
                await userModel.findByIdAndUpdate(userId, { socketId: socket.id });
            } else if (userType === 'captain') {
                await captainModel.findByIdAndUpdate(userId, { socketId: socket.id });
            }
        });


        // Join the live room for one ride — everyone in it sees the same live events
        socket.on('join-ride', (data) => {
            try {
                const { rideId } = data;
                if (!rideId) return;
                socket.join(`ride:${rideId}`);
            } catch (_) {}
        });


        socket.on('update-location-captain', async (data) => {
            const { userId, rideId, location } = data;

            if (!location || location.ltd === undefined || location.lng === undefined) {
                return socket.emit('error', { message: 'Invalid location data' });
            }

            await captainModel.findByIdAndUpdate(userId, {
                location: {
                    ltd: location.ltd,
                    lng: location.lng
                }
            });

            // Live relay — everyone watching this ride (rider + captain) gets the fresh location
            if (rideId) {
                io.to(`ride:${rideId}`).emit('captain-location', location);
            }
        });


        socket.on('disconnect', () => {
            // Client disconnected
        });
    });
}

const sendMessageToSocketId = (socketId, messageObject) => {
    if (io) {
        io.to(socketId).emit(messageObject.event, messageObject.data);
    } else {
        //console.log('Socket.io not initialized.');
    }
}

module.exports = { initializeSocket, sendMessageToSocketId };
