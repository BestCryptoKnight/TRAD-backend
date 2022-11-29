/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const DebtorDirector = mongoose.model('debtor-director');
const CreditReport = mongoose.model('credit-report');
const Application = mongoose.model('application');
const Debtor = mongoose.model('debtor');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { fetchCreditReportInPDFFormat } = require('./illion.helper');
const {
  getEntityDetailsByABN,
  resolveEntityType,
  getEntityDetailsByNZBN,
} = require('./abr.helper');
const { uploadFile } = require('./../helper/static-file.helper');
const qbe = require('./../static-files/matrixes/qbe.json');
const bond = require('./../static-files/matrixes/bond.json');
const atradius = require('./../static-files/matrixes/atradius.json');
const coface = require('./../static-files/matrixes/coface.json');
const euler = require('./../static-files/matrixes/euler.json');
const trad = require('./../static-files/matrixes/trad.json');
const reports = [
  {
    code: 'HXBSC',
    name: 'HTML Commercial Bureau Enquiry without ASIC Docs OR',
  },
  {
    code: 'HXBCA',
    name: 'HTML Commercial Bureau Enquiry w/ refresh ASIC w/o ASIC Docs',
  },
  {
    code: 'HXPAA',
    name: 'HTML Payment Analysis & ASIC Current Extract',
  },
  {
    code: 'HXPYA',
    name: 'Risk of Late Payment Report (DDS)',
  },
  {
    code: 'HNBCau',
    name: 'HTML NZ Comm. Bureau Enq (AU Subs)',
  },
  {
    code: 'NPA',
    name: 'HTML Payment Analysis with refreshed NZCO',
  },
];

const checkEntityType = async ({ entityType, debtorId, blockers }) => {
  try {
    let continueWithAutomation = true;
    let type = 'company';
    if (entityType === 'TRUST') {
      const stakeholders = await DebtorDirector.find({
        debtorId: debtorId,
        isDeleted: false,
      })
        .select('_id type')
        .lean();
      if (stakeholders.length >= 2) {
        continueWithAutomation = false;
        blockers.push(
          'Entity type is Trust and there are more than 1 Trustees',
        );
      } else {
        type = stakeholders[0].type;
      }
    } else if (entityType === 'PARTNERSHIP') {
      continueWithAutomation = false;
      blockers.push('Entity type is Partnership');
    }
    if (entityType === 'SOLE_TRADER') {
      type = 'individual';
    }
    return { continueWithAutomation, blockers, type };
  } catch (e) {
    Logger.log.error(
      'Error occurred in check for entity type ',
      e.message || e,
    );
  }
};

const identifyInsurer = async ({ insurerName }) => {
  try {
    const matrixFileName = [
      'trad',
      'bond',
      'euler',
      'coface',
      'qbe',
      'atradius',
    ];
    let identifiedInsurer;
    matrixFileName.find((i) => {
      if (insurerName.toLowerCase().includes(i)) {
        identifiedInsurer = i;
      }
    });
    return identifiedInsurer;
  } catch (e) {
    Logger.log.error('Error occurred in identify insurer ', e.message || e);
  }
};

const identifyReport = async ({ matrix, creditLimit, reportType, country }) => {
  try {
    let identifiedPriceRange;
    let lowerLimit;
    let upperLimit;
    for (let i = 0; i < matrix.priceRange.length; i++) {
      lowerLimit = matrix.priceRange[i].lowerLimit
        ? matrix.priceRange[i].lowerLimit
        : creditLimit;
      upperLimit = matrix.priceRange[i].upperLimit
        ? matrix.priceRange[i].upperLimit
        : creditLimit;
      if (lowerLimit <= creditLimit && upperLimit >= creditLimit) {
        identifiedPriceRange = matrix.priceRange[i];
        const identifiedReportDetails =
          reportType === 'individual'
            ? identifiedPriceRange.australianIndividuals
            : country === 'AUS'
            ? identifiedPriceRange.australianCompanies
            : identifiedPriceRange.newZealand;
        let reportCode;
        if (identifiedReportDetails.reports.length === 1) {
          for (let i = 0; i < reports.length; i++) {
            if (identifiedReportDetails.reports[0].includes(reports[i].name)) {
              reportCode = reports[i].code;
              break;
            }
          }
        } else {
          //TODO change for multiple reports
          for (let i = 0; i < identifiedReportDetails.reports.length; i++) {
            for (let j = 0; j < reports.length; j++) {
              if (
                identifiedReportDetails.reports[i].includes(reports[j].name)
              ) {
                reportCode = reports[j].code;
                break;
              }
            }
          }
        }
        return { identifiedPriceRange, identifiedReportDetails, reportCode };
      } else if (i == matrix.priceRange.length - 1) {
        let blocker =
          'Requested credit limit amount exceeds all band values of policy matrix.';
        return { blocker };
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in identify report ', e);
  }
};

const getReportData = async ({
  entityType,
  type,
  debtor,
  reportCode,
  clientDebtorId,
}) => {
  try {
    let reportData;
    let reportEntityType = 'debtor';
    let isForeignCountry = false;
    let errorMessage = 'Unable to generate a report';
    if (type === 'individual') {
      //TODO add for euifax
    } else if (type === 'company' && reportCode) {
      let lookupNumber;
      let lookupMethod;

      if (debtor.address.country.code === 'AUS') {
        lookupNumber = debtor.abn ? debtor.abn : debtor.acn;
        lookupMethod = debtor.abn ? 'ABN' : 'ACN';
      } else {
        lookupNumber = debtor.acn;
        lookupMethod = 'NCN';
      }
      let debtorId = debtor._id;
      if (entityType === 'TRUST') {
        const stakeHolders = await DebtorDirector.find({
          isDeleted: false,
          debtorId: debtor._id,
        }).lean();
        //TODO handle case for country other than AUS/NZL
        for (let i = 0; i < stakeHolders.length; i++) {
          if (
            stakeHolders[i] &&
            stakeHolders[i].type === 'company' &&
            stakeHolders[i].country &&
            stakeHolders[i].country.code
          ) {
            if (stakeHolders[i].country.code === 'AUS') {
              lookupNumber = stakeHolders[i].abn
                ? stakeHolders[i].abn
                : stakeHolders[i].acn;
              lookupMethod = stakeHolders[i].abn ? 'ABN' : 'ACN';
              debtorId = stakeHolders[i]._id;
              reportEntityType = 'debtor-director';
            } else if (stakeHolders[i].country.code === 'NZL') {
              lookupNumber = stakeHolders[i].acn;
              lookupMethod = 'NCN';
              debtorId = stakeHolders[i]._id;
              reportEntityType = 'debtor-director';
            } else {
              isForeignCountry = true;
            }
            break;
          }
        }
      }
      if (!isForeignCountry) {
        reportData = await CreditReport.findOne({
          isDeleted: false,
          isExpired: false,
          entityId: debtorId,
          productCode: reportCode,
          expiryDate: { $gt: new Date() },
        });
        if (reportData && reportData._id) {
          await ClientDebtor.updateOne(
            { _id: clientDebtorId },
            { currentReportId: reportData._id },
          );
        }
        reportData =
          reportData && reportData.creditReport
            ? reportData.creditReport
            : null;
        if (!reportData) {
          const reportCodes = {
            HXBSC: ['HXBCA', 'HXPAA', 'HXPYA'],
            HXBCA: ['HXPAA', 'HXPYA'],
            HXPYA: ['HXPAA'],
            HNBCau: ['NPA'],
          };
          if (reportCodes[reportCode] && reportCodes[reportCode].length !== 0) {
            reportData = await CreditReport.findOne({
              isDeleted: false,
              isExpired: false,
              entityId: debtorId,
              productCode: { $in: reportCodes[reportCode] },
              expiryDate: { $gt: new Date() },
            });
          }
          if (reportData && reportData._id) {
            await ClientDebtor.updateOne(
              { _id: clientDebtorId },
              { currentReportId: reportData._id },
            );
          }
          reportData =
            reportData && reportData.creditReport
              ? reportData.creditReport
              : null;
        }
        if (!reportData && lookupNumber) {
          // TODO Query PDF API instead of XML API
          // reportData = await fetchCreditReport({
          //   productCode: reportCode,
          //   searchField: lookupMethod,
          //   searchValue: lookupNumber,
          // });
          reportData = await fetchCreditReportInPDFFormat({
            countryCode: debtor.address.country.code,
            productCode: reportCode,
            searchField: lookupMethod,
            searchValue: lookupNumber,
          });
          if (
            reportData &&
            reportData.Status &&
            reportData.Status.hasOwnProperty('Success') &&
            reportData.Status.hasOwnProperty('Error')
          ) {
            if (reportData.Status.Success && !reportData.Status.Error) {
              if (
                reportData.Response &&
                reportData.Response.Messages.hasOwnProperty('ErrorCount') &&
                reportData.Response.Messages.ErrorCount === 0
              ) {
                await storeReportData({
                  debtorId: debtorId,
                  productCode: reportCode,
                  reportFrom: 'illion',
                  reportName: reportData.Response.Header.ProductName,
                  reportData: reportData,
                  entityType: reportEntityType,
                  clientDebtorId: clientDebtorId,
                  countryCode: debtor.address.country.code,
                  searchField: lookupMethod,
                  searchValue: lookupNumber,
                });
                reportData = reportData.Response;
                if (
                  reportData.DynamicDelinquencyScore &&
                  reportData.DynamicDelinquencyScore.Score
                ) {
                  await Debtor.updateOne(
                    { _id: debtor._id },
                    { riskRating: reportData.DynamicDelinquencyScore.Score },
                  );
                }
              } else {
                errorMessage =
                  reportData.Response.Messages.Error.Desc &&
                  reportData.Response.Messages.Error.Num
                    ? reportData.Response.Messages.Error.Num +
                      ' - ' +
                      reportData.Response.Messages.Error.Desc
                    : 'Unable to fetch report';
                reportData = null;
              }
            } else if (!reportData.Status.Success && reportData.Status.Error) {
              errorMessage =
                reportData.Status.ErrorMessage ||
                'Error in fetching Credit Report';
              reportData = null;
            }
          } else {
            errorMessage = 'Error in fetching Credit Report';
            reportData = null;
          }
        }
      } else {
        errorMessage = 'Trustee does not belong to Australia or New Zealand';
      }
    }
    return { reportData, errorMessage };
  } catch (e) {
    Logger.log.error('Error occurred in get report data ', e);
  }
};

const getEntityData = async ({ country, businessNumber }) => {
  try {
    let response = {};
    if (country === 'AUS') {
      const entityData = await getEntityDetailsByABN({
        searchString: businessNumber,
      });
      if (entityData && entityData.response) {
        const entityDetails =
          entityData.response.businessEntity202001 ||
          entityData.response.businessEntity201408;
        const keys = ['entityType', 'entityStatus', 'goodsAndServicesTax'];
        keys.map((key) => {
          response[key] = entityDetails[key];
        });
      }
    } else {
      const entityData = await getEntityDetailsByNZBN({
        searchString: businessNumber,
      });
      if (entityData) {
        response['entityType'] = {
          entityTypeCode: entityData['entityTypeCode'],
          entityTypeDescription: entityData['entityTypeDescription'],
        };
        response['entityStatus'] = {
          entityStatusCode: entityData['entityStatusCode'],
          registrationDate: entityData['registrationDate'],
        };
        response['goodsAndServicesTax'] = entityData['gstNumbers'];
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get entity data from lookup');
    Logger.log.error(e.message || e);
  }
};

const insurerQBE = async ({ application, type, policy }) => {
  try {
    let blockers = [];
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
      blocker,
    } = await identifyReport({
      matrix: qbe,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    if (blocker) {
      blockers.push(blocker);
    } else {
      if (!reportCode) {
        blockers.push('Unable to get report code');
      }
      const [response, entityData] = await Promise.all([
        getReportData({
          type,
          reportCode,
          entityType: application.debtorId.entityType,
          debtor: application.debtorId,
          clientDebtorId: application.clientDebtorId._id,
        }),
        getEntityData({
          country: application.debtorId.address.country.code,
          businessNumber: application.debtorId.abn || application.debtorId.acn,
        }),
      ]);
      const reportData = response.reportData ? response.reportData : null;
      if (!reportData) {
        if (response.errorMessage) {
          blockers.push(response.errorMessage);
        }
      }
      blockers = await checkGuidelines({
        guidelines: qbe.generalTerms,
        application,
        entityData: entityData,
        reportData: reportData ? reportData : null,
        blockers,
        country: application.debtorId.address.country.code,
        policy,
      });
      blockers = await checkPriceRangeGuidelines({
        guidelines: identifiedReportDetails.guideLines,
        reportData: reportData ? reportData : null,
        blockers,
      });
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer QBE ', e);
  }
};

const insurerBond = async ({ application, type, policy }) => {
  try {
    let blockers = [];
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
      blocker,
    } = await identifyReport({
      matrix: bond,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    if (blocker) {
      blockers.push(blocker);
    } else {
      if (!reportCode) {
        blockers.push('Unable to get report code');
      }
      const [response, entityData] = await Promise.all([
        getReportData({
          type,
          reportCode,
          entityType: application.debtorId.entityType,
          debtor: application.debtorId,
          clientDebtorId: application.clientDebtorId._id,
        }),
        getEntityData({
          country: application.debtorId.address.country.code,
          businessNumber: application.debtorId.abn || application.debtorId.acn,
        }),
      ]);
      const reportData = response.reportData ? response.reportData : null;
      if (!reportData) {
        if (response.errorMessage) {
          blockers.push(response.errorMessage);
        }
      }
      blockers = await checkGuidelines({
        guidelines: qbe.generalTerms,
        application,
        entityData: entityData,
        reportData: reportData ? reportData : null,
        blockers,
        country: application.debtorId.address.country.code,
        policy,
      });
      blockers = await checkPriceRangeGuidelines({
        guidelines: identifiedReportDetails.guideLines,
        reportData: reportData ? reportData : null,
        blockers,
      });
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Bond ', e);
  }
};

const insurerAtradius = async ({ application, type, policy }) => {
  try {
    let blockers = [];
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
      blocker,
    } = await identifyReport({
      matrix: atradius,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    if (blocker) {
      blockers.push(blocker);
    } else {
      if (!reportCode) {
        blockers.push('Unable to get report code');
      }
      const [response, entityData] = await Promise.all([
        getReportData({
          type,
          reportCode,
          entityType: application.debtorId.entityType,
          debtor: application.debtorId,
          clientDebtorId: application.clientDebtorId._id,
        }),
        getEntityData({
          country: application.debtorId.address.country.code,
          businessNumber: application.debtorId.abn || application.debtorId.acn,
        }),
      ]);
      const reportData = response.reportData ? response.reportData : null;
      if (!reportData) {
        if (response.errorMessage) {
          blockers.push(response.errorMessage);
        }
      }
      blockers = await checkGuidelines({
        guidelines: qbe.generalTerms,
        application,
        entityData: entityData,
        reportData: reportData ? reportData : null,
        blockers,
        country: application.debtorId.address.country.code,
        policy,
      });
      blockers = await checkPriceRangeGuidelines({
        guidelines: identifiedReportDetails.guideLines,
        reportData: reportData ? reportData : null,
        blockers,
      });
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Atradius ', e);
  }
};

const insurerCoface = async ({ application, type, policy }) => {
  try {
    let blockers = [];
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
      blocker,
    } = await identifyReport({
      matrix: coface,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    if (blocker) {
      blockers.push(blocker);
    } else {
      if (!reportCode) {
        blockers.push('Unable to get report code');
      }
      const [response, entityData] = await Promise.all([
        getReportData({
          type,
          reportCode,
          entityType: application.debtorId.entityType,
          debtor: application.debtorId,
          clientDebtorId: application.clientDebtorId._id,
        }),
        getEntityData({
          country: application.debtorId.address.country.code,
          businessNumber: application.debtorId.abn || application.debtorId.acn,
        }),
      ]);
      const reportData = response.reportData ? response.reportData : null;
      if (!reportData) {
        if (response.errorMessage) {
          blockers.push(response.errorMessage);
        }
      }
      blockers = await checkGuidelines({
        guidelines: qbe.generalTerms,
        application,
        entityData: entityData,
        reportData: reportData ? reportData : null,
        blockers,
        country: application.debtorId.address.country.code,
        policy,
      });
      blockers = await checkPriceRangeGuidelines({
        guidelines: identifiedReportDetails.guideLines,
        reportData: reportData ? reportData : null,
        blockers,
      });
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Coface ', e);
  }
};

const insurerEuler = async ({ application, type, policy }) => {
  try {
    let blockers = [];
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
      blocker,
    } = await identifyReport({
      matrix: euler,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    if (blocker) {
      blockers.push(blocker);
    } else {
      if (!reportCode) {
        blockers.push('Unable to get report code');
      }
      const [response, entityData] = await Promise.all([
        getReportData({
          type,
          reportCode,
          entityType: application.debtorId.entityType,
          debtor: application.debtorId,
          clientDebtorId: application.clientDebtorId._id,
        }),
        getEntityData({
          country: application.debtorId.address.country.code,
          businessNumber: application.debtorId.abn || application.debtorId.acn,
        }),
      ]);
      const reportData = response.reportData ? response.reportData : null;
      if (!reportData) {
        if (response.errorMessage) {
          blockers.push(response.errorMessage);
        }
      }
      blockers = await checkGuidelines({
        guidelines: qbe.generalTerms,
        application,
        entityData: entityData,
        reportData: reportData ? reportData : null,
        blockers,
        country: application.debtorId.address.country.code,
        policy,
      });
      blockers = await checkPriceRangeGuidelines({
        guidelines: identifiedReportDetails.guideLines,
        reportData: reportData ? reportData : null,
        blockers,
      });
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Euler ', e);
  }
};

const insurerTrad = async ({ application, type, policy }) => {
  try {
    let blockers = [];
    const {
      identifiedReportDetails,
      identifiedPriceRange,
      reportCode,
      blocker,
    } = await identifyReport({
      matrix: trad,
      creditLimit: application.creditLimit,
      country: application.debtorId.address.country.code,
      reportType: type,
    });
    if (blocker) {
      blockers.push(blocker);
    } else {
      if (!reportCode) {
        blockers.push('Unable to get report code');
      }
      const [response, entityData] = await Promise.all([
        getReportData({
          type,
          reportCode,
          entityType: application.debtorId.entityType,
          debtor: application.debtorId,
          clientDebtorId: application.clientDebtorId._id,
        }),
        getEntityData({
          country: application.debtorId.address.country.code,
          businessNumber: application.debtorId.abn || application.debtorId.acn,
        }),
      ]);
      const reportData = response.reportData ? response.reportData : null;
      if (!reportData) {
        if (response.errorMessage) {
          blockers.push(response.errorMessage);
        }
      }
      blockers = await checkGuidelines({
        guidelines: qbe.generalTerms,
        application,
        entityData: entityData,
        reportData: reportData ? reportData : null,
        blockers,
        country: application.debtorId.address.country.code,
        policy,
      });
      blockers = await checkPriceRangeGuidelines({
        guidelines: identifiedReportDetails.guideLines,
        reportData: reportData ? reportData : null,
        blockers,
      });
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in insurer Trad ', e);
  }
};

const checkForCreditLimit = async ({ policy, creditLimit }) => {
  try {
    const response = {
      isBlocker: false,
    };
    creditLimit = parseInt(creditLimit);
    if (
      parseInt(policy.excess) > creditLimit ||
      parseInt(policy.discretionaryLimit) < creditLimit
    ) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for credit limit', e);
  }
};

const checkForEntityRegistration = async ({
  entityStatus,
  entityType,
  applicationEntityType,
  country,
}) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (country === 'AUS') {
      if (entityType && entityType.entityDescription) {
        const type = await resolveEntityType({
          entityType: entityType.entityDescription,
          country,
        });
        if (type !== applicationEntityType) {
          response.isBlocker = true;
        }
      }
      if (entityStatus && entityStatus.effectiveTo) {
        if (entityStatus.effectiveTo !== '0001-01-01') {
          response.isBlocker = true;
        }
      } else if (entityStatus && entityStatus.length !== 0) {
        const entityRegistration = entityStatus.find((i) => {
          if (i.effectiveTo === '0001-01-01') {
            return i;
          }
        });
        if (!entityRegistration) {
          response.isBlocker = true;
        }
      }
    } else {
      const inActiveCode = ['62', '80', '90', '91'];
      if (
        entityStatus &&
        entityStatus.entityStatusCode &&
        inActiveCode.includes(entityStatus.entityStatusCode)
      ) {
        response.isBlocker = true;
      }
      if (entityType && entityType.entityTypeCode) {
        //TODO change entity type helper for NZ
        const type = await resolveEntityType({
          entityType: entityType.entityTypeCode,
          country,
        });
        if (type !== applicationEntityType) {
          response.isBlocker = true;
        }
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for entity registration ', e);
  }
};

const checkForNilCreditLimitIssues = async ({ debtorId }) => {
  try {
    const response = {
      isBlocker: false,
    };
    const applications = await Application.find({
      debtorId: debtorId,
      status: 'DECLINED',
    }).lean();
    if (applications.length !== 0) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for nil credit limit ', e);
  }
};

const checkForGSTRegistration = async ({ goodsAndServicesTax, country }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (country === 'AUS') {
      if (goodsAndServicesTax && goodsAndServicesTax.effectiveTo) {
        if (goodsAndServicesTax.effectiveTo !== '0001-01-01') {
          response.isBlocker = true;
        }
      } else if (goodsAndServicesTax && goodsAndServicesTax.length !== 0) {
        const entityGSTRegistration = goodsAndServicesTax.find((i) => {
          if (i.effectiveTo === '0001-01-01') {
            return i;
          }
        });
        if (!entityGSTRegistration) {
          response.isBlocker = true;
        }
      }
    } else {
      if (
        goodsAndServicesTax &&
        Array.isArray(goodsAndServicesTax) &&
        goodsAndServicesTax.length !== 0
      ) {
        if (
          !goodsAndServicesTax[0].startDate &&
          new Date() < new Date(goodsAndServicesTax[0].startDate)
        ) {
          response.isBlocker = true;
        }
      } else {
        response.isBlocker = true;
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for gst registration ', e);
  }
};

//TODO make dynamic
const checkForEntityIncorporated = async ({ entityStatus, value, country }) => {
  try {
    const response = {
      isBlocker: false,
    };
    let today = new Date();
    today = today.setMonth(today.getMonth() - value);
    const yearBefore = new Date(today);
    if (country === 'AUS') {
      if (
        entityStatus &&
        entityStatus.entityStatusCode &&
        entityStatus.effectiveTo &&
        entityStatus.effectiveFrom
      ) {
        if (
          new Date(entityStatus.effectiveFrom) > yearBefore ||
          entityStatus.entityStatusCode.toLowerCase() !== 'active'
        ) {
          response.isBlocker = true;
        }
      } else if (entityStatus && entityStatus.length !== 0) {
        const entityRegistration = entityStatus.find((i) => {
          if (i.effectiveTo === '0001-01-01') {
            return i;
          }
        });
        if (
          new Date(entityRegistration.effectiveFrom) > yearBefore ||
          entityRegistration.entityStatusCode.toLowerCase() !== 'active'
        ) {
          response.isBlocker = true;
        }
      }
    } else {
      if (entityStatus && entityStatus.registrationDate) {
        if (new Date(entityStatus.registrationDate) > yearBefore) {
          response.isBlocker = true;
        }
      }
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for entity incorporation ', e);
  }
};

const checkForCourtAction = async ({ summaryInformation }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (parseInt(summaryInformation.CourtActionsCount) >= 1) {
      response.isBlocker = true;
    } else if (parseInt(summaryInformation.CollectionsCount) >= 1) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurre in check for court action ', e);
  }
};

const checkForNoAdverse = async ({ summaryInformation }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (
      parseInt(summaryInformation.DirectorCourtActionCount) >= 1 ||
      parseInt(summaryInformation.DirectorFailedBusinessesCount) >= 1
    ) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurre in check for court action ', e);
  }
};

const checkForRegisteredCharges = async ({ summaryInformation }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (parseInt(summaryInformation.RegisteredChargesCount) >= 1) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for registered charges ', e);
  }
};

//TODO verify minimum of 3 trade references - 3 separate suppliers + make dynamic
const checkForTradeReferences = async ({ summaryInformation, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (summaryInformation.TradeReferencesCount < value) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for trade reference ', e);
  }
};

//TODO make dynamic
const checkForRiskLevel = async ({ dynamicDelinquencyScore, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (value.includes(dynamicDelinquencyScore.RiskLevel)) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for risk level ', e);
  }
};

//TODO make dynamic
const checkForRiskScore = async ({ dynamicDelinquencyScore, value }) => {
  try {
    const response = {
      isBlocker: false,
    };
    if (dynamicDelinquencyScore.Score < value) {
      response.isBlocker = true;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in check for risk level ', e);
  }
};

const checkGuidelines = async ({
  guidelines,
  application,
  entityData,
  reportData,
  blockers,
  country,
  policy,
}) => {
  try {
    let response = {};
    if (guidelines.checkCreditLimit) {
      if (
        policy &&
        policy.discretionaryLimit &&
        policy.excess &&
        application.creditLimit
      ) {
        response = {};
        response = await checkForCreditLimit({
          policy,
          creditLimit: application.creditLimit,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push(
          'Limit must be within the Excess and Discretionary Limit',
        );
      }
    }
    if (guidelines.isEntityRegistered) {
      if (
        entityData &&
        entityData.entityType &&
        entityData.entityStatus &&
        application.debtorId.entityType
      ) {
        response = {};
        response = await checkForEntityRegistration({
          entityType: entityData.entityType,
          entityStatus: entityData.entityStatus,
          applicationEntityType: application.debtorId.entityType,
          country,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Legal entity is incorrect or company is not registered');
      }
    }
    if (guidelines.noNilCreditLimitIssued) {
      response = {};
      response = await checkForNilCreditLimitIssues({
        debtorId: application.debtorId._id,
      });
      if (response.isBlocker) {
        blockers.push('Other insurers have issued a NIL credit limit');
      }
    }
    if (guidelines.checkForGSTRegistration) {
      response = {};
      if (entityData && entityData.goodsAndServicesTax) {
        response = await checkForGSTRegistration({
          goodsAndServicesTax: entityData.goodsAndServicesTax,
          country: application.debtorId.address.country.code,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Entity is not registered for GST');
      }
    }
    if (guidelines.entityIncorporated) {
      response = {};
      if (entityData && entityData.entityStatus) {
        response = await checkForEntityIncorporated({
          entityStatus: entityData.entityStatus,
          value: guidelines.entityIncorporated.value,
          country: application.debtorId.address.country.code,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Company is incorporated in last 12 months');
      }
    }
    if (guidelines.courtCharges) {
      response = {};
      if (reportData && reportData.SummaryInformation) {
        response = await checkForCourtAction({
          summaryInformation: reportData.SummaryInformation,
        });
      }
      if (response.isBlocker) {
        blockers.push('Court actions or legal or collection activity present');
      }
    }
    if (guidelines.courtChargesWithMinMaxAmount) {
      response = {};
      if (reportData && reportData.SummaryInformation) {
        response = await checkForCourtAction({
          summaryInformation: reportData.SummaryInformation,
        });
      }
      if (response.isBlocker) {
        blockers.push(
          'Court actions or legal or collection activity present above a maximum of $5,000 on a Limit up to $50,000',
        );
      }
    }
    if (guidelines.courtChargesWithAmount) {
      response = {};
      if (reportData && reportData.SummaryInformation) {
        response = await checkForCourtAction({
          summaryInformation: reportData.SummaryInformation,
        });
      }
      if (response.isBlocker) {
        blockers.push(
          'Court actions or legal or collection activity present above a maximum of $5,000',
        );
      }
    }
    if (guidelines.noAdverse) {
      response = {};
      if (reportData && reportData.SummaryInformation) {
        response = await checkForNoAdverse({
          summaryInformation: reportData.SummaryInformation,
        });
      }
      if (response.isBlocker) {
        blockers.push('Adverse against director/s, owner/s or Shareholders');
      }
    }
    if (guidelines.noRegisteredCharges) {
      response = {};
      if (reportData && reportData.SummaryInformation) {
        response = await checkForRegisteredCharges({
          summaryInformation: reportData.SummaryInformation,
        });
      }
      if (response.isBlocker) {
        blockers.push('Related party registered charges');
      }
    }
    if (
      guidelines.soleTraderRegisteredForGST &&
      application.debtorId.entityType === 'SOLE_TRADER'
    ) {
      response = {};
      if (entityData && entityData.goodsAndServicesTax) {
        response = await checkForGSTRegistration({
          goodsAndServicesTax: entityData.goodsAndServicesTax,
          country: application.debtorId.address.country.code,
        });
      } else {
        response.isBlocker = true;
      }
      if (response.isBlocker) {
        blockers.push('Sole Trader is not registered for GST');
      }
    }
    if (
      guidelines.soleTraderNotRegistered &&
      application.debtorId.entityType === 'SOLE_TRADER'
    ) {
      //TODO need to check
      //RMP only
      if (response.isBlocker) {
        blockers.push(guidelines.soleTraderNotRegistered.conditionString);
      }
    }
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in check guidelines ', e);
  }
};

const checkPriceRangeGuidelines = async ({
  guidelines,
  reportData,
  blockers,
}) => {
  try {
    let response = {};
    if (guidelines.paymentRiskLevel) {
      response = {};
      if (reportData && reportData.DynamicDelinquencyScore) {
        response = await checkForRiskLevel({
          dynamicDelinquencyScore: reportData.DynamicDelinquencyScore,
          value: guidelines.paymentRiskLevel.value,
        });
      }
      if (response.isBlocker) {
        blockers.push(
          'The Late Payment Risk Level indicated by D&B is “High” / “Very High” / “Severe”',
        );
      }
    }
    if (guidelines.delinquencyScore) {
      response = {};
      if (
        reportData &&
        reportData.DynamicDelinquencyScore &&
        guidelines.delinquencyScore?.value
      ) {
        response = await checkForRiskScore({
          dynamicDelinquencyScore: reportData.DynamicDelinquencyScore,
          value: guidelines.delinquencyScore.value,
        });
      }
      if (response.isBlocker) {
        blockers.push(
          `The D&B Dynamic Delinquency Score is lower than ${guidelines.delinquencyScore.value}`,
        );
      }
    }
    if (guidelines.delinquencyScoreForAUS) {
      response = {};
      if (
        reportData &&
        reportData.DynamicDelinquencyScore &&
        guidelines.delinquencyScoreForAUS?.value
      ) {
        response = await checkForRiskScore({
          dynamicDelinquencyScore: reportData.DynamicDelinquencyScore,
          value: guidelines.delinquencyScoreForAUS.value,
        });
      }
      if (response.isBlocker) {
        blockers.push(
          `The D&B Dynamic Delinquency Score is lower than ${guidelines.delinquencyScoreForAUS.value}`,
        );
      }
    }
    if (guidelines.delinquencyScoreForNZL) {
      response = {};
      if (reportData && reportData.DynamicDelinquencyScore) {
        response = await checkForRiskScore({
          dynamicDelinquencyScore: reportData.DynamicDelinquencyScore,
          value: guidelines.delinquencyScoreForNZL.value,
        });
      }
      if (response.isBlocker) {
        blockers.push(
          `The D&B Dynamic Delinquency Score is lower than ${guidelines.delinquencyScoreForAUS.value}`,
        );
      }
    }
    if (guidelines.tradePaymentInfo) {
      blockers.push(
        'Trade payment info is not included in the mercantile report',
      );
    }
    /*if (guidelines.enquireUnderwriter) {
      blockers.push(guidelines.enquireUnderwriter.conditionString);
    }
    if (guidelines.noRecommendation) {
      blockers.push(guidelines.noRecommendation.conditionString);
    }
    if (guidelines.recommendation) {
      blockers.push(guidelines.recommendation.conditionString);
    }
    if (guidelines.approvedOrDeclines) {
      blockers.push(guidelines.approvedOrDeclines.conditionString);
    }*/
    return blockers;
  } catch (e) {
    Logger.log.error('Error occurred in check price range guidelines ', e);
  }
};

const storeReportData = async ({
  debtorId,
  reportFrom,
  reportName,
  productCode,
  reportData,
  entityType,
  clientDebtorId,
}) => {
  try {
    const date = new Date();
    let expiryDate = new Date(date.setMonth(date.getMonth() + 12));
    expiryDate = new Date(expiryDate.setDate(expiryDate.getDate() - 1));
    const response = await CreditReport.create({
      entityId: debtorId,
      entityType,
      reportProvider: reportFrom,
      productCode,
      name: reportName,
      expiryDate,
      creditReport: reportData.Response,
    });
    await ClientDebtor.updateOne(
      { _id: clientDebtorId },
      { currentReportId: reportData._id },
    );
    if (reportData.ReportsData && reportData.ReportsData.length) {
      pdfData = reportData.ReportsData.find(
        (element) => element.ReportFormat === 2 && element.Base64EncodedData,
      );
      if (pdfData && pdfData.Base64EncodedData) {
        storePDFCreditReport({
          reportId: response._id,
          productCode,
          pdfBase64: pdfData.Base64EncodedData,
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in store report data ', e);
  }
};

const storePDFCreditReport = async ({ reportId, productCode, pdfBase64 }) => {
  try {
    const buffer = Buffer.from(pdfBase64, 'base64');
    const fileName = productCode + '-' + Date.now() + '.pdf';
    const s3Response = await uploadFile({
      file: buffer,
      filePath: 'credit-reports/' + fileName,
      fileType: 'application/pdf',
      isPublicFile: false,
    });
    await CreditReport.updateOne(
      { _id: reportId },
      {
        keyPath: s3Response.key || s3Response.Key,
        originalFileName: fileName,
      },
    );
  } catch (e) {
    Logger.log.error('Error occurred in store pdf report data ', e);
  }
};

module.exports = {
  checkEntityType,
  identifyInsurer,
  insurerQBE,
  insurerBond,
  insurerAtradius,
  insurerCoface,
  insurerEuler,
  insurerTrad,
  storePDFCreditReport,
};
