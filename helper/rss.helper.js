/*
 * Module Imports
 * */
const axios = require('axios');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Insurer = mongoose.model('insurer');
const Policy = mongoose.model('policy');
const InsurerUser = mongoose.model('insurer-user');

/*
 * Local Imports
 * */
const Logger = require('../services/logger');
const { addAuditLog } = require('./audit-log.helper');

let getClients = ({ searchKeyword }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = 'https://apiv4.reallysimplesystems.com/accounts';
      const query = { name: { $con: searchKeyword }, type: 'Client' };
      const organization = await Organization.findOne({ isDeleted: false })
        .select({ 'integration.rss': 1 })
        .lean();
      const options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
        params: {
          q: query,
          limit: 100,
        },
      };
      const { data } = await axios(options);
      let clients = data.list.map((client) => client.record);
      Logger.log.info('Successfully retrieved clients from RSS');
      return resolve(clients);
    } catch (err) {
      Logger.log.error('Error in getting clients from RSS');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

let getClientsById = ({ crmIds }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = 'https://apiv4.reallysimplesystems.com/accounts';
      const query = { type: 'Client', id: { $in: crmIds } };
      const organization = await Organization.findOne({ isDeleted: false })
        .select({ 'integration.rss': 1, 'entityCount.client': 1 })
        .lean();
      const options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
        params: {
          q: query,
        },
      };
      const { data } = await axios(options);
      let clientCount = organization.entityCount.client;
      let clients = [];
      data.list.forEach((data) => {
        clients.push({
          clientCode:
            'C' +
            (organization.entityCount.client++).toString().padStart(4, '0'),
          crmClientId: data.record['id'],
          name: data.record['name'],
          address: {
            addressLine: data.record['addressline'],
            city: data.record['addresscity'],
            state: data.record['addresscounty/state'],
            country: data.record['addresscountry'],
            zipCode: data.record['addresspostcode/zip'],
          },
          crmNote: data.record['notes'],
          contactNumber: data.record['phone'],
          website: data.record['website'],
          abn: data.record['abn'],
          acn: data.record['acn'],
          sector: data.record['sector'],
          salesPerson: data.record['salesperson'],
          underWriter: data.record['underwriter'],
          referredBy: data.record['referredby'],
          inceptionDate: data.record['inceptiondate'],
          expiryDate: data.record['expirydate'],
        });
      });
      await Organization.updateOne(
        { isDeleted: false },
        { $set: { 'entityCount.client': clientCount } },
      );
      // console.log('clients::', JSON.stringify(data.list, null, 2));
      Logger.log.info('Successfully retrieved clients from RSS');
      return resolve(clients);
    } catch (err) {
      Logger.log.error('Error in getting clients from RSS');
      Logger.log.error(err);
      return reject(err);
    }
  });
};

let getInsurers = ({ searchKeyword }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let url = 'https://apiv4.reallysimplesystems.com/accounts';
      let query = {
        name: {
          $con: searchKeyword,
        },
        type: 'Underwriter',
      };
      let organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.rss': 1 });
      // console.log('ORG::', organization);
      let options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
        params: {
          q: query,
          limit: 100,
        },
      };
      let { data } = await axios(options);
      let insurers = data.list.map((insurer) => insurer.record);
      Logger.log.info('Successfully retrieved insurers from RSS');
      return resolve(insurers);
    } catch (err) {
      Logger.log.error('Error in getting insurers from RSS');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

let getClientById = ({ clientId }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = 'https://apiv4.reallysimplesystems.com/accounts/' + clientId;
      const organization = await Organization.findOne({
        isDeleted: false,
      })
        .select({ 'integration.rss': 1 })
        .lean();
      const options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
      };
      let { data } = await axios(options);
      const client = {
        crmClientId: data.record['id'],
        name: data.record['name'],
        address: {
          addressLine: data.record['addressline'],
          city: data.record['addresscity'],
          state: data.record['addresscounty/state'],
          country: data.record['addresscountry'],
          zipCode: data.record['addresspostcode/zip'],
        },
        crmNote: data.record['notes'],
        contactNumber: data.record['phone'],
        website: data.record['website'],
        abn: data.record['abn'],
        acn: data.record['acn'],
        sector: data.record['sector'],
        salesPerson: data.record['salesperson'],
        underWriter: data.record['underwriter'],
        referredBy: data.record['referredby'],
        inceptionDate: data.record['inceptiondate'],
        expiryDate: data.record['expirydate'],
      };
      Logger.log.info('Successfully retrieved client from RSS');
      return resolve(client);
    } catch (err) {
      Logger.log.error('Error in getting client from RSS');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

let getInsurerById = ({ insurerId }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let url = 'https://apiv4.reallysimplesystems.com/accounts/' + insurerId;
      let organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.rss': 1 });
      let options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
      };
      // console.log('options::', JSON.stringify(options, null, 2));
      let { data } = await axios(options);
      let insurer = data.record;
      Logger.log.info('Successfully retrieved insurer from RSS');
      return resolve(insurer);
    } catch (err) {
      Logger.log.error('Error in getting insurer from RSS');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

let getPolicyById = ({ policyId }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let url = 'https://apiv4.reallysimplesystems.com/policies/' + policyId;
      let organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.rss': 1 });
      let options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
      };
      let { data } = await axios(options);
      Logger.log.info('Successfully retrieved policy from RSS');
      return resolve(data.record);
    } catch (err) {
      Logger.log.error('Error in getting policy from RSS');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

let getClientContacts = ({ clientId }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let url =
        'https://apiv4.reallysimplesystems.com/accounts/' +
        clientId +
        '/contacts';
      let organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.rss': 1 });
      let options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
      };
      let { data } = await axios(options);
      let contacts = [];
      data.list.forEach((crmContact) => {
        let contact = {
          name: crmContact.record['first'] + ' ' + crmContact.record['last'],
          jobTitle: crmContact.record['jobtitle'],
          crmContactId: crmContact.record['id'],
          email: crmContact.record['email'],
          contactNumber: crmContact.record['phone']
            ? crmContact.record['phone']
            : crmContact.record['mobile']
            ? crmContact.record['mobile']
            : crmContact.record['direct'],
          department: crmContact.record['department'],
          hasLeftCompany: crmContact.record['leftcompany'],
          isDecisionMaker: crmContact.record['decisionmaker'],
        };
        contacts.push(contact);
      });
      Logger.log.info('Successfully retrieved contacts from RSS');
      return resolve(contacts);
    } catch (err) {
      Logger.log.error('Error in getting contacts from RSS');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

let getClientPolicies = ({
  clientId,
  insurerId = null,
  crmClientId,
  query = {},
  policies = [],
  page,
  limit,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url =
        'https://apiv4.reallysimplesystems.com/accounts/' +
        crmClientId +
        '/policies?limit=' +
        limit +
        '&page=' +
        page;
      const organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.rss': 1 });
      const options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
      };
      if (query && Object.keys(query).length !== 0) {
        options.params = {
          q: query,
        };
      }
      const { data } = await axios(options);
      data.list.forEach((crmPolicy) => {
        policies.push({
          insurerId: insurerId,
          clientId: clientId,
          crmPolicyId: crmPolicy.record['id'],
          inceptionDate: crmPolicy.record['inceptiondate'],
          expiryDate: crmPolicy.record['expirydate'],
          product: crmPolicy.record['product'],
          policyPeriod: crmPolicy.record['policyperiod'],
          policyCurrency: crmPolicy.record['policycurrency'],
        });
      });
      if (data.metadata['has_more']) {
        await getClientPolicies({
          clientId,
          insurerId,
          crmClientId,
          page: page + 1,
          limit,
          query,
          policies,
        });
      }
      Logger.log.info('Successfully retrieved policies from RSS');
      return resolve(policies);
    } catch (err) {
      Logger.log.error('Error in getting policies from RSS');
      Logger.log.error(err);
      return reject(err);
    }
  });
};

let getInsurerContacts = ({
  crmInsurerId,
  insurerId,
  page,
  limit,
  contacts = [],
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      let url =
        'https://apiv4.reallysimplesystems.com/accounts/' +
        crmInsurerId +
        '/contacts?limit=' +
        limit +
        '&page=' +
        page;
      let organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.rss': 1 });
      let options = {
        method: 'GET',
        url: url,
        headers: {
          Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        },
      };
      let { data } = await axios(options);
      data.list.forEach((crmContact) => {
        let contact = {
          insurerId: insurerId,
          name: crmContact.record['first'] + ' ' + crmContact.record['last'],
          jobTitle: crmContact.record['jobtitle'],
          crmContactId: crmContact.record['id'],
          email: crmContact.record['email'],
          contactNumber: crmContact.record['mobile'],
          direct: crmContact.record['direct'],
        };
        contacts.push(contact);
      });
      if (data.metadata['has_more']) {
        Logger.log.info('Fetch more records : ', contacts.length);
        await getInsurerContacts({
          crmInsurerId,
          insurerId,
          page: page + 1,
          limit,
          contacts,
        });
      }
      Logger.log.info('Successfully retrieved insurer contacts from RSS');
      return resolve(contacts);
    } catch (err) {
      Logger.log.error('Error in getting insurer contacts from RSS');
      Logger.log.error(err);
      return reject(err);
    }
  });
};

let fetchInsurerDetails = ({
  underwriterName,
  crmClientId,
  clientId,
  auditLog = {},
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      let insurer = await Insurer.findOne({ name: underwriterName });
      if (insurer) {
        //TODO sync insurer + client policies
        const policies = await Policy.find({ clientId: clientId }).lean();
        if (policies && policies.length !== 0) {
          return resolve(insurer);
        } else {
          const clientPolicies = await getClientPolicies({
            insurerId: insurer._id,
            crmClientId,
            clientId,
            page: 1,
            limit: 50,
          });
          let promiseArr = [];
          clientPolicies.forEach((policy) => {
            const clientPolicy = new Policy(policy);
            promiseArr.push(clientPolicy.save());
            promiseArr.push(
              addAuditLog({
                entityType: 'policy',
                entityRefId: clientPolicy._id,
                userType: auditLog.userType,
                userRefId: auditLog.userRefId,
                actionType: 'add',
                logDescription: `Client policy ${clientPolicy.product} added successfully.`,
              }),
            );
          });
          await Promise.all(promiseArr);
        }
        return resolve(insurer);
      } else {
        const data = await getInsurers({ searchKeyword: underwriterName });
        let promiseArr = [];
        if (data && data.length !== 0) {
          const insurerData = {
            crmInsurerId: data[0]['id'],
            name: data[0]['name'],
            address: {
              addressLine: data[0]['addressline'],
              city: data[0]['addresscity'],
              state: data[0]['addresscounty/state'],
              country: data[0]['addresscountry'],
              zipCode: data[0]['addresspostcode/zip'],
            },
            contactNumber: data[0]['phone'],
            website: data[0]['website'],
          };
          insurer = new Insurer(insurerData);
          await insurer.save();
          promiseArr.push(
            addAuditLog({
              entityType: 'insurer',
              entityRefId: insurer._id,
              userType: auditLog.userType,
              userRefId: auditLog.userRefId,
              actionType: 'add',
              logDescription: `Insurer ${insurer.name} added successfully.`,
            }),
          );
          const insurerContacts = await getInsurerContacts({
            crmInsurerId: insurer.crmInsurerId,
            insurerId: insurer._id,
            contacts: [],
            page: 1,
            limit: 50,
          });
          insurerContacts.forEach((contact) => {
            const insurerContact = new InsurerUser(contact);
            promiseArr.push(insurerContact.save());
            promiseArr.push(
              addAuditLog({
                entityType: 'insurer-user',
                entityRefId: insurerContact._id,
                userType: auditLog.userType,
                userRefId: auditLog.userRefId,
                actionType: 'add',
                logDescription: `Insurer contact ${insurerContact.name} added successfully.`,
              }),
            );
          });
        }
        const clientPolicies = await getClientPolicies({
          insurerId: insurer && insurer._id ? insurer._id : null,
          crmClientId,
          clientId,
          limit: 50,
          page: 1,
        });
        clientPolicies.forEach((policy) => {
          const clientPolicy = new Policy(policy);
          promiseArr.push(clientPolicy.save());
          promiseArr.push(
            addAuditLog({
              entityType: 'policy',
              entityRefId: clientPolicy._id,
              userType: auditLog.userType,
              userRefId: auditLog.userRefId,
              actionType: 'add',
              logDescription: `Client policy ${clientPolicy.product} added successfully.`,
            }),
          );
        });
        await Promise.all(promiseArr);

        return resolve(insurer);
      }
    } catch (err) {
      Logger.log.error('Error in fetch insurers details ');
      Logger.log.error(err.message || err);
      return reject(err);
    }
  });
};

module.exports = {
  getClients,
  getInsurers,
  getClientById,
  getPolicyById,
  getClientContacts,
  getClientPolicies,
  fetchInsurerDetails,
  getInsurerContacts,
  getClientsById,
};
