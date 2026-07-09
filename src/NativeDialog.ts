import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Shows a native desktop dialog using Windows mshta.exe (HTA).
 *
 * Why mshta: IE rendering engine handles DPI natively → sharp text.
 * Why JScript (not VBScript): proper string handling, no encoding bugs.
 * Data exchange: Base64 (pure ASCII) → zero encoding risk.
 *
 * On non-Windows, falls back to terminal stdin.
 */
export async function showNativeDialog(
  message: string,
  suggestions: string[] = [],
): Promise<{ action: "accept" | "cancel"; text: string }> {
  if (process.platform === "win32") {
    return showMshtaDialog(message, suggestions);
  }
  return showStdinDialog(message);
}

// ─── Windows: mshta.exe + JScript ───────────────────────────

async function showMshtaDialog(
  message: string,
  suggestions: string[],
): Promise<{ action: "accept" | "cancel"; text: string }> {
  const tmpDir = os.tmpdir();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const resultFile = path.join(tmpDir, `chathook_result_${id}.txt`);
  const htaFile = path.join(tmpDir, `chathook_dialog_${id}.hta`);

  // All Chinese text → Base64 (avoids any encoding issues in the file)
  const titleB64 = Buffer.from("Chathook - 请输入您的回复", "utf-8").toString("base64");
  const submitB64 = Buffer.from("提交对话", "utf-8").toString("base64");

  // No message area in UI — dialog is just input box + submit button + countdown

  const htaContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<HTA:APPLICATION
  ID="chathook"
  BORDER="thick"
  BORDERSTYLE="normal"
  CAPTION="yes"
  ICON=""
  MAXIMIZEBUTTON="no"
  MINIMIZEBUTTON="no"
  SCROLL="no"
  SHOWINTASKBAR="yes"
  SINGLEINSTANCE="yes"
  SYSMENU="yes"
  WINDOWSTATE="normal"
/>
<title>chathook</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: "Segoe UI", "Noto Sans SC", sans-serif;
    background: #ffffff;
    color: #000000;
    overflow: hidden;
    height: 100%;
  }
  body { padding: 16px 20px; display: flex; flex-direction: column; }
  textarea {
    width: 100%;
    flex: 1 1 auto;
    border: 1px solid #cccccc;
    border-radius: 3px;
    font-family: inherit;
    font-size: 16px;
    padding: 10px;
    resize: none;
    outline: none;
    min-height: 60px;
  }
  textarea:focus { border-color: #333333; }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
  }
  .countdown {
    font-size: 13px;
    color: #999999;
  }
  .countdown.warn { color: #cc0000; }
  .submit-btn {
    padding: 8px 28px;
    background: #ffffff;
    border: 1px solid #333333;
    border-radius: 3px;
    font-size: 15px;
    cursor: pointer;
    font-family: inherit;
  }
  .submit-btn:hover { background: #f0f0f0; }
</style>
</head>
<body>
  <textarea id="input" placeholder=""></textarea>
  <div class="actions">
    <span class="countdown" id="countdown"></span>
    <button class="submit-btn" id="submitBtn"></button>
  </div>

<script language="JScript">
// ── Base64 helpers (JScript, runs in HTA/IE engine) ──
function b64decode(b64) {
  var xml = new ActiveXObject("MSXML2.DOMDocument");
  var node = xml.createElement("b64");
  node.dataType = "bin.base64";
  node.text = b64;
  var stream = new ActiveXObject("ADODB.Stream");
  stream.Type = 1; // adTypeBinary
  stream.Open();
  stream.Write(node.nodeTypedValue);
  stream.Position = 0;
  stream.Type = 2; // adTypeText
  stream.Charset = "utf-8";
  var text = stream.ReadText();
  stream.Close();
  return text;
}

function b64encode(text) {
  if (!text || text.length === 0) return "";
  var stream = new ActiveXObject("ADODB.Stream");
  stream.Type = 2; // adTypeText
  stream.Charset = "utf-8";
  stream.Open();
  stream.WriteText(text);
  stream.Position = 0;
  stream.Type = 1; // adTypeBinary
  var bytes = stream.Read();
  stream.Close();
  var xml = new ActiveXObject("MSXML2.DOMDocument");
  var node = xml.createElement("b64");
  node.dataType = "bin.base64";
  node.nodeTypedValue = bytes;
  return node.text;
}

// ── Write result to file (pure ASCII Base64) ──
var resultPath = "${resultFile.replace(/\\/g, "\\\\")}";
var submitted = false;

function writeResult(text) {
  if (submitted) return;
  submitted = true;
  var b64 = b64encode(text);
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  var f = fso.CreateTextFile(resultPath, true, false);
  if (b64.length > 0) f.Write(b64);
  f.Close();
}

// ── Set Chinese text via Base64 ──
document.title = b64decode("${titleB64}");
document.getElementById('submitBtn').innerText = b64decode("${submitB64}");

// ── Window sizing ──
function fitWindow() {
  var winW = 600;
  var winH = 250;
  window.resizeTo(winW, winH);
  var sw = screen.availWidth, sh = screen.availHeight;
  window.moveTo((sw - winW) / 2, (sh - winH) / 2);
}

// ── Textarea auto-fit on window resize ──
function fitTextarea() {
  var ta = document.getElementById('input');
  var actions = document.getElementsByTagName('div')[0];
  var bodyH = document.body.clientHeight;
  var actionsH = actions.offsetHeight;
  var taH = bodyH - actionsH - 16 - 16 - 12;
  if (taH > 40) ta.style.height = taH + 'px';
}
window.onresize = fitTextarea;

// ── Countdown timer (MCP timeout ~180s, use 170s for safety) ──
var remaining = 170;
var cdEl = document.getElementById('countdown');

function updateCountdown() {
  var m = Math.floor(remaining / 60);
  var s = remaining % 60;
  cdEl.innerText = m + ':' + (s < 10 ? '0' : '') + s;
  if (remaining <= 10) {
    cdEl.className = 'countdown warn';
  }
  if (remaining <= 0) {
    writeResult('');
    window.close();
    return;
  }
  remaining--;
}
updateCountdown();
var timer = setInterval(updateCountdown, 1000);

// ── Submit handlers ──
document.getElementById('submitBtn').onclick = function() {
  clearInterval(timer);
  writeResult(document.getElementById('input').value);
  window.close();
};

document.getElementById('input').onkeydown = function(e) {
  if (e.ctrlKey && e.keyCode == 13) {
    clearInterval(timer);
    writeResult(document.getElementById('input').value);
    window.close();
  }
};

// Handle X button close — write empty
window.onbeforeunload = function() {
  clearInterval(timer);
  try {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(resultPath)) {
      writeResult("");
    }
  } catch(e) {}
};

// ── Init ──
fitWindow();
fitTextarea();
document.getElementById('input').focus();
</script>
</body>
</html>`;

  try {
    // Write HTA with UTF-8 BOM
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const contentBuf = Buffer.from(htaContent, "utf-8");
    fs.writeFileSync(htaFile, Buffer.concat([bom, contentBuf]));

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("mshta.exe", [`"${htaFile}"`], {
        shell: true,
        stdio: "ignore",
      });
      proc.on("close", () => resolve());
      proc.on("error", (err) => reject(err));
    });

    // Read result (pure ASCII Base64)
    if (fs.existsSync(resultFile)) {
      const raw = fs.readFileSync(resultFile, "latin1").trim();
      const text = Buffer.from(raw, "base64").toString("utf-8");
      if (text.trim() === "") {
        return { action: "cancel", text: "" };
      }
      return { action: "accept", text };
    }

    return { action: "cancel", text: "" };
  } finally {
    try {
      if (fs.existsSync(htaFile)) fs.unlinkSync(htaFile);
      if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
    } catch {
      // ignore
    }
  }
}

// ─── Non-Windows fallback: stdin ────────────────────────────

async function showStdinDialog(
  message: string,
): Promise<{ action: "accept" | "cancel"; text: string }> {
  return new Promise((resolve) => {
    process.stderr.write(`\n[chathook] ${message}\n`);
    process.stderr.write(`[chathook] Enter your response:\n> `);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      const text = data.toString().trim();
      if (text === "") {
        resolve({ action: "cancel", text: "" });
      } else {
        resolve({ action: "accept", text });
      }
    });
  });
}
