/**
 * Config
 * */
const config = require('../config');

module.exports = ({ debtorName, email, contactNumber, address, website }) => {
  return `<html>

  <head>
    <meta charset='utf-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1' />
  </head>
  
  <body
    style="margin:0; padding:0; word-spacing:normal; font-family: 'open sans', 'helvetica neue', sans-serif; font-size: 15px">
    <table>
      <tr>
        <td>
          Dear Team,<br /><br />Please find attached the REScheck decision on ${debtorName}.<br /><br />Please
          kindly confirm the company details noted on the attached Rescheck matches with the correct legal entity
          that will be placing a purchase order with you.<br /><br />Please contact us if you have any
          questions.<br /><br /><br />Kind Regards,
        </td>
      </tr>
  
  
      <tr>
        <td>
          <span style="font-weight: bold;">Risk Team </span><span style="color: #eda04f;"> | </span> Alerts
        </td>
      </tr>
      <tr>
        <td style="color: #1f497d; font-size: 15px; line-height:25px">
          PSC Trade Credit Risk Pty Ltd. <span style="color:#eda04f"> | </span> ABN 47 634 070 849 <span style="color:#f6a457"> | </span>AFS Licence No. 342385 <BR />
          ${address}<br />
          Telephone: ${contactNumber}<br />
        </td>
      </tr>
      <tr>
        <td>
          <img height="40" src="${config.staticServing.bucketURL}static-files/mail-images/psc-trad.png" />
        </td>
      </tr>
    </table>
  </body>
  
  </html>`;
};
