const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const readyPath = process.argv.at(-2);
const clickPath = process.argv.at(-1);
if (!readyPath || !clickPath) throw new Error("Probe paths are required.");

ipcMain.on("probe:click", (_event, point) => {
  let clicks = [];
  try {
    clicks = JSON.parse(fs.readFileSync(clickPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  clicks.push(point);
  fs.writeFileSync(clickPath, JSON.stringify(clicks));
});

app.whenReady().then(() => {
  const bounds = screen.getPrimaryDisplay().bounds;
  const window = new BrowserWindow({
    ...bounds,
    title: "AgentPup X11 Click Probe",
    backgroundColor: "#6246ea",
    webPreferences: {
      preload: path.join(__dirname, "x11-click-probe-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setMenuBarVisibility(false);
  window.loadURL(
    "data:text/html,<title>AgentPup X11 Click Probe</title><body style='margin:0;background:%236246ea;width:100vw;height:100vh'></body>"
  );
  window.once("ready-to-show", () => {
    window.show();
    fs.writeFileSync(readyPath, "ready");
  });
});
