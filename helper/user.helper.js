/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

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

module.exports = { getUserList, getAccessBaseUserList };
