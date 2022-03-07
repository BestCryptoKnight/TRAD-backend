/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const User = mongoose.model('user');
const ClientUser = mongoose.model('client-user');
const socket_io = require('socket.io');

/*
 * Local Imports
 * */
let io = socket_io();
let socketApi = {};
socketApi.io = io;
let socketUser = {};
const Logger = require('./../services/logger');

io.on('connection', async function (socket) {
  socketUser[socket.id] = socket;
  let userToken = socket.handshake.query.token;
  const type = socket.handshake.query.type;
  Logger.log.info('New socket user connected:', socket.id, type);
  if (userToken && type) {
    await addSocketIdToUser(userToken, socket.id, type);
  }
  socket.on('disconnect', async () => {
    Logger.log.info('Socket User disconnected:', socket.id);
    await removeSocketIdFromUser(socket.id);
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
      Logger.log.warn('Error in adding socketId to user', err);
      return reject(err);
    }
  });
};

let removeSocketIdFromUser = (socketId) => {
  return new Promise(async (resolve, reject) => {
    try {
      await Promise.all([
        User.updateOne(
          { socketIds: socketId },
          { $pull: { socketIds: socketId } },
        ),
        ClientUser.updateOne(
          { socketIds: socketId },
          { $pull: { socketIds: socketId } },
        ),
      ]);
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
        const clientUsers = await ClientUser.find({ clientId: userId })
          .select({ socketIds: 1 })
          .lean();
        if (clientUsers && clientUsers.length !== 0) {
          user = { socketIds: [] };
          clientUsers.forEach((i) => {
            if (i.socketIds && i.socketIds.length !== 0) {
              user.socketIds = user.socketIds.concat(i.socketIds);
            }
          });
        }
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
