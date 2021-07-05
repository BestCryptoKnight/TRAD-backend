const PDFDocument = require('pdfkit');
const fs = require('fs');
let PdfTable = require('voilab-pdf-table');
const config = require('../config');
const axios = require('axios');

const generateDecisionLetter = async ({
  approvalStatus,
  rejectionReason,
  clientName,
  debtorName,
  abn,
  acn,
  registrationNumber,
  requestedAmount,
  approvedAmount,
  status,
  serviceManagerNumber,
}) => {
  const pdfBuffer = await new Promise(async (resolve) => {
    const date = new Date();
    let buffer;
    let pdf = new PDFDocument({
        autoFirstPage: false,
        bufferPages: true,
      }),
      table = new PdfTable(pdf);
    table
      .addPlugin(
        new (require('voilab-pdf-table/plugins/fitcolumn'))({
          column: 'item',
        }),
      )
      .addPlugin(new (require('voilab-pdf-table/plugins/rowshader'))());
    let buffers = [];
    // const width = pdf.widthOfString(orderData.items);
    // const h = pdf.heightOfString(orderData.items,{width});
    pdf.addPage({
      size: [595.28, 841.89],
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    });
    /*Top Border Starts*/
    pdf.rect(0, 0, 595.28, 15.6).fillOpacity(1).fill('#123A78');
    pdf.rect(0, 15.6, 595.28, 15.6).fillOpacity(1).fill('#EF7B11');
    /*Top Border Ends*/
    /*Header with Logo Starts*/
    pdf.rect(0, 31.2, 595.28, 69).fillOpacity(1).fill('#F4F6F8');
    buffer = await getBase64(
      `${config.server.backendServerUrl}mail-images/trad-logo.png`,
    );
    // console.log('buffer 1', buffer);
    pdf.image(buffer, 30, 52, { fit: [250, 250] });
    pdf.fill('#EF7B10').font('Helvetica-Bold');
    pdf.text(
      `Date: ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`,
      490,
      70,
      {},
    );
    /*Header with Logo Ends*/
    /*Page Title with Client Starts*/
    pdf.rect(0, 100.2, 595.28, 62).fillOpacity(1).fill('#003A78');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.fill('#FFFFFF').font('Helvetica-Bold').fontSize(15);
    pdf.text('RES Check', 0, 120, {
      align: 'center',
    });
    pdf.text(`${clientName}`, {
      align: 'center',
    });
    /*Page Title with Client Ends*/
    /*Debtor Details Starts*/
    pdf.moveDown(1.3);
    pdf.fill('#003A78').font('Helvetica').fontSize(11.25);
    pdf.text(`Debtor Name: ${debtorName}`, {
      align: 'center',
    });
    pdf.moveDown(0.3);
    if (registrationNumber) {
      pdf.text(`Registration Number: ${registrationNumber}`, {
        align: 'center',
      });
    } else {
      if (acn) {
        pdf.text(`ACN: ${acn}`, {
          align: 'center',
        });
        pdf.moveDown(0.3);
      }
      if (abn) {
        pdf.text(`ABN: ${abn}`, {
          align: 'center',
        });
      }
    }
    /*Debtor Details Ends*/
    /*Applied Limit Starts*/
    pdf.rect(0, 235, 595.28, 62).fillOpacity(1).fill('#F4F6F8');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.fill('#828F9D').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Credit Limit Request:', 0, 250, {
      align: 'center',
    });
    pdf.moveDown(0.5);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(19);
    pdf.text(`${requestedAmount} AUD`, {
      align: 'center',
    });
    /*Applied Limit Ends*/
    /*Applied Limit Starts*/
    pdf.rect(0, 304, 595.28, 62).fillOpacity(1).fill('#F4F6F8');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.fill('#828F9D').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Credit Limit Opinion:', 0, 318, {
      align: 'center',
    });
    pdf.moveDown(0.5);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(19);
    pdf.text(`${approvedAmount} AUD`, {
      align: 'center',
    });
    /*Applied Limit Ends*/
    /*Summary Starts*/
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Summary:', 20, 390, {
      // align: 'center',
    });
    pdf.moveDown(0.6);
    pdf.fill('#828F9D').font('Helvetica').fontSize(11.25);
    if (status === 'DECLINED') {
      pdf.text(
        `After careful analysis, we are unable to provide a recommendation of $${requestedAmount} on ${debtorName} based on the following adverse information:`,
        {
          // align: 'center',
        },
      );
    } else if (status === 'APPROVED') {
      pdf.text(
        `After careful analysis, we are pleased to provide a recommendation of $${approvedAmount} on ${debtorName}`,
        {
          // align: 'center',
        },
      );
    } else if (status === 'PARTIALLY_APPROVED') {
      pdf.text(
        `After careful analysis, we are pleased to provide a recommendation of $${approvedAmount} on ${debtorName}`,
        {
          // align: 'center',
        },
      );
    }
    pdf.moveDown(0.6);
    pdf.fill('#FE5050').font('Helvetica').fontSize(11.25);
    if (status === 'DECLINED' && rejectionReason) {
      pdf.text(rejectionReason, {
        // align: 'center',
      });
    } else if (status === 'PARTIALLY_APPROVED' && approvalStatus) {
      pdf.text(approvalStatus, {
        // align: 'center',
      });
    }
    pdf.moveDown(0.6);
    pdf.fill('#828F9D').font('Helvetica').fontSize(11.25);
    pdf.text(
      'Our sources include ASIC, illion and the TCR Internal Database.',
      {
        // align: 'center',
      },
    );
    /*Summary Ends*/
    /*Conditions of Opinion Starts*/
    pdf.moveDown(1.6);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(11.25);
    pdf.text('Conditions of Opinion', {
      // align: 'center',
    });
    pdf.moveDown(0.6);
    pdf.fill('#828F9D').font('Helvetica').fontSize(11.25);
    if (status === 'DECLINED') {
      pdf.text(
        `We highly recommend you cease trading with this debtor immediately. TCR can review this
debtor at your request once further information can be provided. This debtor has been added
to our database for monitoring purposes and we will inform you of any updates we receive.
Please contact your Service Manager${
          serviceManagerNumber ? ' on ' + serviceManagerNumber : ''
        } to discuss further.`,
        {
          // align: 'center',
        },
      );
    } else if (status === 'PARTIALLY_APPROVED' || status === 'APPROVED') {
      pdf.text(
        `The above opinion will be expired after 12 months. A review of your trading history will be required to support your credit limit. This debtor has been added to our database for monitoring purposes and we will inform you of any updates we receive. Please contact your Service Manager${
          serviceManagerNumber ? ' on ' + serviceManagerNumber : ''
        } for further information`,
        {
          // align: 'center',
        },
      );
    }
    /*Conditions of Opinion Ends*/
    /*Licence Detail Starts*/
    pdf.moveDown(2);
    pdf.fill('#003A78').font('Helvetica-Bold').fontSize(12);
    pdf.text('Australian Financial Services Licence #: 422672', 0, 715, {
      align: 'center',
    });
    /*Licence of Opinion Ends*/
    /*Footer Starts*/
    pdf.rect(0, 735, 595.28, 107).fillOpacity(1).fill('#EF7B10');
    // table.plugins[1].shade1 = '#F4F6F8'
    // table.plugins[1].x = 0
    //   pdf.moveDown(3);
    pdf.fill('#FFFFFF').font('Helvetica').fontSize(12.75);
    buffer = await getBase64(
      `${config.server.backendServerUrl}mail-images/phone-icon.png`,
    );
    // console.log('buffer 2', buffer);
    pdf.image(buffer, 233, 760, { fit: [18, 18] });
    pdf.text('(03) 9842 0986', 0, 762, {
      align: 'center',
    });
    pdf.moveDown(0.4);
    buffer = await getBase64(
      `${config.server.backendServerUrl}mail-images/message-icon.png`,
    );
    // console.log('buffer 3', buffer);
    pdf.image(buffer, 178, 778, { fit: [17, 17] });
    pdf.text('creditlimits@tradecreditrisk.com.au', {
      align: 'center',
    });
    pdf.moveDown(0.4);
    buffer = await getBase64(
      `${config.server.backendServerUrl}mail-images/location-icon.png`,
    );
    // console.log('buffer 4', buffer);
    pdf.image(buffer, 108, 798, { fit: [17, 17] });
    pdf.text('Suite 11, 857 Doncaster Road Doncaster East, Victoria 3109', {
      align: 'center',
    });
    /*Footer Ends*/
    // table.plugins[1].x = 0
    // table
    //   .setColumnsDefaults({
    //     // headerBorder: 'B',
    //     align: 'justify',
    //     padding: [5, 0, 1, 0],
    //   })
    //   .addColumns([
    //     {
    //       id: 'item',
    //       width: 100,
    //       align: 'left',
    //     },
    //     {
    //       id: 'quantity',
    //       width: 25,
    //       align: 'left',
    //     },
    //     {
    //       id: 'itemPrice',
    //       width: 40,
    //       align: 'left',
    //     },
    //     {
    //       id: 'totalPrice',
    //       width: 49,
    //       align: 'left',
    //     },
    //   ]);
    // console.log('table::', table)
    // table.addBody(orderData.items);
    // pdf.font('Helvetica-Bold')
    //     .fontSize(15)
    //     .text(organizationData.business.name, {
    //         align: 'center',
    //         lineGap: 2,
    //     });
    // pdf.font('Helvetica')
    //     .fontSize(12)
    //     .text(organizationData.business.address1, { align: 'center' })
    //     .moveUp(0.2)
    //     .text(organizationData.business.address2, { align: 'center' })
    //     .moveUp(0.2)
    //     .text(organizationData.business.address3, {
    //         align: 'center',
    //         lineGap: 3,
    //     });

    // orderData.orderDate = getServerTime({
    //     date: orderData.orderDate,
    //     timezone: organizationData.business.timeZone,
    // });
    // pdf.text(
    //     orderData.orderDate.getDate() +
    //         '/' +
    //         (orderData.orderDate.getMonth() + 1) +
    //         '/' +
    //         orderData.orderDate.getFullYear() +
    //         ' ' +
    //         (orderData.orderDate.getHours().toString().length === 1
    //             ? '0'
    //             : '') +
    //         orderData.orderDate.getHours() +
    //         ':' +
    //         (orderData.orderDate.getMinutes().toString().length === 1
    //             ? '0'
    //             : '') +
    //         orderData.orderDate.getMinutes(),
    //     {
    //         align: 'right',
    //         lineGap: 3,
    //     },
    // );
    // if (
    //     orderData &&
    //     orderData.customerId &&
    //     orderData.customerId.customerName
    // ) {
    //     pdf.text('Customer: ' + orderData.customerId.customerName, {
    //         align: 'left',
    //         lineGap: 3,
    //     });
    // } else if (
    //     orderData &&
    //     orderData.waiterId &&
    //     orderData.waiterId.bartenderName
    // ) {
    //     pdf.text('Waiter: ' + orderData.waiterId.bartenderName, {
    //         align: 'left',
    //         lineGap: 3,
    //     });
    // } else if (
    //     orderData &&
    //     orderData.bartenderId &&
    //     orderData.bartenderId.bartenderName
    // ) {
    //     pdf.text('Waiter: ' + orderData.bartenderId.bartenderName, {
    //         align: 'left',
    //         lineGap: 3,
    //     });
    // } else {
    //     pdf.text('Order No: ' + orderData.orderNumber, {
    //         align: 'left',
    //         lineGap: 3,
    //     });
    // }
    // pdf.text('Table No: ' + orderData.tableNumber, {
    //     align: 'left',
    //     lineGap: 3,
    // });
    // pdf.text('Status: ' + getPaymentStatusStr(orderData.paymentStatus), {
    //     align: 'left',
    //     lineGap: 4,
    // });
    // pdf.fontSize(10);
    // pdf.moveTo(pdf.page.margins.left, pdf.y)
    //     .lineTo(pdf.page.width - pdf.page.margins.left, pdf.y)
    //     .lineWidth(0.5)
    //     .stroke();
    // pdf.moveDown(0.2);
    // pdf.font('Helvetica-Bold')
    //     .text('Name', pdf.x, pdf.y)
    //     .moveUp()
    //     .text('Qty.', 100, pdf.y, { align: 'left' })
    //     .moveUp()
    //     .text('Price', 125, pdf.y, { align: 'left' })
    //     .moveUp()
    //     .text('Total', 165, pdf.y, { align: 'left' })
    //     .font('Helvetica');
    // pdf.moveTo(pdf.page.margins.left, pdf.y)
    //     .lineTo(pdf.page.width - pdf.page.margins.left, pdf.y)
    //     .lineWidth(0.5)
    //     .stroke();
    // pdf.moveDown(0.2);

    // table.plugins[1].shade1 = '#123A78'
    // table.plugins[1].shade2 = '#EF7B11'
    // table.plugins[1].textColor = '#fff'
    // table.plugins[1].x = 0
    //     table
    //     .setColumnsDefaults({
    //         // headerBorder: 'B',
    //         align: 'justify',
    //         padding: [5, 0, 1, 0],
    //     })
    //     .addColumns([
    //         {
    //             id: 'item',
    //             width: 100,
    //             align: 'left',
    //         },
    //         {
    //             id: 'quantity',
    //             width: 25,
    //             align: 'left',
    //         },
    //         {
    //             id: 'itemPrice',
    //             width: 40,
    //             align: 'left',
    //         },
    //         {
    //             id: 'totalPrice',
    //             width: 49,
    //             align: 'left',
    //         },
    //     ]);
    // console.log('table::', table)
    // table.addBody(orderData.items);
    // pdf.moveDown();
    // pdf.moveTo(pdf.page.margins.left + pdf.page.margins.right, pdf.y)
    //     .lineTo(
    //         pdf.page.width - pdf.page.margins.left - pdf.page.margins.right,
    //         pdf.y,
    //     )
    //     .lineWidth(0.5)
    //     .dash(3, { space: 5 })
    //     .stroke();
    // pdf.moveDown();
    // pdf.x = pdf.page.width - pdf.page.margins.left - pdf.x;
    // pdf.fontSize(13).text(
    //     'Sub Total :  ' + euroConverter(orderData.totalAmount),
    //     { lineGap: 3, align: 'right' },
    // );
    // pdf.text(
    //     'Vat (' +
    //         organizationData.vat +
    //         '%) : ' +
    //         euroConverter(orderData.vatAmount),
    //     {
    //         align: 'right',
    //         lineGap: 3,
    //     },
    // );
    // pdf.font('Helvetica-Bold').text(
    //     'Grand Total : ' + euroConverter(orderData.grandTotalAmount),
    //     {
    //         align: 'right',
    //         lineGap: 3,
    //     },
    // );
    // pdf.font('Helvetica').text(
    //     'Tip Amount : ' + euroConverter(orderData.tipAmount),
    //     {
    //         align: 'right',
    //         lineGap: 3,
    //     },
    // );
    pdf.on('data', buffers.push.bind(buffers));
    pdf.on('end', async () => {
      let pdfData = Buffer.concat(buffers);
      resolve(pdfData);
      fs.writeFile('abc.pdf', pdfData, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });
    });
    pdf.end();
  });
  return await pdfBuffer;
};

const getBase64 = async (url) => {
  try {
    const image = await axios.get(url, { responseType: 'arraybuffer' });
    let raw = Buffer.from(image.data).toString('base64');
    return 'data:' + image.headers['content-type'] + ';base64,' + raw;
  } catch (e) {
    console.log('Error occurred in get base 64', e);
  }
};

module.exports = { generateDecisionLetter };
