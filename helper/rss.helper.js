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

/*
Get Claims Manager List
 */
const getClaimsManagerList = async ({ liveValue = 1, limitValue = 100 }) => {
  try {
    const url = `https://apiv4.reallysimplesystems.com/users?q={"live":${liveValue}}&limit=${limitValue}`;
    const organization = await Organization.findOne({ isDeleted: false })
      .select({ 'integration.rss': 1 })
      .lean();
    const options = {
      method: 'GET',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
      },
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in get Claims Manager List');
    Logger.log.error(e.message || e);
    return Promise.reject(Error('Error in fetching Claim Managers'));
  }
};

/*
Get Client List
 */
const getClients = async ({ searchKeyword }) => {
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
    return clients;
  } catch (err) {
    Logger.log.error('Error in getting clients from RSS');
    Logger.log.error(err.message || err);
  }
};

/*
Get Clients by CRMIds
 */
const getClientsById = async ({ crmIds }) => {
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
        limit: 100,
      },
    };
    const { data } = await axios(options);
    let clients = [];
    data.list.forEach((data) => {
      clients.push({
        clientCode:
          'C' + (++organization.entityCount.client).toString().padStart(4, '0'),
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
        underWriter: data.record['insurer'],
        referredBy: data.record['referredby'],
        inceptionDate: data.record['inceptiondate'],
        expiryDate: data.record['expirydate'],
      });
    });
    await Organization.updateOne(
      { isDeleted: false },
      { $set: { 'entityCount.client': organization.entityCount.client } },
    );
    Logger.log.info('Successfully retrieved clients from RSS');
    return clients;
  } catch (err) {
    Logger.log.error('Error in getting clients from RSS');
    Logger.log.error(err);
  }
};

/*
Get Insurer List
 */
const getInsurers = async ({ searchKeyword }) => {
  try {
    const url = 'https://apiv4.reallysimplesystems.com/accounts';
    const query = {
      name:
        typeof searchKeyword === 'string'
          ? {
              $con: searchKeyword,
            }
          : searchKeyword,
      type: 'Underwriter',
    };
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
      params: {
        q: query,
        limit: 100,
      },
    };
    let { data } = await axios(options);
    const insurers = data.list.map((insurer) => insurer.record);
    Logger.log.info('Successfully retrieved insurers from RSS');
    return insurers;
  } catch (err) {
    Logger.log.error('Error in getting insurers from RSS');
    Logger.log.error(err.message || err);
  }
};

/*
Get Insurer Details by CRMId
 */
const getInsurerById = async ({ insurerCRMId }) => {
  try {
    const url =
      'https://apiv4.reallysimplesystems.com/accounts/' + insurerCRMId;
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
    const insurer = {
      crmInsurerId: data.record['id'],
      name: data.record['name'],
      address: {
        addressLine: data.record['addressline'],
        city: data.record['addresscity'],
        state: data.record['addresscounty/state'],
        country: data.record['addresscountry'],
        zipCode: data.record['addresspostcode/zip'],
      },
      contactNumber: data.record['phone'],
      website: data.record['website'],
    };
    Logger.log.info('Successfully retrieved insurers from RSS');
    return insurer;
  } catch (err) {
    Logger.log.error('Error in getting insurers from RSS');
    Logger.log.error(err.message || err);
  }
};

/*
Get Client Details by CRMId
 */
const getClientById = async ({ clientId }) => {
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
      underWriter: data.record['insurer'],
      referredBy: data.record['referredby'],
      inceptionDate: data.record['inceptiondate'],
      expiryDate: data.record['expirydate'],
    };
    Logger.log.info('Successfully retrieved client from RSS');
    return client;
  } catch (err) {
    Logger.log.error('Error in getting client from RSS');
    Logger.log.error(err.message || err);
    return Promise.reject({
      status: 'ERROR',
      message: err.message || err,
    });
  }
};

/*
Get Insurers by CRMIds
 */
const getInsurersById = async ({ crmIds }) => {
  try {
    let url = 'https://apiv4.reallysimplesystems.com/accounts';
    const query = { type: 'Underwriter', id: { $in: crmIds } };
    let organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.rss': 1 })
      .lean();
    let options = {
      method: 'GET',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
      },
      params: {
        q: query,
      },
    };
    let { data } = await axios(options);
    const insurers = [];
    data.list.forEach((data) => {
      insurers.push({
        crmInsurerId: data.record['id'],
        name: data.record['name'],
        address: {
          addressLine: data.record['addressline'],
          city: data.record['addresscity'],
          state: data.record['addresscounty/state'],
          country: data.record['addresscountry'],
          zipCode: data.record['addresspostcode/zip'],
        },
        contactNumber: data.record['phone'],
        website: data.record['website'],
      });
    });
    Logger.log.info('Successfully retrieved insurer from RSS');
    return insurers;
  } catch (err) {
    Logger.log.error('Error in getting insurer from RSS');
    Logger.log.error(err.message || err);
  }
};

/*
Get Policy Details by CRMId
 */
const getPolicyById = async ({ policyId }) => {
  try {
    let url = 'https://apiv4.reallysimplesystems.com/policies/' + policyId;
    let organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.rss': 1 })
      .lean();
    let options = {
      method: 'GET',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
      },
    };
    let { data } = await axios(options);
    Logger.log.info('Successfully retrieved policy from RSS');
    return data.record;
  } catch (err) {
    Logger.log.error('Error in getting policy from RSS');
    Logger.log.error(err.message || err);
  }
};

/*
Get Client Contacts by Client CRMId
 */
const getClientContacts = async ({ clientId, contacts = [], page, limit }) => {
  try {
    const url =
      'https://apiv4.reallysimplesystems.com/accounts/' +
      clientId +
      '/contacts?limit=' +
      limit +
      '&page=' +
      page;
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
    const { data } = await axios(options);
    data.list.forEach((crmContact) => {
      const contact = {
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
        hasLeftCompany: !(
          crmContact.record['leftcompany'] === '0' ||
          crmContact.record['leftcompany'] === 0 ||
          crmContact.record['leftcompany'] === null
        ),
        isDecisionMaker: !(
          crmContact.record['decisionmaker'] === '0' ||
          crmContact.record['decisionmaker'] === 0 ||
          crmContact.record['decisionmaker'] === null
        ),
        isDeleted: false,
      };
      contacts.push(contact);
    });
    if (data.metadata['has_more']) {
      await getClientContacts({
        clientId,
        page: page + 1,
        limit,
        contacts,
      });
    }
    Logger.log.info('Successfully retrieved contacts from RSS');
    return contacts;
  } catch (err) {
    Logger.log.error('Error in getting contacts from RSS');
    Logger.log.error(err.message || err);
  }
};

/*
Get Client Policies
 */
const getClientPolicies = async ({
  clientId,
  insurerId = null,
  crmClientId,
  query = {},
  policies = [],
  page,
  limit,
}) => {
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
        product: crmPolicy.record['product'],
        policyPeriod: crmPolicy.record['policyperiod'],
        policyCurrency: crmPolicy.record['policycurrency'],
        policyNumber: crmPolicy.record['policynumber'],
        crmNote: crmPolicy.record['notes'],
        brokersCommission: crmPolicy.record['brokerscommission'],
        tcrServiceFee: crmPolicy.record['tcrservicefee'],
        rmpFee: crmPolicy.record['rmpfee'],
        noOfMonitoredAccounts: crmPolicy.record['noofmonitoredaccounts'],
        noOfResChecks: crmPolicy.record['noofreschecks'],
        premiumFunder: crmPolicy.record['premiumfunder'],
        premiumRate: crmPolicy.record['premiumrate'],
        estimatedPremium: crmPolicy.record['estimatedpremium'],
        minimumPremium: crmPolicy.record['minimumpremium'],
        approvedCountries: crmPolicy.record['approvedcountries'],
        indemnityLevel: crmPolicy.record['indemnitylevel'],
        maxSumInsured: crmPolicy.record['maxsuminsured'],
        discretionaryLimit: crmPolicy.record['discretionarylimit'],
        termsOfPayment: crmPolicy.record['termsofpayment'],
        maximumExtensionPeriod: crmPolicy.record['maximumextensionperiod'],
        maximumInvoicingPeriod: crmPolicy.record['maximuminvoicingperiod'],
        threshold: crmPolicy.record['threshold'],
        excess: crmPolicy.record['excess'],
        aggregateFirstLoss: crmPolicy.record['aggregatefirstloss'],
        profitShare: crmPolicy.record['profitshare'],
        noClaimsBonus: crmPolicy.record['noclaimsbonus'],
        grade: crmPolicy.record['grade'],
        specialClauses: crmPolicy.record['specialclauses'],
        maximumCreditPeriod: crmPolicy.record['maximumcreditperiod'],
        estTurnOverNSW: crmPolicy.record['estturnovernsw'],
        estTurnOverVIC: crmPolicy.record['estturnovervic'],
        estTurnOverQLD: crmPolicy.record['estturnoverqld'],
        estTurnOverSA: crmPolicy.record['estturnoversa'],
        estTurnOverWA: crmPolicy.record['estturnoverwa'],
        estTurnOverTAS: crmPolicy.record['estturnovertas'],
        estTurnOverNT: crmPolicy.record['estturnovernt'],
        estTurnOverExports: crmPolicy.record['estturnoverexports'],
        estimatedTurnOver: crmPolicy.record['estimatedturnover'],
        actTurnOverNSW: crmPolicy.record['actturnovernsw'],
        actTurnOverVIC: crmPolicy.record['actturnovervic'],
        actTurnOverQLD: crmPolicy.record['actturnoverqld'],
        actTurnOverSA: crmPolicy.record['actturnoversa'],
        actTurnOverWA: crmPolicy.record['actturnoverwa'],
        actTurnOverTAS: crmPolicy.record['actturnovertas'],
        actTurnOverNT: crmPolicy.record['actturnovernt'],
        actTurnOverExports: crmPolicy.record['actturnoverexports'],
        actualTurnOver: crmPolicy.record['actualturnover'],
        twoYearPolicy: crmPolicy.record['2yearpolicy'],
        estTurnOverAct: crmPolicy.record['estturnoveract'],
        timeLimitNotification: crmPolicy.record['timelimitnotification'],
        actTurnOverAct: crmPolicy.record['actturnoveract'],
        aggregateOfCreditLimit: crmPolicy.record['aggregateofcreditlimit'],
        descriptionOfTrade: crmPolicy.record['descriptionoftrade'],
        creditChecks: crmPolicy.record['creditchecks'],
        healthChecks: crmPolicy.record['healthchecks'],
        alerts247: crmPolicy.record['247alerts'],
        nzCreditChecks: crmPolicy.record['nzcreditchecks'],
        overdueReportingLimit: crmPolicy.record['overduereportinglimit'],
        inceptionDate: crmPolicy.record['inceptiondate'],
        expiryDate: crmPolicy.record['expirydate'],
        isDeleted: false,
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
    return policies;
  } catch (err) {
    Logger.log.error('Error in getting policies from RSS');
    Logger.log.error(err);
  }
};

/*
Get Insurer Contacts
 */
const getInsurerContacts = async ({
  crmInsurerId,
  insurerId,
  page,
  limit,
  contacts = [],
}) => {
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
    })
      .select({ 'integration.rss': 1 })
      .lean();
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
        hasLeftCompany: crmContact.record['leftcompany'],
        isDecisionMaker:
          crmContact.record['decisionmaker'] === 0 ? false : true,
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
    return contacts;
  } catch (err) {
    Logger.log.error('Error in getting insurer contacts from RSS');
    Logger.log.error(err);
    // return reject(err);
  }
};

/*
Get Insurer Details by name
 */
const fetchInsurerDetails = async ({
  underwriterName,
  crmClientId,
  clientId,
  auditLog = {},
}) => {
  try {
    let searchQuery = underwriterName;
    let [insurer] = await Promise.all([
      Insurer.findOne({
        name: { $regex: underwriterName, $options: 'i' },
      }),
    ]);
    //TODO remove after changes are done from RSS
    if (!insurer) {
      const words = underwriterName.split(' ');
      const regex = words.map(function (e) {
        return new RegExp(e, 'i');
      });
      insurer = await Insurer.findOne({
        name: {
          $in: regex,
        },
      });
    }
    if (insurer) {
      //TODO sync insurer + client policies
      const policies = await Policy.find({ clientId: clientId }).lean();
      if (policies && policies.length !== 0) {
        return insurer;
      } else {
        const clientPolicies = await getClientPolicies({
          insurerId: insurer._id,
          crmClientId,
          clientId,
          page: 1,
          limit: 50,
        });
        let promiseArr = [];
        const policyIds = [];
        clientPolicies.forEach((policy) => {
          policyIds.push(policy.crmPolicyId);
          promiseArr.push(
            Policy.updateOne({ crmPolicyId: policy.crmPolicyId }, policy, {
              upsert: true,
            }),
          );
          /* promiseArr.push(
            addAuditLog({
              entityType: 'policy',
              entityRefId: clientPolicy._id,
              userType: auditLog.userType,
              userRefId: auditLog.userRefId,
              actionType: 'add',
              logDescription: `Client policy ${policy.product} added successfully.`,
            }),
          );*/
        });
        await Promise.all(promiseArr);
        const policies = await Policy.find({ crmPolicyId: { $in: policyIds } })
          .select('_id product policyNumber')
          .lean();
        promiseArr = [];
        policies.forEach((i) => {
          promiseArr.push(
            addAuditLog({
              entityType: 'policy',
              entityRefId: i._id,
              userType: auditLog.userType,
              userRefId: auditLog.userRefId,
              actionType: 'add',
              logDescription: `Client policy ${i.policyNumber} added successfully.`,
            }),
          );
        });
        await Promise.all(promiseArr);
      }
      return insurer;
    } else {
      let data = await getInsurers({ searchKeyword: searchQuery });
      if (!data) {
        searchQuery = { $in: words };
        data = await getInsurers({ searchKeyword: searchQuery });
      }
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
        promiseArr.push(
          Policy.updateOne(
            { clientId: policy.clientId, crmPolicyId: policy.crmPolicyId },
            policy,
            { upsert: true, setDefaultsOnInsert: true },
          ),
        );
      });
      const policies = await Policy.find({ clientId: clientId })
        .select('_id policyNumber')
        .lean();
      policies.forEach((policy) => {
        promiseArr.push(
          addAuditLog({
            entityType: 'policy',
            entityRefId: policy._id,
            userType: auditLog.userType,
            userRefId: auditLog.userRefId,
            actionType: 'add',
            logDescription: `Client policy ${policy.policyNumber} added successfully.`,
          }),
        );
      });
      await Promise.all(promiseArr);
      return insurer;
    }
  } catch (err) {
    Logger.log.error('Error in fetch insurers details ');
    Logger.log.error(err);
  }
};

/*
Get Claim List
 */
const getClaimsDetails = async ({
  crmIds = [],
  page = 1,
  limit = 10,
  query = null,
}) => {
  try {
    const url =
      'https://apiv4.reallysimplesystems.com/claims?limit=' +
      limit +
      '&page=' +
      page;
    const organization = await Organization.findOne({ isDeleted: false })
      .select({ 'integration.rss': 1 })
      .lean();
    const options = {
      method: 'GET',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
      },
    };
    if (crmIds.length !== 0) {
      options.params = {};
      options.params.q = { accountid: { $in: crmIds } };
    }
    const { data } = await axios(options);
    const claims = data.list.map((claim) => claim.record);
    const totalCount =
      data && data.metadata && data.metadata['total_count']
        ? data.metadata['total_count']
        : 0;
    return { claims, totalCount };
  } catch (e) {
    Logger.log.error('Error occurred in get claims details');
    Logger.log.error(e.message || e);
  }
};

/*
Get Claim Details by CRMId
 */
const getClaimById = async ({ crmId }) => {
  try {
    const url = 'https://apiv4.reallysimplesystems.com/claims/' + crmId;
    const organization = await Organization.findOne({ isDeleted: false })
      .select({ 'integration.rss': 1 })
      .lean();
    const options = {
      method: 'GET',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
      },
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in get claims details');
    Logger.log.error(e.message || e);
  }
};

/*
Add Claim in RSS
 */
const addClaimDetail = async ({ claim }) => {
  try {
    const url = 'https://apiv4.reallysimplesystems.com/claims';
    const organization = await Organization.findOne({ isDeleted: false })
      .select({ 'integration.rss': 1 })
      .lean();
    const options = {
      method: 'POST',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
      },
      data: claim,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in add claim details in RSS');
    Logger.log.error(e.message || e);
    return Promise.reject(Error('Error occurred in add claim details in RSS'));
  }
};

/*
Get Module Specific Document List
 */
const getDocuments = async ({ parent, parentId, page = 1, limit = 20 }) => {
  try {
    const url = `https://apiv4.reallysimplesystems.com/documents?q={"parentobject":"${parent}","parentid":${parentId}}&limit=${limit}&page=${page}`;
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
    const { data } = await axios(options);
    const documents = data.list.map((document) => document.record);
    const totalCount =
      data && data.metadata && data.metadata['total_count']
        ? data.metadata['total_count']
        : 0;
    return { documents, totalCount };
  } catch (e) {
    Logger.log.error('Error occurred in get document list from RSS');
    Logger.log.error(e.message || e);
  }
};

/*
Upload Document
 */
const uploadDocument = async ({ formData }) => {
  try {
    const url = 'https://apiv4.reallysimplesystems.com/documents';
    const organization = await Organization.findOne({ isDeleted: false })
      .select({ 'integration.rss': 1 })
      .lean();
    const options = {
      method: 'POST',
      url: url,
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        'Content-Type': 'multipart/form-data',
        ...formData.getHeaders(),
      },
      data: formData,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in upload document in RSS');
    Logger.log.error(e.response ? e.response.data : e.message);
  }
};

const downloadDocument = async ({ documentId }) => {
  try {
    const url = `https://apiv4.reallysimplesystems.com/documents/${documentId}/content`;
    const organization = await Organization.findOne({ isDeleted: false })
      .select({ 'integration.rss': 1 })
      .lean();
    const options = {
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        Authorization: 'Bearer ' + organization.integration.rss.accessToken,
        'Content-Type': 'multipart/form-data',
      },
    };
    const { data, headers } = await axios(options);
    return { data, headers };
  } catch (e) {
    Logger.log.error('Error occurred in download document');
    Logger.log.error(e);
  }
};

module.exports = {
  getClaimsManagerList,
  getClients,
  getInsurers,
  getClientById: getClientById,
  getPolicyById,
  getClientContacts,
  getClientPolicies,
  fetchInsurerDetails,
  getInsurerContacts,
  getClientsById,
  getInsurersById,
  getInsurerById,
  getClaimsDetails,
  getClaimById,
  addClaimDetail,
  getDocuments,
  uploadDocument,
  downloadDocument,
};
