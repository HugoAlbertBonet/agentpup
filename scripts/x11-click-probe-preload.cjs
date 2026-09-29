const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("pointerdown", (event) => {
    ipcRenderer.send("probe:click", { x: event.screenX, y: event.screenY });
  });
});
