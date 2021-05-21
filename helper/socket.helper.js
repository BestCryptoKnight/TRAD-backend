const mongoose = require('mongoose');
const User = mongoose.model('user');
const ClientUser = mongoose.model('client-user');
var socket_io = require('socket.io');
var io = socket_io();
var socketApi = {};
socketApi.io = io;
let socketUser = {};

io.on('connection', async function (socket) {
  console.log('New user connected:', socket.id);
  socketUser[socket.id] = socket;
  let userToken = socket.handshake.query.token;
  const type = socket.handshake.query.type;
  if (userToken && type) {
    await addSocketIdToUser(userToken, socket.id, type);
  }
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    console.log('type', type);
    await removeSocketIdFromUser(socket.id, type);
    // socketUser = socketUser.filter(user => user.id !== socket.id);
    for (let key in socketUser) {
      if (key.toString() === socket.id) {
        delete socketUser[key];
      }
    }
  });
});

socketApi.sendNotification = async function ({
  notificationObj,
  socketIds = [],
  userId = null,
  type,
}) {
  // let rnd = Math.floor(Math.random() * 2);
  // console.log('Event emitting to .', users[rnd].id, notificationObj,);
  if (userId && socketIds.length === 0) {
    socketIds = await getSocketIdFromUser(userId, type);
  }
  if (socketIds && socketIds.length !== 0) {
    socketIds.forEach((socketId) => {
      if (socketUser[socketId]) {
        socketUser[socketId].emit('FromAPI', notificationObj);
      }
    });
  }
};

let addSocketIdToUser = (token, socketId, type) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user;
      if (type === 'user') {
        user = await User.findByToken(token);
      } else {
        user = await ClientUser.findByToken(token);
      }
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
      return reject(err);
    }
  });
};

let removeSocketIdFromUser = (socketId, type) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (type === 'user') {
        await User.updateOne(
          { socketIds: socketId },
          { $pull: { socketIds: socketId } },
        );
      } else {
        await ClientUser.updateOne(
          { socketIds: socketId },
          { $pull: { socketIds: socketId } },
        );
      }
      return resolve();
    } catch (err) {
      Logger.log.error(
        'Error in removing socketId from user',
        err.message | err,
      );
      return reject(err);
    }
  });
};

let getSocketIdFromUser = (userId, type) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user;
      if (type === 'user') {
        user = await User.findOne({ _id: userId })
          .select({ socketIds: 1 })
          .lean();
      } else {
        user = await ClientUser.findOne({ _id: userId })
          .select({ socketIds: 1 })
          .lean();
      }
      if (!user) {
        return [];
      } else {
        return resolve(user.socketIds);
      }
    } catch (err) {
      Logger.log.error(
        'Error in listing socketIds from user',
        err.message | err,
      );
      return reject(err);
    }
  });
};

module.exports = socketApi;
