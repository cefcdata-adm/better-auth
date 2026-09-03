module.exports = {
  apps: [
    {
      name: "cefc-auth",
      cwd: "/opt/better-auth/cefc-next",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
