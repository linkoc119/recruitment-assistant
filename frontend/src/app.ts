import { mountShell } from "./shell/index.js";
import { startRouter } from "./router/index.js";

const shellEl = document.getElementById("shell");
if (shellEl) mountShell(shellEl);

startRouter();
