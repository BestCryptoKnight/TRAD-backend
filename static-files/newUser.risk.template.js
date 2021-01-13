/**
 * Config
 * */
const config = require('../config');
module.exports = ({ name, setPasswordLink }) => {
    return `<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body {
      font-family: "Segoe UI", sans-serif;
    }

    .user-div:hover {
      background-color: rgba(234, 234, 234, 0.49) !important;
    }
  </style>
</head>
<body style="background-color: #F3F3F5">
<div style="width: 100%; height: 100%;
 box-sizing: border-box;">
  <table style="width: 100%; height: 100%">
    <tr>
      <td align="center" valign="center">
        <div style="height: 100%; width: 100%; padding: 70px 0">
          <div style="background-color: white; width: 740px;overflow: auto">
            <table style="width: 100%; padding: 70px 20px" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" valign="center">
                  <img src="${config.BaseUrl}/mail-images/Logo-Human-Pixel-Horizontal.png"
                       style="width: 250px"/>
                </td>
              </tr>

              <tr>
                <td align="center" valign="center">
                  <div style="margin-top: 40px; color: #18c2c4; font-weight: 700; font-size: 30px">Welcome to Human
                    Pixel
                  </div>
                </td>
              </tr>

              <tr>
                <td align="center" valign="center">
                  <div style="width: 80%; margin-top: 40px;text-align: left;font-weight: 500;
                   color: rgba(69, 69, 69,.8); font-size: 22px;">
                    Hello ${name}!
                  </div>
                  <div style="width: 80%; margin-top: 5px; text-align:left; color: rgba(69, 69, 69,.4);
                  font-size: 22px">
                    We're glad to have you here. Click on the button below to set your password.
                  </div>
                </td>
              </tr>

<!--              <tr>-->
<!--                <td align="center" valign="center">-->
<!--                  <div style="width: 80%; margin-top: 30px; text-align: center; color: rgba(69, 69, 69,.4);-->
<!--                  font-size: 20px; font-weight: 400">-->
<!--                    Click on the button below to set your password.-->
<!--                  </div>-->
<!--                </td>-->
<!--              </tr>-->

              <tr>
                <td align="center" valign="center">
                  <button
                    style="margin-top:15px; padding: 15px 60px; background-color: #18C2C4; color: white; font-size: 20px; font-weight: 600; border:none; border-radius:10px; outline:none">
                        <a href="${setPasswordLink}" style="color: white!important; text-decoration: none!important;">Set Password</a>                    
                  </button>
                </td>
              </tr>
              <tr>
                <td align="center" valign="center">
                  <div style="width: 80%; margin-top: 40px; color: rgba(60, 60, 60,.35); font-size: 20px">
                    Yours Sincerely,
                  </div>
                </td>
              </tr>

              <tr>
                <td align="center" valign="center">
                  <img src="${config.BaseUrl}/mail-images/Logo-Human-Pixel-Horizontal.png"
                       style="width: 130px; margin-top: 20px"/>
                </td>
              </tr>

              <tr>
              <tr>
                <td align="center" valign="center">
                  <div style="width: 80%; margin-top: 20px;font-weight: 700; color: rgba(60, 60, 60,.35); font-size: 18px">
                    Company Address
                  </div>
                </td>
              </tr>
                <td align="center" valign="center">
                  <div style="width: 80%; margin-top: 5px;font-weight: 500; color: rgba(60, 60, 60,.35); font-size: 16px">
                    Melbourne Head Office,<br> Level 2 / 570 St Kilda Road,<br> Melbourne VIC 3004
                  </div>
                </td>
              </tr>

              <tr>
                <td align="center" valign="center">
                  <div style="width: 80%; margin-top: 20px;font-weight: 500; color: rgba(60, 60, 60,.35); font-size: 16px">
                   This email was sent to you from <span style="color: #18C2C4; font-weight: 600; cursor: pointer">${config.mailer.fromAddress}</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td align="center" valign="center">
                  <div style="width: 80%; margin-top: 20px; font-weight: 500; color: rgba(60, 60, 60,.35); font-size: 16px">
                    Copyright ©2000-2020 Company Name,AllRights Reserved.
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </div>
      </td>
    </tr>
  </table>

</div>
</body>
</html>`;};
