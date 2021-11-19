/*
 * Module Imports
 * */
const fs = require('fs');
const mongoose = require('mongoose');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');
const CreditReport = mongoose.model('credit-report');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./services/logger');
const { fetchCreditReportInPDFFormat } = require('./helper/illion.helper');
const { uploadFile } = require('./helper/static-file.helper');
const { getClientPolicies } = require('./helper/rss.helper');

const fetchPDFCreditReports = async () => {
  try {
    const reports = await CreditReport.find({
      keyPath: { $exists: false },
    }).lean();
    let searchField;
    let searchValue;
    for (let i = 0; i < reports.length; i++) {
      console.log('Index', i);
      console.log('Report Id', reports[i]._id);
      if (reports[i].entityType === 'debtor') {
        const debtor = await Debtor.findOne({
          _id: reports[i].entityId,
        }).lean();
        if (debtor?.address?.country.code === 'AUS') {
          searchField = debtor.abn ? 'ABN' : 'ACN';
          searchValue = debtor.abn ? debtor.abn : debtor.acn;
        } else {
          searchField = 'NCN';
          searchValue = debtor.acn ? debtor.acn : '';
        }
        const pdfReport = await fetchCreditReportInPDFFormat({
          searchField,
          searchValue,
          countryCode: debtor?.address?.country?.code,
          productCode: reports[i].productCode,
        });
        if (pdfReport?.Status?.Success) {
          const buffer = Buffer.from(
            pdfReport?.ReportsData?.[0]?.Base64EncodedData,
            'base64',
          );
          const fileName = reports[i].productCode + '-' + Date.now() + '.pdf';
          const s3Response = await uploadFile({
            file: buffer,
            filePath: 'credit-reports/' + fileName,
            fileType: 'application/pdf',
            isPublicFile: false,
          });
          const update = {
            keyPath: s3Response.key || s3Response.Key,
            originalFileName: fileName,
          };
          console.log('update', update);
          await CreditReport.updateOne({ _id: reports[i]._id }, update);
        }
      } else if (reports[i].entityType === 'debtor-director') {
        const stakeholder = await DebtorDirector.findOne({
          _id: reports[i].entityId,
        }).lean();
        if (stakeholder.country && stakeholder.country.code === 'AUS') {
          searchValue = stakeholder.abn ? stakeholder.abn : stakeholder.acn;
          searchField = stakeholder.abn ? 'ABN' : 'ACN';
        } else {
          searchValue = stakeholder.acn ? stakeholder.acn : '';
          searchField = 'NCN';
        }
        const pdfReport = await fetchCreditReportInPDFFormat({
          searchField,
          searchValue,
          countryCode: stakeholder.country.code,
          productCode: reports[i].productCode,
        });
        if (pdfReport?.Status?.Success) {
          const buffer = Buffer.from(
            pdfReport?.ReportsData?.[0]?.Base64EncodedData,
            'base64',
          );
          const fileName = reports[i].productCode + '-' + Date.now() + '.pdf';
          const s3Response = await uploadFile({
            file: buffer,
            filePath: 'credit-reports/' + fileName,
            fileType: 'application/pdf',
            isPublicFile: false,
          });
          const update = {
            keyPath: s3Response.key || s3Response.Key,
            originalFileName: fileName,
          };
          await CreditReport.updateOne({ _id: reports[i]._id }, update);
          console.log('Report data updated....', reports[i]._id);
        }
      }
    }
    console.log('Completed...............');
  } catch (e) {
    console.log('Error occurred in fetch PDF report...', e);
    return Promise.reject(e);
  }
};

const syncPolicies = async () => {
  try {
    const client = await Client.find({})
      .select('_id name crmClientId insurerId')
      .lean();
    let promiseArr = [];
    for (let i = 0; i < client.length; i++) {
      if (client[i] && client[i]._id && client[i].insurerId) {
        const policiesFromCrm = await getClientPolicies({
          clientId: client[i]._id,
          crmClientId: client[i].crmClientId,
          insurerId: client[i].insurerId,
          limit: 50,
          page: 1,
        });
        for (let j = 0; j < policiesFromCrm.length; j++) {
          promiseArr.push(
            Policy.updateOne(
              { crmPolicyId: policiesFromCrm[j].crmPolicyId, isDeleted: false },
              policiesFromCrm[j],
              { upsert: true, setDefaultsOnInsert: true },
            ),
          );
        }
      }
    }
    await Promise.all(promiseArr);
  } catch (e) {
    Logger.log.error('Error occurred sync policies', e);
  }
};

const updateCreditLimitCreatedAtDate = async () => {
  try {
    const creditLimits = await ClientDebtor.find({
      isActive: true,
      creditLimit: { $exists: true, $ne: null },
    })
      .populate('activeApplicationId')
      .lean();
    for (let i = 0; i < creditLimits.length; i++) {
      console.log('Index...', i);
      if (
        creditLimits[i]?.createdAt &&
        creditLimits[i]?.activeApplicationId?.approvalOrDecliningDate
      ) {
        const c = await ClientDebtor.updateOne(
          { _id: creditLimits[i]._id },
          {
            createdAt:
              creditLimits[i]?.activeApplicationId?.approvalOrDecliningDate,
          },
        );
        console.log('Updated..............', c);
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in update credit limit date', e);
  }
};

const getDuplicateData = async () => {
  try {
    const debtors = await Debtor.aggregate([
      { $group: { _id: '$abn', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
      { $project: { name: '$entityName', _id: 0, abn: '$abn' } },
    ]);
    console.log(JSON.stringify(debtors, null, 3));
    console.log('Count::', debtors.length);
  } catch (e) {
    Logger.log.error('Error occurred in find duplicate data', e);
  }
};

const updateSurrenderedStatus = async () => {
  try {
    await ClientDebtor.updateMany(
      { creditLimit: null, activeApplicationId: { $exists: true } },
      { status: 'SURRENDERED' },
    );
    console.log('Script executed successfully................');
  } catch (e) {
    Logger.log.error('Error occurred in update credit limit status', e);
  }
};

const updateCreditLimit = async () => {
  try {
    const creditLimits = await ClientDebtor.find({}).lean();
    const updatedCreditLimits = [];
    for (let i = 0; i < creditLimits.length; i++) {
      console.log('index.........', i);
      const application = await Application.find({
        status: { $in: ['APPROVED', 'DECLINED', 'WITHDRAWN', 'CANCELLED'] },
        clientId: creditLimits[i].clientId,
        debtorId: creditLimits[i].debtorId,
      })
        .sort({ approvalOrDecliningDate: -1 })
        .limit(1);
      if (
        application &&
        application.length !== 0 &&
        application[0]?._id &&
        (!creditLimits[i]?.activeApplicationId ||
          creditLimits[i]?.activeApplicationId !== application[0]?._id ||
          !creditLimits[i]?.status)
      ) {
        updatedCreditLimits.push({
          _id: creditLimits[i]._id,
          oldApplicationId: creditLimits[i].activeApplicationId,
          newApplicationId: application[0]._id,
          oldCreditLimit: creditLimits[i].creditLimit,
          oldIsActiveFlag: creditLimits[i].isActive,
        });
        creditLimits[i].activeApplicationId = application[0]._id;
        if (
          !creditLimits[i]?.status ||
          creditLimits[i]?.status !== 'SURRENDERED'
        ) {
          switch (application[0].status) {
            case 'APPROVED':
              creditLimits[i].status = application[0].status;
              creditLimits[i].creditLimit = application[0].acceptedAmount;
              creditLimits[i].isActive = true;
              break;
            case 'DECLINED':
              creditLimits[i].status = application[0].status;
              creditLimits[i].creditLimit = 0;
              creditLimits[i].isActive = true;
              break;
            case 'WITHDRAWN':
            case 'CANCELLED':
              creditLimits[i].isActive = false;
              break;
          }
        }
        await ClientDebtor.updateOne(
          { _id: creditLimits[i]._id },
          creditLimits[i],
        );
      }
    }
    console.log(
      'Updated credit limits',
      JSON.stringify(updatedCreditLimits, null, 3),
    );
    fs.writeFileSync(
      'updatedCreditLimits.json',
      JSON.stringify(updatedCreditLimits),
    );
  } catch (e) {
    console.log('Error occurred in update credit limit..', e);
  }
};

const removeRedundantCreditLimits = async () => {
  try {
    console.log('Script started successfully.........', new Date());
    const clientDebtorPipeline = [
      {
        $group: {
          _id: { clientId: '$clientId', debtorId: '$debtorId' },
          // applications: { $push: '$activeApplicationId' },
          creditLimits: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          id: '$_id',
          creditLimitsLength: {
            $size: '$creditLimits',
          },
          creditLimits: '$creditLimits',
          // applications: '$applications',
        },
      },
      {
        $match: {
          creditLimitsLength: {
            $gt: 1,
          },
        },
      },
    ];
    const clientDebtors = await ClientDebtor.aggregate(
      clientDebtorPipeline,
    ).allowDiskUse(true);
    console.log('Processing credit limits..........');
    const deletedCreditLimits = [];
    for (let i = 0; i < clientDebtors.length; i++) {
      const clientDebtorIds = clientDebtors[i].creditLimits.map((d) => d._id);
      console.log(JSON.stringify(clientDebtorIds, null, 3));
      const primaryClientDebtorId = clientDebtorIds.shift();
      const application = await Application.find({
        status: { $in: ['APPROVED', 'DECLINED'] },
        clientId: clientDebtors[i].id.clientId,
        debtorId: clientDebtors[i].id.debtorId,
      })
        .sort({ approvalOrDecliningDate: -1 })
        .limit(1);
      if (primaryClientDebtorId && application && application.length !== 0) {
        const promiseArr = [];
        const update = {
          activeApplicationId: application[0]._id,
          status: application[0].status,
          isActive: true,
        };
        switch (application[0].status) {
          case 'APPROVED':
            update.creditLimit = application[0].acceptedAmount;
            break;
          case 'DECLINED':
            update.creditLimit = 0;
            break;
        }
        promiseArr.push(
          ClientDebtor.deleteMany({ _id: { $in: clientDebtorIds } }),
        );
        promiseArr.push(
          ClientDebtor.updateOne({ _id: primaryClientDebtorId }, update),
        );
        promiseArr.push(
          Application.updateMany(
            {
              clientId: clientDebtors[i].id.clientId,
              debtorId: clientDebtors[i].id.debtorId,
            },
            { $set: { clientDebtorId: primaryClientDebtorId } },
          ),
        );
        let results = await Promise.all(promiseArr);
        deletedCreditLimits.push({
          primaryClientDebtorId,
          otherDebtorIds: clientDebtorIds,
          results,
        });
      } else {
        deletedCreditLimits.push({
          primaryClientDebtorId,
          otherDebtorIds: clientDebtorIds,
          results: 'No application found',
        });
      }
    }
    fs.writeFileSync(
      'delete-credit-limits-results.json',
      JSON.stringify(deletedCreditLimits),
    );
    console.log(
      'Successfully deleted redundant credit limits.................',
    );
  } catch (e) {
    console.log('Error occurred in remove redundant credit limits..', e);
  }
};

const updateCreditLimits = async () => {
  try {
    const creditLimits = await ClientDebtor.find({
      activeApplicationId: { $exists: true, $ne: null },
    })
      .populate('activeApplicationId')
      .lean();
    const promises = [];
    for (let i = 0; i < creditLimits.length; i++) {
      if (creditLimits[i]?.activeApplicationId) {
        promises.push(
          ClientDebtor.updateOne(
            { _id: creditLimits[i]._id },
            {
              $set: {
                expiryDate: creditLimits[i].activeApplicationId?.expiryDate,
                isEndorsedLimit:
                  creditLimits[i].activeApplicationId?.isEndorsedLimit,
              },
            },
          ),
        );
      }
    }
    await Promise.all(promises);
    console.log('Script executed successfully.............');
  } catch (e) {
    console.log('Error occurred in update credit limits...', e);
  }
};

module.exports = { removeRedundantCreditLimits, updateCreditLimits };
