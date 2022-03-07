/*
 * Module Imports
 * */
const ExcelJS = require('exceljs');
let mongoose = require('mongoose');
const ImportApplicationDump = mongoose.model('import-application-dump');
const Application = mongoose.model('application');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const Note = mongoose.model('note');
const Organization = mongoose.model('organization');
const { numberWithCommas } = require('./report.helper');
const { checkDirectorsOfDebtor } = require('./debtor.helper');
const { getEntityDetailsByBusinessNumber } = require('./abr.helper');
const { checkForAutomation } = require('./application.helper');
const {
  countryList,
  entityType,
  companyEntityType,
} = require('./../static-files/staticData.json');
const Logger = require('./../services/logger');

const readExcelFile = async (fileBuffer) => {
  try {
    let workbook = new ExcelJS.Workbook();
    // await workbook.xlsx.readFile('./Applications_Import.xlsx');
    await workbook.xlsx.load(fileBuffer);
    let applications = [];
    let stakeHolders = [];
    let unProcessedApplications = [];
    let applicationHeaders = {
      'Client Code': { columnName: null },
      'Debtor Code': { columnName: null },
      'Debtor ABN': { columnName: null },
      'Debtor ACN': { columnName: null },
      'Company Registration Number': { columnName: null },
      'Debtor Entity Name': { columnName: null },
      'Unit Number': { columnName: null },
      'Street Name': { columnName: null },
      Suburb: { columnName: null },
      'Trading Name': { columnName: null },
      Property: { columnName: null },
      'Phone Number': { columnName: null },
      'Street Number': { columnName: null },
      'Street Type': { columnName: null },
      'Entity Type': { columnName: null },
      State: { columnName: null },
      Postcode: { columnName: null },
      Country: { columnName: null },
      'Credit Limit Amount': { columnName: null },
      'Outstanding Amount': { columnName: null },
      'Orders on hand': { columnName: null },
      'Any extended payment terms outside your policy standard terms?*': {
        columnName: null,
      },
      'Details for extended Payment Terms': { columnName: null },
      'Any overdue amounts passed your maximum extension period / Credit period?*': {
        columnName: null,
      },
      'Details for Overdue Amount': { columnName: null },
      'Application Note': { columnName: null },
    };
    let stakeHolderHeaders = {
      'Debtor Code': { columnName: null },
      'Debtor ABN': { columnName: null },
      'Debtor ACN': { columnName: null },
      'Debtor Registration Number': { columnName: null },
      'Company Registration Number': { columnName: null },
      'Partner Type': { columnName: null },
      Title: { columnName: null },
      'First Name': { columnName: null },
      'Middle Name': { columnName: null },
      'Last Name': { columnName: null },
      'Date of Birth': { columnName: null },
      'Driver Licence Number': { columnName: null },
      'Phone Number': { columnName: null },
      'Mobile Number': { columnName: null },
      Email: { columnName: null },
      'Allow Credit History Check for Individual': { columnName: null },
      'Unit Number': { columnName: null },
      'Street Number': { columnName: null },
      'Street Name': { columnName: null },
      'Street Type': { columnName: null },
      Suburb: { columnName: null },
      Country: { columnName: null },
      Postcode: { columnName: null },
      State: { columnName: null },
      ACN: { columnName: null },
      'Trading Name': { columnName: null },
      'Entity Name': { columnName: null },
      'Entity Type': { columnName: null },
      ABN: { columnName: null },
    };

    const applicationWorksheet = workbook.getWorksheet('Applications');
    if (!applicationWorksheet) {
      return {
        isImportCompleted: false,
        reasonForInCompletion: 'Missing Applications worksheet',
      };
    }
    const stakeHolderWorksheet = workbook.getWorksheet('Stakeholders');
    if (!stakeHolderWorksheet) {
      return {
        isImportCompleted: false,
        reasonForInCompletion: 'Missing Stakeholders worksheet',
      };
    }
    for (let i = 0; i < Object.keys(applicationHeaders).length; i++) {
      const column = applicationWorksheet.model.rows[0].cells.find(
        (cell) => cell.value === Object.keys(applicationHeaders)[i],
      );
      if (!column || (column && !column.address)) {
        return {
          isImportCompleted: false,
          reasonForInCompletion: 'Missing Headers from Application sheet',
        };
      }
      applicationHeaders[
        Object.keys(applicationHeaders)[i]
      ].columnName = column.address.substr(0, column.address.length - 1);
    }
    for (let i = 0; i < Object.keys(stakeHolderHeaders).length; i++) {
      const column = stakeHolderWorksheet.model.rows[0].cells.find(
        (cell) => cell.value === Object.keys(stakeHolderHeaders)[i],
      );
      if (!column || !column.address) {
        return {
          isImportCompleted: false,
          reasonForInCompletion: 'Missing Headers from Stakeholders sheet',
        };
      }
      stakeHolderHeaders[
        Object.keys(stakeHolderHeaders)[i]
      ].columnName = column.address.substr(0, column.address.length - 1);
    }
    for (let i = 1; i < stakeHolderWorksheet.model.rows.length; i++) {
      if (
        stakeHolderWorksheet.model.rows[i].cells &&
        stakeHolderWorksheet.model.rows[i].cells.length !== 0
      ) {
        const rowNumber = stakeHolderWorksheet.model.rows[i].number;
        let stakeholder = {
          debtorCode: stakeHolderWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${stakeHolderHeaders['Debtor Code']['columnName']}${rowNumber}`,
          )?.value,
          debtorAbn: stakeHolderWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${stakeHolderHeaders['Debtor ABN']['columnName']}${rowNumber}`,
          )?.value,
          debtorAcn: stakeHolderWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${stakeHolderHeaders['Debtor ACN']['columnName']}${rowNumber}`,
          )?.value,
          debtorRegistrationNumber: stakeHolderWorksheet.model.rows[
            i
          ].cells.find(
            (c) =>
              c.address ===
              `${stakeHolderHeaders['Debtor Registration Number']['columnName']}${rowNumber}`,
          )?.value,
          partnerType: stakeHolderWorksheet.model.rows[i].cells
            .find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Partner Type']['columnName']}${rowNumber}`,
            )
            ?.value?.toUpperCase(),
          individual: {
            title: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Title']['columnName']}${rowNumber}`,
            )?.value,
            firstName: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['First Name']['columnName']}${rowNumber}`,
            )?.value,
            middleName: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Middle Name']['columnName']}${rowNumber}`,
            )?.value,
            lastName: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Last Name']['columnName']}${rowNumber}`,
            )?.value,
            dateOfBirth: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Date of Birth']['columnName']}${rowNumber}`,
            )?.value,
            driverLicenceNumber: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Driver Licence Number']['columnName']}${rowNumber}`,
            )?.value,
            phoneNumber: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Phone Number']['columnName']}${rowNumber}`,
            )?.value,
            mobileNumber: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Mobile Number']['columnName']}${rowNumber}`,
            )?.value,
            allowToCheckCreditHistory: stakeHolderWorksheet.model.rows[
              i
            ].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Allow Credit History Check for Individual']['columnName']}${rowNumber}`,
            )?.value,
            email: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Email']['columnName']}${rowNumber}`,
            )?.value,
            address: {
              unitNumber: stakeHolderWorksheet.model.rows[i].cells.find(
                (c) =>
                  c.address ===
                  `${stakeHolderHeaders['Unit Number']['columnName']}${rowNumber}`,
              )?.value,
              streetName: stakeHolderWorksheet.model.rows[i].cells.find(
                (c) =>
                  c.address ===
                  `${stakeHolderHeaders['Street Name']['columnName']}${rowNumber}`,
              )?.value,
              streetNumber: stakeHolderWorksheet.model.rows[i].cells.find(
                (c) =>
                  c.address ===
                  `${stakeHolderHeaders['Street Number']['columnName']}${rowNumber}`,
              )?.value,
              streetType: stakeHolderWorksheet.model.rows[i].cells.find(
                (c) =>
                  c.address ===
                  `${stakeHolderHeaders['Street Type']['columnName']}${rowNumber}`,
              )?.value,
              state: stakeHolderWorksheet.model.rows[i].cells.find(
                (c) =>
                  c.address ===
                  `${stakeHolderHeaders['State']['columnName']}${rowNumber}`,
              )?.value,
              postcode: stakeHolderWorksheet.model.rows[i].cells.find(
                (c) =>
                  c.address ===
                  `${stakeHolderHeaders['Postcode']['columnName']}${rowNumber}`,
              )?.value,
            },
          },
          company: {
            acn: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['ACN']['columnName']}${rowNumber}`,
            )?.value,
            tradingName: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Trading Name']['columnName']}${rowNumber}`,
            )?.value,
            entityName: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Entity Name']['columnName']}${rowNumber}`,
            )?.value,
            entityType: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Entity Type']['columnName']}${rowNumber}`,
            )?.value,
            abn: stakeHolderWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['ABN']['columnName']}${rowNumber}`,
            )?.value,
            companyRegistrationNumber: stakeHolderWorksheet.model.rows[
              i
            ].cells.find(
              (c) =>
                c.address ===
                `${stakeHolderHeaders['Company Registration Number']['columnName']}${rowNumber}`,
            )?.value,
          },
          countryCode: stakeHolderWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${stakeHolderHeaders['Country']['columnName']}${rowNumber}`,
          )?.value,
        };
        if (stakeholder.countryCode) {
          stakeholder.countryCode = countryList.find(
            (c) => c.name === stakeholder.countryCode,
          )?._id;
        }
        if (stakeholder.company.entityType) {
          stakeholder.company.entityType = companyEntityType.find(
            (c) => c.name === stakeholder.company.entityType,
          )?._id;
        }
        stakeHolders.push(stakeholder);
      }
    }
    applicationLoop: for (
      let i = 1;
      i < applicationWorksheet.model.rows.length;
      i++
    ) {
      if (
        applicationWorksheet.model.rows[i].cells &&
        applicationWorksheet.model.rows[i].cells.length !== 0
      ) {
        const rowNumber = applicationWorksheet.model.rows[i].number;
        let application = {
          clientCode: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Client Code']['columnName']}${rowNumber}`,
          )?.value,
          debtorCode: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Debtor Code']['columnName']}${rowNumber}`,
          )?.value,
          abn: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Debtor ABN']['columnName']}${rowNumber}`,
          )?.value,
          acn: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Debtor ACN']['columnName']}${rowNumber}`,
          )?.value,
          entityName: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Debtor Entity Name']['columnName']}${rowNumber}`,
          )?.value,
          companyRegistrationNumber: applicationWorksheet.model.rows[
            i
          ].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Company Registration Number']['columnName']}${rowNumber}`,
          )?.value,
          entityType: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Entity Type']['columnName']}${rowNumber}`,
          )?.value,
          contactNumber: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Phone Number']['columnName']}${rowNumber}`,
          )?.value,
          address: {
            property: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Unit Number']['columnName']}${rowNumber}`,
            )?.value,
            unitNumber: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Unit Number']['columnName']}${rowNumber}`,
            )?.value,
            streetName: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Street Name']['columnName']}${rowNumber}`,
            )?.value,
            streetNumber: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Street Number']['columnName']}${rowNumber}`,
            )?.value,
            suburb: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Suburb']['columnName']}${rowNumber}`,
            )?.value,
            streetType: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Street Type']['columnName']}${rowNumber}`,
            )?.value,
            state: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['State']['columnName']}${rowNumber}`,
            )?.value,
            countryCode: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Country']['columnName']}${rowNumber}`,
            )?.value,
            postcode: applicationWorksheet.model.rows[i].cells.find(
              (c) =>
                c.address ===
                `${applicationHeaders['Postcode']['columnName']}${rowNumber}`,
            )?.value,
          },
          creditLimit: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Credit Limit Amount']['columnName']}${rowNumber}`,
          )?.value,
          outstandingAmount: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Outstanding Amount']['columnName']}${rowNumber}`,
          )?.value,
          ordersOnHand: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Orders on hand']['columnName']}${rowNumber}`,
          )?.value,
          extendedTerms: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Any extended payment terms outside your policy standard terms?*']['columnName']}${rowNumber}`,
          )?.value,
          detailsForExtendedTerms: applicationWorksheet.model.rows[
            i
          ].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Details for extended Payment Terms']['columnName']}${rowNumber}`,
          )?.value,
          overdueAmounts: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Any overdue amounts passed your maximum extension period / Credit period?*']['columnName']}${rowNumber}`,
          )?.value,
          detailsForOverdueAmounts: applicationWorksheet.model.rows[
            i
          ].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Details for Overdue Amount']['columnName']}${rowNumber}`,
          )?.value,
          applicationNote: applicationWorksheet.model.rows[i].cells.find(
            (c) =>
              c.address ===
              `${applicationHeaders['Application Note']['columnName']}${rowNumber}`,
          )?.value,
        };
        if (application.address.countryCode) {
          application.address.countryCode = countryList.find(
            (c) => c.name === application.address.countryCode,
          )?._id;
        }
        if (application.entityType) {
          application.entityType = entityType.find(
            (c) => c.name === application.entityType,
          )?._id;
        }
        if (
          !application.entityType ||
          !entityType.find((e) => e._id === application.entityType)
        ) {
          unProcessedApplications.push({
            ...application,
            reason: 'Invalid Entity Type found.',
          });
          continue;
        }
        /*Validation on Mandatory fields start*/
        if (
          !application.clientCode ||
          (!application.debtorCode &&
            !application.abn &&
            !application.acn &&
            !application.companyRegistrationNumber)
        ) {
          unProcessedApplications.push({
            ...application,
            reason:
              'Missing mandatory fields as a part of Client (Client Code) or Debtor (Debtor Code, ABN, or ACN)',
          });
          continue;
        }
        if (
          !application.debtorCode &&
          (!application.address.countryCode ||
            !countryList.find((c) => c._id === application.address.countryCode))
        ) {
          unProcessedApplications.push({
            ...application,
            reason: 'No or invalid value found for country.',
          });
          continue;
        }
        if (!application.creditLimit || isNaN(application.creditLimit)) {
          let reason = '';
          if (
            application.hasOwnProperty('creditLimit') &&
            isNaN(application.creditLimit)
          ) {
            reason = 'Credit Limit must be a number.';
          } else if (
            application.hasOwnProperty('creditLimit') &&
            application.creditLimit <= 0
          ) {
            reason = 'Credit Limit must be a positive number.';
          }
          unProcessedApplications.push({
            ...application,
            reason: reason,
          });
          continue;
        }
        if (
          !application.extendedTerms ||
          (application.extendedTerms.toLowerCase() !== 'yes' &&
            application.extendedTerms.toLowerCase() !== 'no') ||
          !application.overdueAmounts ||
          (application.overdueAmounts.toLowerCase() !== 'yes' &&
            application.overdueAmounts.toLowerCase() !== 'no') ||
          (application.extendedTerms.toLowerCase() === 'yes' &&
            !application.detailsForExtendedTerms) ||
          (application.overdueAmounts.toLowerCase() === 'yes' &&
            !application.detailsForOverdueAmounts)
        ) {
          unProcessedApplications.push({
            ...application,
            reason: 'Missing clarity on extended terms or overdue amounts.',
          });
          continue;
        }
        /*Validation on Mandatory fields end*/
        if (
          !application.debtorCode &&
          (application.abn ||
            application.acn ||
            application.companyRegistrationNumber)
        ) {
          if (application.address.countryCode === 'AUS') {
            if (
              (!application.abn && !application.acn) ||
              (application.abn && application.abn.toString().length !== 11) ||
              (application.acn && application.acn.toString().length !== 9)
            ) {
              unProcessedApplications.push({
                ...application,
                reason: 'Invalid ABN/ACN number for Australia',
              });
              continue;
            }
          } else if (application.address.countryCode === 'NZL') {
            if (
              !application.abn ||
              (application.abn && application.abn.toString().length !== 13)
            ) {
              unProcessedApplications.push({
                ...application,
                reason: 'Invalid NZBN number for New Zealand',
              });
              continue;
            }
          } else {
            if (!application.companyRegistrationNumber) {
              unProcessedApplications.push({
                ...application,
                reason: 'Company Registration Number not found.',
              });
              continue;
            }
          }
        }
        if (
          application.entityType &&
          application.entityType === 'PARTNERSHIP'
        ) {
          application.stakeholders = stakeHolders.filter(
            (s) =>
              (application?.debtorCode &&
                s?.debtorCode === application.debtorCode) ||
              (application?.abn &&
                s?.debtorAbn?.toString() === application.abn?.toString()) ||
              (application?.acn &&
                s?.debtorAcn?.toString() === application.acn?.toString()) ||
              (application?.companyRegistrationNumber &&
                s?.debtorRegistrationNumber?.toString() ===
                  application.companyRegistrationNumber?.toString()),
          );
          if (application.stakeholders.length < 2) {
            if (application.debtorCode) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'debtorCode',
                  value: application.debtorCode,
                })) < 2
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Partners not found.',
                });
                continue;
              }
            } else if (application.abn) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'abn',
                  value: application.abn,
                })) < 2
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Partners not found.',
                });
                continue;
              }
            } else if (application.acn) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'acn',
                  value: application.acn,
                })) < 2
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Partners not found.',
                });
                continue;
              }
            } else if (application.companyRegistrationNumber) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'registrationNumber',
                  value: application.companyRegistrationNumber,
                })) < 2
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Partners not found.',
                });
                continue;
              }
            }
          }
        } else if (
          application.entityType &&
          application.entityType === 'TRUST'
        ) {
          application.stakeholders = stakeHolders.filter(
            (s) =>
              (application?.debtorCode &&
                s?.debtorCode === application.debtorCode) ||
              (application?.abn &&
                s?.debtorAbn?.toString() === application.abn?.toString()) ||
              (application?.acn &&
                s?.debtorAcn?.toString() === application.acn?.toString()) ||
              (application?.companyRegistrationNumber &&
                s?.debtorRegistrationNumber?.toString() ===
                  application.companyRegistrationNumber?.toString()),
          );
          if (application.stakeholders.length < 1) {
            if (application.debtorCode) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'debtorCode',
                  value: application.debtorCode,
                })) < 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Trustee(s) not found.',
                });
                continue;
              }
            } else if (application.abn) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'abn',
                  value: application.abn,
                })) < 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Trustee(s) not found.',
                });
                continue;
              }
            } else if (application.acn) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'acn',
                  value: application.acn,
                })) < 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Trustee(s) not found.',
                });
                continue;
              }
            } else if (application.companyRegistrationNumber) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'registrationNumber',
                  value: application.companyRegistrationNumber,
                })) < 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Trustee(s) not found.',
                });
                continue;
              }
            }
          }
        } else if (
          application.entityType &&
          application.entityType === 'SOLE_TRADER'
        ) {
          application.stakeholders = stakeHolders.filter(
            (s) =>
              (application.debtorCode &&
                s.debtorCode === application.debtorCode) ||
              (application.abn &&
                s.debtorAbn?.toString() === application.abn?.toString()) ||
              (application.acn &&
                s.debtorAcn?.toString() === application.acn?.toString()) ||
              (application.companyRegistrationNumber &&
                s.debtorRegistrationNumber?.toString() ===
                  application.companyRegistrationNumber?.toString()),
          );
          if (application.stakeholders.length !== 1) {
            if (application.debtorCode) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'debtorCode',
                  value: application.debtorCode,
                })) !== 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Sole Trader not found.',
                });
                continue;
              }
            } else if (application.abn) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'abn',
                  value: application.abn,
                })) !== 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Sole Trader not found.',
                });
                continue;
              }
            } else if (application.acn) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'acn',
                  value: application.acn,
                })) !== 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Sole Trader not found.',
                });
                continue;
              }
            } else if (application.companyRegistrationNumber) {
              if (
                (await checkDirectorsOfDebtor({
                  parameter: 'registrationNumber',
                  value: application.companyRegistrationNumber,
                })) !== 1
              ) {
                unProcessedApplications.push({
                  ...application,
                  reason: 'Sole Trader not found.',
                });
                continue;
              }
            }
          }
        }
        applications.push(application);
      }
    }
    return {
      isImportCompleted: true,
      applications,
      unProcessedApplications,
    };
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e);
  }
};

const processAndValidateApplications = async (importId) => {
  try {
    let importApplicationDump = await ImportApplicationDump.findOne({
      _id: importId,
    });
    if (!importApplicationDump) {
      return Promise.reject({ message: 'No Import dump found.' });
    }
    if (importApplicationDump.currentStepIndex !== 'GENERATED') {
      return Promise.reject({ message: 'Invalid step index found' });
    }
    let applications = [];
    let unProcessedApplications = [];
    applicationLoop: for (
      let i = 0;
      i < importApplicationDump.applications.length;
      i++
    ) {
      let searchParam;
      let searchValue;
      if (importApplicationDump.applications[i].debtorCode) {
        searchParam = 'debtorCode';
        searchValue = importApplicationDump.applications[i].debtorCode;
      } else if (importApplicationDump.applications[i].abn) {
        searchParam = 'abn';
        searchValue = importApplicationDump.applications[i].abn;
      } else if (importApplicationDump.applications[i].acn) {
        searchParam = 'acn';
        searchValue = importApplicationDump.applications[i].acn;
      } else if (
        importApplicationDump.applications[i].companyRegistrationNumber
      ) {
        searchParam = 'registrationNumber';
        searchValue =
          importApplicationDump.applications[i].companyRegistrationNumber;
      }
      const client = await Client.findOne({
        clientCode: importApplicationDump.applications[i].clientCode,
        isDeleted: false,
      });
      const debtor = await Debtor.findOne({
        [searchParam]: searchValue,
      });
      if (!client) {
        unProcessedApplications.push({
          ...importApplicationDump.applications[i],
          reason: `Client not found with Client Code as '${importApplicationDump.applications[i].clientCode}'`,
        });
        continue;
      }
      if (debtor) {
        const application = await Application.findOne({
          debtorId: debtor._id,
          clientId: client._id,
          status: {
            $nin: [
              'DECLINED',
              'CANCELLED',
              'WITHDRAWN',
              'SURRENDERED',
              'DRAFT',
              'APPROVED',
            ],
          },
        }).lean();
        if (application) {
          unProcessedApplications.push({
            ...importApplicationDump.applications[i],
            reason: `Application already exists for the Client: ${
              importApplicationDump.applications[i].clientCode
            } & Debtor: ${
              importApplicationDump.applications[i].debtorCode ||
              importApplicationDump.applications[i].abn ||
              importApplicationDump.applications[i].acn
            }`,
          });
          continue;
        }
        applications.push({
          ...importApplicationDump.applications[i],
          debtorExists: true,
        });
      } else {
        if (importApplicationDump.applications[i].debtorCode) {
          unProcessedApplications.push({
            ...importApplicationDump.applications[i],
            reason: `Debtor not found with Debtor Code as '${importApplicationDump.applications[i].debtorCode}'`,
          });
          continue;
        }
        if (
          importApplicationDump.applications[i].address.countryCode !== 'AUS' &&
          importApplicationDump.applications[i].address.countryCode !== 'NZL'
        ) {
          applications.push({
            ...importApplicationDump.applications[i],
            debtorExists: false,
          });
        } else {
          let entityResponse;
          let stakeholderEntityResponse;
          try {
            entityResponse = await getEntityDetailsByBusinessNumber({
              country:
                importApplicationDump.applications[i].address.countryCode,
              searchString:
                importApplicationDump.applications[i].abn ||
                importApplicationDump.applications[i].acn,
              step: 'company',
            });
          } catch (e) {
            Logger.log.error(
              'Error in Lookup for client',
              importApplicationDump.applications[i],
            );
            continue;
          }
          if (
            entityResponse &&
            entityResponse.status &&
            entityResponse.status === 'ERROR'
          ) {
            if (
              entityResponse.messageCode &&
              entityResponse.messageCode === 'NO_DATA_FOUND'
            ) {
              unProcessedApplications.push({
                ...importApplicationDump.applications[i],
                reason: `Debtor not found in ABR Lookup for '${
                  importApplicationDump.applications[i].abn
                    ? 'ABN: ' + importApplicationDump.applications[i].abn
                    : 'ACN: ' + importApplicationDump.applications[i].acn
                }'.`,
              });
            } else {
              unProcessedApplications.push({
                ...importApplicationDump.applications[i],
                reason: entityResponse.message
                  ? entityResponse.message
                  : `Error in ABR Lookup.`,
              });
            }
            continue;
          }
          // If the Debtor's Entity Type is Sole Trader, Partnership or Trust, then validate stakeholders
          switch (
            entityResponse?.entityType?.value ||
            importApplicationDump.applications[i].entityType
          ) {
            case 'PARTNERSHIP':
              if (
                !importApplicationDump.applications[i].stakeholders ||
                importApplicationDump.applications[i].stakeholders.length < 2
              ) {
                unProcessedApplications.push({
                  ...importApplicationDump.applications[i],
                  reason: `At least 2 partners are needed for the Partnership entity type.`,
                });
                continue;
              } else {
                for (
                  let j = 0;
                  j < importApplicationDump.applications[i].stakeholders.length;
                  j++
                ) {
                  if (
                    !importApplicationDump.applications[i].stakeholders[j]
                      .partnerType ||
                    (importApplicationDump.applications[i].stakeholders[j]
                      .partnerType !== 'INDIVIDUAL' &&
                      importApplicationDump.applications[i].stakeholders[j]
                        .partnerType !== 'COMPANY')
                  ) {
                    unProcessedApplications.push({
                      ...importApplicationDump.applications[i],
                      reason: `Invalid partner type for the Partner ${
                        importApplicationDump.applications[i].stakeholders[j]
                          .company &&
                        importApplicationDump.applications[i].stakeholders[j]
                          .company.abn
                          ? 'ABN: ' +
                            importApplicationDump.applications[i].stakeholders[
                              j
                            ].company.abn
                          : ''
                      } ${
                        importApplicationDump.applications[i].stakeholders[j]
                          .individual &&
                        importApplicationDump.applications[i].stakeholders[j]
                          .individual.firstName
                          ? 'First Name: ' +
                            importApplicationDump.applications[i].stakeholders[
                              j
                            ].individual.firstName
                          : ''
                      }`,
                    });
                    continue applicationLoop;
                  }
                  if (
                    importApplicationDump.applications[i].stakeholders[j]
                      .partnerType === 'INDIVIDUAL'
                  ) {
                    if (
                      !importApplicationDump.applications[i].stakeholders[j]
                        .individual.firstName ||
                      !importApplicationDump.applications[i].stakeholders[j]
                        .individual.lastName ||
                      (!importApplicationDump.applications[i].stakeholders[j]
                        .individual.driverLicenceNumber &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          .individual.dateOfBirth)
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Missing one or more required fields ('First Name', 'Last Name' and 'Date of Birth/Driver Licence') for the Individual Partner`,
                      });
                      continue applicationLoop;
                    }
                  } else if (
                    importApplicationDump.applications[i].stakeholders[j]
                      .partnerType === 'COMPANY'
                  ) {
                    if (
                      !importApplicationDump.applications[i].stakeholders[j]
                        .countryCode ||
                      !countryList.find(
                        (c) =>
                          c._id ===
                          importApplicationDump.applications[i].stakeholders[j]
                            .countryCode,
                      ) ||
                      (!importApplicationDump.applications[i].stakeholders[j]
                        ?.company?.abn &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          ?.company?.acn &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          ?.company?.companyRegistrationNumber)
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Missing one or more required fields ('Country', 'ABN/ACN', 'Entity Type', and/or 'Invalid Entity Type') for the Company Partner`,
                      });
                      continue applicationLoop;
                    }
                    if (
                      !importApplicationDump.applications[i].stakeholders[j]
                        .company.entityType ||
                      !companyEntityType.find(
                        (c) =>
                          c._id ===
                          importApplicationDump.applications[i].stakeholders[j]
                            .company.entityType,
                      )
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Invalid Company Entity Type for the Company Partner`,
                      });
                      continue applicationLoop;
                    }
                    let stakeholderEntityResponse;
                    try {
                      if (
                        importApplicationDump.applications[i].stakeholders[j]
                          .countryCode === 'AUS' ||
                        importApplicationDump.applications[i].stakeholders[j]
                          .countryCode === 'NZL'
                      ) {
                        stakeholderEntityResponse = await getEntityDetailsByBusinessNumber(
                          {
                            country:
                              importApplicationDump.applications[i]
                                .stakeholders[j].countryCode,
                            searchString:
                              importApplicationDump.applications[i]
                                .stakeholders[j]?.company?.abn ||
                              importApplicationDump.applications[i]
                                .stakeholders[j]?.company?.acn,
                            step: 'person',
                          },
                        );
                      }
                    } catch (e) {
                      Logger.log.error(
                        'Error in Lookup for ',
                        importApplicationDump.applications[i].stakeholders[j],
                      );
                      continue applicationLoop;
                    }
                    if (
                      stakeholderEntityResponse &&
                      stakeholderEntityResponse.status &&
                      stakeholderEntityResponse.status === 'ERROR'
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Error from ABR Lookup for Partner: ${stakeholderEntityResponse.message}`,
                      });
                      continue applicationLoop;
                    } else {
                      importApplicationDump.applications[i].stakeholders[
                        j
                      ].stakeholderEntityResponse = stakeholderEntityResponse;
                    }
                  } else {
                    unProcessedApplications.push({
                      ...importApplicationDump.applications[i],
                      reason: `Invalid partner type for the partner ${
                        importApplicationDump.applications[i].stakeholders[j]
                          .company.abn ||
                        importApplicationDump.applications[i].stakeholders[j]
                          .individual.firstName
                      }`,
                    });
                    continue applicationLoop;
                  }
                }
              }
              break;
            case 'TRUST':
              if (
                !importApplicationDump.applications[i].stakeholders ||
                importApplicationDump.applications[i].stakeholders.length < 1
              ) {
                unProcessedApplications.push({
                  ...importApplicationDump.applications[i],
                  reason: `At least 1 trustee is needed for the Trust entity type.`,
                });
                continue;
              } else {
                for (
                  let j = 0;
                  j < importApplicationDump.applications[i].stakeholders.length;
                  j++
                ) {
                  if (
                    importApplicationDump.applications[i].stakeholders[j]
                      .partnerType === 'INDIVIDUAL'
                  ) {
                    if (
                      !importApplicationDump.applications[i].stakeholders[j]
                        .individual.firstName ||
                      !importApplicationDump.applications[i].stakeholders[j]
                        .individual.lastName ||
                      (!importApplicationDump.applications[i].stakeholders[j]
                        .individual.driverLicenceNumber &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          .individual.dateOfBirth)
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Missing one or more required fields ('First Name', 'Last Name' and 'Date of Birth/Driver Licence') for the Individual Trustee.`,
                      });
                      continue applicationLoop;
                    }
                  } else if (
                    importApplicationDump.applications[i].stakeholders[j]
                      .partnerType === 'COMPANY'
                  ) {
                    if (
                      !importApplicationDump.applications[i].stakeholders[j]
                        .countryCode ||
                      (!importApplicationDump.applications[i].stakeholders[j]
                        ?.company?.abn &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          ?.company?.acn &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          ?.company?.companyRegistrationNumber)
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Missing one or more required fields ('Country' and 'ABN/ACN') for the Company Partner`,
                      });
                      continue applicationLoop;
                    }
                    let stakeholderEntityResponse;
                    try {
                      stakeholderEntityResponse = await getEntityDetailsByBusinessNumber(
                        {
                          country:
                            importApplicationDump.applications[i].stakeholders[
                              j
                            ].countryCode,
                          searchString:
                            importApplicationDump.applications[i].stakeholders[
                              j
                            ]?.company?.abn ||
                            importApplicationDump.applications[i].stakeholders[
                              j
                            ]?.company?.acn,
                          step: 'person',
                        },
                      );
                    } catch (e) {
                      Logger.log.error(
                        'Error in Lookup for ',
                        importApplicationDump.applications[i].stakeholders[j],
                      );
                      continue applicationLoop;
                    }
                    if (
                      stakeholderEntityResponse &&
                      stakeholderEntityResponse.status &&
                      stakeholderEntityResponse.status === 'ERROR'
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Error from ABR Lookup for Trustee: ${stakeholderEntityResponse.message}`,
                      });
                      continue applicationLoop;
                    } else {
                      importApplicationDump.applications[i].stakeholders[
                        j
                      ].stakeholderEntityResponse = stakeholderEntityResponse;
                    }
                  } else {
                    unProcessedApplications.push({
                      ...importApplicationDump.applications[i],
                      reason: `Invalid partner type for the trustee ${
                        importApplicationDump.applications[i].stakeholders[j]
                          .company.abn ||
                        importApplicationDump.applications[i].stakeholders[j]
                          .individual.firstName
                      }`,
                    });
                    continue applicationLoop;
                  }
                }
              }
              break;
            case 'SOLE_TRADER':
              if (
                !importApplicationDump.applications[i].stakeholders ||
                importApplicationDump.applications[i].stakeholders.length !== 1
              ) {
                unProcessedApplications.push({
                  ...importApplicationDump.applications[i],
                  reason: `Exact 1 Sole Trader is needed for the Sole Trader entity type.`,
                });
                continue;
              } else {
                for (
                  let j = 0;
                  j < importApplicationDump.applications[i].stakeholders.length;
                  j++
                ) {
                  if (
                    importApplicationDump.applications[i].stakeholders[j]
                      .partnerType === 'INDIVIDUAL'
                  ) {
                    if (
                      !importApplicationDump.applications[i].stakeholders[j]
                        .individual.firstName ||
                      !importApplicationDump.applications[i].stakeholders[j]
                        .individual.lastName ||
                      (!importApplicationDump.applications[i].stakeholders[j]
                        .individual.driverLicenceNumber &&
                        !importApplicationDump.applications[i].stakeholders[j]
                          .individual.dateOfBirth)
                    ) {
                      unProcessedApplications.push({
                        ...importApplicationDump.applications[i],
                        reason: `Missing one or more required fields ('First Name', 'Last Name' and 'Date of Birth/Driver Licence') for the Sole Trader.`,
                      });
                      continue applicationLoop;
                    }
                  } else {
                    unProcessedApplications.push({
                      ...importApplicationDump.applications[i],
                      reason: `Invalid partner type for the sole trader ${importApplicationDump.applications[i].stakeholders[j].individual.firstName}.`,
                    });
                    continue applicationLoop;
                  }
                }
              }
              break;
          }
          applications.push({
            ...importApplicationDump.applications[i],
            debtorExists: false,
            abrResponseForDebtor: entityResponse,
          });
        }
      }
    }
    return {
      applications,
      unProcessedApplications,
    };
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e);
  }
};

const generateApplications = async (importId, userId) => {
  try {
    let importApplicationDump = await ImportApplicationDump.findOne({
      _id: importId,
    });
    if (!importApplicationDump) {
      return Promise.reject({ message: 'No Import dump found.' });
    }
    if (importApplicationDump.currentStepIndex !== 'VALIDATED') {
      return Promise.reject({ message: 'Invalid step index found' });
    }
    let unProcessedApplications = [];
    for (let i = 0; i < importApplicationDump.applications.length; i++) {
      let promiseArr = [];
      const organization = await Organization.findOne({ isDeleted: false })
        .select('entityCount')
        .lean();
      let searchParam;
      let searchValue;
      if (importApplicationDump.applications[i].debtorCode) {
        searchParam = 'debtorCode';
        searchValue = importApplicationDump.applications[i].debtorCode;
      } else {
        if (
          importApplicationDump.applications[i].address.countryCode === 'AUS' ||
          importApplicationDump.applications[i].address.countryCode === 'NZL'
        ) {
          if (importApplicationDump.applications[i].abn) {
            searchParam = 'abn';
            searchValue = importApplicationDump.applications[i].abn;
          } else if (importApplicationDump.applications[i].acn) {
            searchParam = 'acn';
            searchValue = importApplicationDump.applications[i].acn;
          }
        } else {
          searchParam = 'registrationNumber';
          searchValue =
            importApplicationDump.applications[i].companyRegistrationNumber;
        }
      }
      const client = await Client.findOne({
        clientCode: importApplicationDump.applications[i].clientCode,
        isDeleted: false,
      });
      let debtor = await Debtor.findOne({
        [searchParam]: searchValue,
      });
      let clientDebtor;
      if (debtor) {
        //TODO change query
        clientDebtor = await ClientDebtor.findOne({
          clientId: client._id,
          debtorId: debtor._id,
        });
        let existingApplication = await Application.findOne({
          debtorId: debtor._id,
          clientId: client._id,
          status: {
            $nin: [
              'DECLINED',
              'CANCELLED',
              'WITHDRAWN',
              'SURRENDERED',
              'DRAFT',
              'APPROVED',
            ],
          },
        }).lean();
        if (existingApplication) {
          unProcessedApplications.push({
            ...importApplicationDump.applications[i],
            reason: `Application already exists for the Client: ${
              importApplicationDump.applications[i].clientCode
            } & Debtor: ${
              importApplicationDump.applications[i].debtorCode ||
              importApplicationDump.applications[i].abn ||
              importApplicationDump.applications[i].acn
            }`,
          });
          continue;
        }
        if (!clientDebtor) {
          clientDebtor = new ClientDebtor({
            clientId: client._id,
            debtorId: debtor._id,
          });
          promiseArr.push(clientDebtor.save());
          // await clientDebtor.save();
        }
      } else {
        const date = new Date();
        debtor = new Debtor({
          debtorCode:
            'D' +
            (organization.entityCount.debtor + 1).toString().padStart(4, '0'),

          entityName:
            importApplicationDump.applications[i].entityName ||
            (importApplicationDump.applications[i].abrResponseForDebtor &&
            importApplicationDump.applications[i].abrResponseForDebtor
              .entityName
              ? importApplicationDump.applications[i].abrResponseForDebtor
                  .entityName.value
              : null),
          tradingName:
            importApplicationDump.applications[i].tradingName ||
            (importApplicationDump.applications[i].abrResponseForDebtor
              ? importApplicationDump.applications[i].abrResponseForDebtor
                  .tradingName
              : null),
          entityType:
            importApplicationDump.applications[i].entityType ||
            (importApplicationDump.applications[i].abrResponseForDebtor &&
            importApplicationDump.applications[i].abrResponseForDebtor
              .entityType
              ? importApplicationDump.applications[i].abrResponseForDebtor
                  .entityType.value
              : null),
          contactNumber: importApplicationDump.applications[i].contactNumber,
          address: {
            property:
              importApplicationDump.applications[i].address.property ||
              (importApplicationDump.applications[i].abrResponseForDebtor
                ? importApplicationDump.applications[i].abrResponseForDebtor
                    .property
                : null),
            unitNumber:
              importApplicationDump.applications[i].address.unitNumber,
            streetNumber:
              importApplicationDump.applications[i].address.streetNumber,
            streetName:
              importApplicationDump.applications[i].address.streetName ||
              (importApplicationDump.applications[i].abrResponseForDebtor
                ? importApplicationDump.applications[i].abrResponseForDebtor
                    .streetName
                : null),
            streetType:
              importApplicationDump.applications[i].address.streetType,
            suburb:
              importApplicationDump.applications[i].address.suburb ||
              (importApplicationDump.applications[i].abrResponseForDebtor
                ? importApplicationDump.applications[i].abrResponseForDebtor
                    .suburb
                : null),
            state:
              importApplicationDump.applications[i].address.state ||
              (importApplicationDump.applications[i].abrResponseForDebtor &&
              importApplicationDump.applications[i].abrResponseForDebtor.state
                ? importApplicationDump.applications[i].abrResponseForDebtor
                    .state.value
                : null),
            country: {
              name: countryList.find(
                (c) =>
                  c._id ===
                  importApplicationDump.applications[i].address.countryCode,
              )
                ? countryList.find(
                    (c) =>
                      c._id ===
                      importApplicationDump.applications[i].address.countryCode,
                  ).name
                : '',
              code: importApplicationDump.applications[i].address.countryCode,
            },
            postCode:
              importApplicationDump.applications[i].address.postCode ||
              (importApplicationDump.applications[i].abrResponseForDebtor
                ? importApplicationDump.applications[i].abrResponseForDebtor
                    .postCode
                : null),
          },
          isActive:
            importApplicationDump.applications[i].abrResponseForDebtor
              ?.isActive === 'Active' ||
            importApplicationDump.applications[i].abrResponseForDebtor
              ?.isActive === true,
          reviewDate: new Date(date.setMonth(date.getMonth() + 11)),
        });
        if (
          importApplicationDump.applications[i].address.countryCode === 'AUS' ||
          importApplicationDump.applications[i].address.countryCode === 'NZL'
        ) {
          debtor.abn = importApplicationDump.applications[i].abn;
          debtor.acn = importApplicationDump.applications[i].acn;
        } else {
          debtor.registrationNumber =
            importApplicationDump.applications[i].companyRegistrationNumber;
        }
        // await debtor.save();
        promiseArr.push(debtor.save());
        clientDebtor = new ClientDebtor({
          clientId: client._id,
          debtorId: debtor._id,
        });
        // await clientDebtor.save();
        promiseArr.push(clientDebtor.save());
        // If the Debtor's Entity Type is Sole Trader, Partnership or Trust, then validate stakeholders
        if (importApplicationDump.applications[i].stakeholders) {
          switch (debtor.entityType) {
            case 'PARTNERSHIP':
            case 'TRUST':
            case 'SOLE_TRADER':
              for (
                let j = 0;
                j < importApplicationDump.applications[i].stakeholders.length;
                j++
              ) {
                let debtorDirector = new DebtorDirector({
                  type: importApplicationDump.applications[i].stakeholders[
                    j
                  ].partnerType.toLowerCase(),
                  debtorId: debtor._id,
                  country: {
                    name: countryList.find(
                      (c) =>
                        c._id ===
                        importApplicationDump.applications[i].stakeholders[j]
                          .countryCode,
                    ).name,
                    code:
                      importApplicationDump.applications[i].stakeholders[j]
                        .countryCode,
                  },
                });
                if (
                  importApplicationDump.applications[i].stakeholders[j]
                    .partnerType === 'INDIVIDUAL'
                ) {
                  debtorDirector.title =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.title;
                  debtorDirector.firstName =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.firstName;
                  debtorDirector.middleName =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.middleName;
                  debtorDirector.lastName =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.lastName;
                  debtorDirector.dateOfBirth =
                    importApplicationDump.applications[i].stakeholders[j]
                      .individual.dateOfBirth &&
                    new Date(
                      importApplicationDump.applications[i].stakeholders[
                        j
                      ].individual.dateOfBirth,
                    );
                  debtorDirector.driverLicenceNumber =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.driverLicenceNumber;
                  debtorDirector.residentialAddress = {
                    property:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.property,
                    unitNumber:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.unitNumber,
                    streetNumber:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.streetNumber,
                    streetName:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.streetName,
                    streetType:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.streetType,
                    suburb:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.suburb,
                    state:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.state,
                    postCode:
                      importApplicationDump.applications[i].stakeholders[j]
                        .individual.address.postCode,
                  };
                  debtorDirector.phoneNumber =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.phoneNumber;
                  debtorDirector.mobileNumber =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.mobileNumber;
                  debtorDirector.email =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual.email;
                  debtorDirector.allowToCheckCreditHistory =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].individual?.allowToCheckCreditHistory?.toLowerCase() ===
                    'yes';
                } else if (
                  importApplicationDump.applications[i].stakeholders[j]
                    .partnerType === 'COMPANY'
                ) {
                  debtorDirector.entityName =
                    importApplicationDump.applications[i].stakeholders[j]
                      .company.entityName ||
                    importApplicationDump.applications[i].stakeholders[j]
                      .stakeholderEntityResponse.entityName;
                  debtorDirector.tradingName =
                    importApplicationDump.applications[i].stakeholders[j]
                      .company.tradingName ||
                    importApplicationDump.applications[i].stakeholders[j]
                      ?.stakeholderEntityResponse?.entityName;
                  debtorDirector.entityType =
                    importApplicationDump.applications[i].stakeholders[
                      j
                    ].company.entityType;
                  if (
                    debtorDirector.country === 'AUS' ||
                    debtorDirector.country === 'NZL'
                  ) {
                    debtorDirector.abn =
                      importApplicationDump.applications[i].stakeholders[
                        j
                      ].company.abn;
                    debtorDirector.acn =
                      importApplicationDump.applications[i].stakeholders[
                        j
                      ].company.acn;
                  } else {
                    debtorDirector.registrationNumber =
                      importApplicationDump.applications[i].stakeholders[
                        j
                      ].company.companyRegistrationNumber;
                  }
                }
                promiseArr.push(debtorDirector.save());
                // await debtorDirector.save();
              }
              break;
          }
        }
      }
      let application = new Application({
        applicationId:
          client.clientCode +
          '-' +
          debtor.debtorCode +
          '-' +
          new Date().toISOString().split('T')[0].replace(/-/g, '') +
          '-' +
          (organization.entityCount.application + 1)
            .toString()
            .padStart(3, '0'),
        clientId: client._id,
        debtorId: debtor._id,
        clientDebtorId: clientDebtor._id,
        status: 'SUBMITTED',
        creditLimit: importApplicationDump.applications[i].creditLimit,
        isExtendedPaymentTerms: importApplicationDump.applications[i]
          .extendedTerms
          ? importApplicationDump.applications[
              i
            ].extendedTerms.toLowerCase() === 'yes'
          : 'no',
        extendedPaymentTermsDetails:
          importApplicationDump.applications[i].detailsForExtendedTerms,
        isPassedOverdueAmount: importApplicationDump.applications[i]
          .overdueAmounts
          ? importApplicationDump.applications[
              i
            ].overdueAmounts.toLowerCase() === 'yes'
          : 'no',
        passedOverdueDetails:
          importApplicationDump.applications[i].detailsForOverdueAmounts,
        note: importApplicationDump.applications[i].applicationNote,
        outstandingAmount:
          importApplicationDump.applications[i].outstandingAmount &&
          !isNaN(importApplicationDump.applications[i].outstandingAmount)
            ? importApplicationDump.applications[i].outstandingAmount
            : null,
        orderOnHand:
          importApplicationDump.applications[i].ordersOnHand &&
          !isNaN(importApplicationDump.applications[i].ordersOnHand)
            ? importApplicationDump.applications[i].ordersOnHand
            : null,
        createdByType: 'user',
        createdById: userId,
        requestDate: new Date(),
      });
      promiseArr.push(application.save());
      // await application.save();
      if (importApplicationDump.applications[i].applicationNote) {
        let note = new Note({
          description: importApplicationDump.applications[i].applicationNote,
          noteFor: 'application',
          entityId: application._id,
          createdByType: 'user',
          createdById: userId,
        });
        promiseArr.push(note.save());
        // await note.save();
      }
      promiseArr.push(
        Organization.updateOne(
          { isDeleted: false },
          { $inc: { 'entityCount.application': 1, 'entityCount.debtor': 1 } },
        ),
      );
      await Promise.all(promiseArr);
      await checkForAutomation({
        applicationId: application._id,
        userType: 'user',
        userId: userId,
      });
    }
    return {
      applicationCount: importApplicationDump.applications.length,
      unProcessedApplications: unProcessedApplications,
    };
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e);
    return Promise.reject(e);
  }
};
// readExcelFile();
module.exports = {
  readExcelFile,
  processAndValidateApplications,
  generateApplications,
};
