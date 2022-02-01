/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const config = require('./../config');

let getUserList = async () => {
  try {
    const [riskAnalystList, serviceManagerList] = await Promise.all([
      User.find({ isDeleted: false, role: 'riskAnalyst' })
        .select('_id name')
        .lean(),
      User.find({ isDeleted: false, role: 'serviceManager' })
        .select('_id name')
        .lean(),
    ]);
    return { riskAnalystList, serviceManagerList };
  } catch (e) {
    Logger.log.error(
      `Error occurred in get risk-analyst list `,
      e.message || e,
    );
  }
};

const getAccessBaseUserList = async ({ hasFullAccess = false, userId }) => {
  try {
    const query = hasFullAccess
      ? { isDeleted: false, role: { $ne: 'superAdmin' } }
      : { isDeleted: false, _id: userId };
    return await User.find(query).select('_id name').lean();
  } catch (e) {
    Logger.log.error(
      'Error occurred in get access base user list ',
      e.message || e,
    );
  }
};

const removeUserToken = async () => {
  try {
    const users = await User.find({ isDeleted: false }).lean();
    const date = new Date();
    const expireTime = new Date(
      date.setHours(date.getHours() - config.jwt.expireTime),
    );
    const promises = [];
    let update;
    for (let i = 0; i < users.length; i++) {
      if (users[i].jwtToken.length !== 0) {
        update = {};
        users[i].jwtToken = users[i].jwtToken.filter((i) => {
          return expireTime < i.lastAPICallTime;
        });
        update.jwtToken = users[i].jwtToken;
        if (users[i].jwtToken.length === 0) {
          update.socketIds = [];
        }
        promises.push(User.updateOne({ _id: users[i]._id }, { $set: update }));
      }
    }
    await Promise.all(promises);
  } catch (e) {
    Logger.log.error('Error occurred remove token from DB');
    Logger.log.error(e);
  }
};

const getUserName = async ({ userId }) => {
  try {
    return await User.findOne({ _id: userId }).lean();
  } catch (e) {
    Logger.log.error('Error occurred in get user name', e);
  }
};

module.exports = {
  getUserList,
  getAccessBaseUserList,
  removeUserToken,
  getUserName,
};
