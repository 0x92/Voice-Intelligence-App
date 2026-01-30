const { spawn } = require("child_process");
const path = require("path");

const electronPath = require("electron");
const appPath = process.argv[2] || ".";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appPath], {
  env,
  stdio: "inherit",
  cwd: process.cwd(),
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
