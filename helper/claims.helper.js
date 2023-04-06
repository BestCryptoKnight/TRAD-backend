/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const User = mongoose.model('user');
const FormData = require('form-data');
const fs = require('fs');
const Path = require('path');
const MailHelper = require('./mailer.helper');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  getClaimsDetails,
  addClaimDetail,
  getDocuments,
  uploadDocument,
} = require('./rss.helper');
const { addAuditLog } = require('./audit-log.helper');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');

const getClaimsList = async ({
  hasFullAccess = false,
  userId,
  claimColumn,
  requestedQuery,
  moduleColumn,
  isForRisk = true,
  clientId,
  hasOnlyReadAccessForClientModule,
}) => {
  try {
    let clientCRMIds = [];
    if (isForRisk && !hasFullAccess && !requestedQuery.clientId) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id crmClientId')
        .lean();
      clientCRMIds = clients.map((i) => i.crmClientId);
    } else if (requestedQuery.clientId) {
      const client = await Client.findOne({ _id: requestedQuery.clientId })
        .select('crmClientId')
        .lean();
      if (client?.crmClientId) {
        clientCRMIds = [client.crmClientId];
      }
    } else if (!isForRisk) {
      const client = await Client.findById(clientId)
        .select('_id crmClientId')
        .lean();
      clientCRMIds = [client.crmClientId];
    } else if (isForRisk) {
      const client = await Client.find({ isDeleted: false })
        .select('_id crmClientId')
        .lean();
      const crmIds = client.map((i) => i.crmClientId);
      clientCRMIds = crmIds;
    }
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 10;
    const { claims, totalCount } = await getClaimsDetails({
      crmIds: clientCRMIds,
      page: requestedQuery.page,
      limit: requestedQuery.limit,
    });
    const response = {};
    claimColumn.push('id');
    if (claimColumn.includes('accountid')) {
      clientCRMIds = claims.map((i) => i.accountid);
      const clients = await Client.find({
        crmClientId: { $in: clientCRMIds },
      })
        .select('_id crmClientId name')
        .lean();
      clients.forEach((client) => {
        response[client.crmClientId] = client;
      });
    }

    /*const currentColumn = claimColumn.reduce((obj, key) => {
      obj[key] = 1;
      return obj;
    }, {});
    if (
      !claimColumn.includes('accountid') &&
      (claimColumn.includes('insurerId') || claimColumn.includes('sector'))
    ) {
      currentColumn['accountid'] = 1;
    }*/
    const claimsList = [];
    let data = {};
    claims.forEach((claim) => {
      data = {};
      const clientId = claim['accountid'];
      claimColumn.map((key) => {
        if (key === 'accountid') {
          data[key] =
            response[clientId] && response[clientId]['name']
              ? hasOnlyReadAccessForClientModule
                ? response[clientId]['name']
                : {
                    _id: response[clientId]['_id'],
                    value: response[clientId]['name'],
                  }
              : '';
        } else if (
          key === 'claimsinforequested' ||
          key === 'claimsinforeviewed' ||
          key === 'reimbursementrequired' ||
          key === 'tradinghistory'
        ) {
          data[key] = claim[key] === '1' ? 'Yes' : 'No';
        } else {
          data[key] = claim[key];
        }
      });
      claimsList.push(data);
    });
    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (claimColumn.includes(moduleColumn[i].name)) {
        if (
          hasOnlyReadAccessForClientModule &&
          moduleColumn[i].name === 'accountid'
        ) {
          headers.push({
            name: moduleColumn[i].name,
            label: moduleColumn[i].label,
            type: 'string',
          });
        } else {
          headers.push(moduleColumn[i]);
        }
      }
    }
    return {
      docs: claimsList,
      headers,
      total: totalCount,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(totalCount / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error('Error occurred in get client list report');
    Logger.log.error(e);
  }
};

const addClaimInRSS = async ({
  requestBody,
  userType,
  userId,
  clientId,
  userName,
}) => {
  try {
    const keys = [
      'name',
      'accountid',
      'description',
      'notifiedofcase',
      'claimsinforequested',
      'claimsinforeviewed',
      'datesubmittedtouw',
      'podreceived',
      'podsenttouw',
      'codrequested',
      'codreceived',
      'grossdebtamount',
      'amountpaid',
      'receivedlolfromuw',
      'claimpaidbyuw',
      'reimbursementrequired',
      'reimbursementrequested',
      'reimbursementreceived',
      'tradinghistory',
      'dljustification',
      'underwriter',
      'stage',
      'sector',
      'reimbursementspaid',
      'repaymentplanamount',
      'dateofoldestinvoice',
      'instalmentamounts',
      'frequency',
      'repaymentplanlength',
      'claimsmanager',
    ];
    const claim = {};
    const query =
      userType === 'client-user' && clientId
        ? { _id: clientId }
        : { _id: requestBody.accountid };
    const client = await Client.findOne(query)
      .select('_id crmClientId name serviceManagerId riskAnalystId')
      .lean();
    requestBody.accountid = client?.crmClientId;
    keys.map((key) => {
      if (
        key === 'claimsinforequested' ||
        key === 'claimsinforeviewed' ||
        key === 'reimbursementrequired' ||
        key === 'tradinghistory'
      ) {
        requestBody[key] = requestBody[key] ? '1' : '0';
      }
      claim[key] = requestBody[key];
    });
    const response = await addClaimDetail({ claim: claim });
    await addAuditLog({
      entityType: 'claim',
      userType: userType,
      logDescription: `A new claim for client ${client?.name} is added by ${
        userType === 'user' ? userName : client?.name
      }`,
      userRefId: userType === 'user' ? userId : clientId,
      actionType: 'add',
      entityRefId: client._id,
    });
    if (userType === 'client-user') {
      const notificationObj = {};
      /*if (userType === 'user') {
      notificationObj.userId = client._id;
      notificationObj.userType = 'client-user';
    } else {*/
      notificationObj.userId = client?.serviceManagerId || '';
      notificationObj.userType = 'user';
      userName = client?.name;
      // }
      notificationObj.description = `A new claim ${response?.record?.id} is generated by ${userName}`;
      notificationObj.entityType = 'claim';
      notificationObj.entityId = response?.record?.id;
      const notification = await addNotification(notificationObj);
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'CLAIM_ADDED',
            data: notification,
          },
          type: notification.userType,
          userId: notification.userId,
        });
      }
      let idOfServiceManagerOrRiskAnalyst;
      if (
        client.hasOwnProperty('serviceManagerId') &&
        client.serviceManagerId !== null
      ) {
        idOfServiceManagerOrRiskAnalyst = client.serviceManagerId;
      } else if (
        client.hasOwnProperty('riskAnalystId') &&
        client.riskAnalystId !== null
      ) {
        idOfServiceManagerOrRiskAnalyst = client.riskAnalystId;
      }
      if (idOfServiceManagerOrRiskAnalyst) {
        const user = await User.findOne({
          _id: idOfServiceManagerOrRiskAnalyst,
        })
          .select('name email')
          .lean();
        let mailObj = {
          toAddress: [user.email],
          subject: `New Claim Notification - ${client.name}`,
          text: {
            name: client.name,
            nameOfServiceManagerOrRiskAnalyst: user.name,
            claimLink: process.env.FRONTEND_ADMIN_URL + 'claims',
            claimName: requestBody.name,
          },
          mailFor: 'claimCreated',
        };
        await MailHelper.sendMail(mailObj);
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred while adding claim in RSS');
    Logger.log.error(e);
    return Promise.reject(e);
  }
};

const listDocuments = async ({ crmId, requestedQuery }) => {
  try {
    const { documents, totalCount } = await getDocuments({
      parent: 'Claim',
      parentId: crmId,
      page: requestedQuery.page,
      limit: requestedQuery.limit,
    });
    documents.forEach((i) => {
      delete i.parentid;
    });
    const headers = [
      {
        name: 'name',
        label: 'File Name',
        type: 'string',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'string',
      },
      {
        name: 'size',
        label: 'File Size(KB)',
        type: 'string',
      },
      {
        name: 'modified',
        label: 'Modified Date',
        type: 'date',
      },
    ];
    return {
      docs: documents,
      headers,
      total: totalCount,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(totalCount / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error('Error occurred in get document list');
    Logger.log.error(e.message || e);
  }
};

const uploadDocumentInRSS = async ({
  fileBuffer,
  parentId,
  parentObject,
  fileName,
  description,
}) => {
  try {
    const filePath = Path.join(__dirname, '../upload/documents', fileName);
    fs.writeFileSync(filePath, fileBuffer);
    const fileStream = fs.createReadStream(filePath);

    const formData = new FormData();
    formData.append('file', fileStream);
    formData.append('ParentId', parentId);
    formData.append('ParentObject', parentObject);
    if (description) {
      formData.append('description', description);
    }
    await uploadDocument({ formData });

    fs.unlink(filePath, (err) => {
      if (err) {
        Logger.log.error('Error while deleting file', err.message || err);
      }
      Logger.log.trace('File deleted successfully');
    });
  } catch (e) {
    Logger.log.error('Error occurred in upload document');
    Logger.log.error(e);
  }
};

module.exports = {
  getClaimsList,
  addClaimInRSS,
  listDocuments,
  uploadDocumentInRSS,
};
