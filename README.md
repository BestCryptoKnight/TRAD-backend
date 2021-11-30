# TRAD Backend Server

### Backend server for Credit Risk Assessment

##Introduction:
The TRAD is a financial services company who provides credit assessments for large businesses to protect financial health of the business.

- Purpose of this project:

  - Decrease the financial risk for large businesses with the system that allow to send information to the customers about their clients.
  - Automations on the credit limit.

- What we have archived with this project:
  - A dynamic system with integration of different services like ABR Lookup, New Zealand Lookup, RSS, Illion.

##Module:

- Backend Server
- Risk Panel
- Client Panel

### 1 Backend Server

### 1.1 Purpose of the module

- This is the main core of the project. It connects Database, third party API services, Mailer service, AWS etc.
- All the API calls from other two modules are pointed here.

### 1.2 Module features

- All modules are managed here like Dashboard, Users, Insurer, Clients, Debtors, Applications, Tasks, Overdue, Claims, Reports.
- Access management is there for different modules and users.
- Logging of all the activities is here.

### 1.3 Module technical stack

- **Server runtime** : NodeJS v14.x
- **Database** : MongoDB v5.x
- **Mail service** : Sendgrid

###4. Configure Module:

- Configure SendGrid account
  - Signup to [SendGrid](https://signup.sendgrid.com/) and fill the required information and proceed further.
  - Login in to the account and goto _Settings_ => _[API Keys](https://app.sendgrid.com/settings/api_keys)_. Confirm on the prompted **Confirm Email Address** button. Click on the link received in the mail inbox to verify the email.
  - Refresh the [API key page](https://app.sendgrid.com/settings/api_keys) and click on Create API key and paste it to the file `.env` in: `SENDGRID_API_KEY`
  - For verification, follow the steps for Single Sender Verification from SendGrid [guide](https://sendgrid.com/docs/ui/sending-email/sender-verification)
  - Paste sender email address to the file `.env` in: `FROM_EMAIL_ADDRESS`

### 1.5 Get up and running

- Install requirements

- Go to `source/backend` and open the terminal from that folder
- Run `npm i` to install all the dependencies
- Currently, the backend server will start on PORT 3200, which is configurable
- Once done, run `npm start`, and the server starts running on port 3200 (specified in env file)
