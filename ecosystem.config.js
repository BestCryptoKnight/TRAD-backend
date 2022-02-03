module.exports = {
  apps: [
    {
      name: 'trad-dev',
      script: './bin/www',
      autorestart: true,
      watch: false,
    },
    {
      name: 'trad-test',
      script: './bin/www',
      autorestart: true,
      watch: false,
    },
    {
      name: 'trad-prod',
      script: './bin/www',
      autorestart: true,
      watch: false,
    },
  ],
};
