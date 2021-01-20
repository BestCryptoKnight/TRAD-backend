var socket_io = require('socket.io');
var io = socket_io();
var socketApi = {};
socketApi.io = io;
let socketUser = [];

io.on('connection', async function (socket) {
    // console.log('New user connected:', socket.id);
    socketUser.push(socket);
    // console.log('socket::', socket);
    // console.log('socket::', socket.handshake);
    // console.log('socket::', socket.handshake.query);
    // console.log('TOKEN::', socket.handshake.query.token);
    let userToken = socket.handshake.query.token;
    await addSocketIdToUser(userToken, socket.id);
    socket.on("disconnect", async () => {
        // console.log('User disconnected:', socket.id);
        await removeSocketIdFromUser(socket.id);
        socketUser = socketUser.filter(user => user.id !== socket.id);
    });
});

socketApi.sendNotification = async function ({notificationObj, socketIds = [], userId = null}) {
    // let rnd = Math.floor(Math.random() * 2);
    // console.log('Event emitting to .', users[rnd].id, notificationObj,);
    if (userId && socketIds.length === 0) {
        socketIds = await getSocketIdFromUser(userId);
    }
    socketIds.for(socketId => {
        socketUser[socketId].emit('FromAPI', notificationObj)
    })
};

let addSocketIdToUser = (token, socketId) => {
    return new Promise(async (resolve, reject) => {
        try {
            let user = await User.findByToken(token);
            if (!user) {
                return resolve();
            }
            if (user.socketIds.indexOf(socketId) === -1) {
                user.socketIds.push(socketId);
            }
            await user.save();
            return resolve();
        } catch (err) {
            Logger.log.error('Error in adding socketId to user', err.message | err);
            return reject(err)
        }
    })
};

let removeSocketIdFromUser = (socketId) => {
    return new Promise(async (resolve, reject) => {
        try {
            await User.updateOne({socketIds: socketId}, {$pull: {socketIds: socketId}});
            return resolve();
        } catch (err) {
            Logger.log.error('Error in removing socketId from user', err.message | err);
            return reject(err)
        }
    })
};

let getSocketIdFromUser = (userId) => {
    return new Promise(async (resolve, reject) => {
        try {
            let user = await User.findOne({_id: userId}).select({socketIds: 1}).lean();
            if (!user) {
                return [];
            } else {
                return resolve(user.socketIds);
            }
        } catch (err) {
            Logger.log.error('Error in listing socketIds from user', err.message | err);
            return reject(err)
        }
    })
};

module.exports = socketApi;
