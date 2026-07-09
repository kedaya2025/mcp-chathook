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
export async function showNativeDialog(message, suggestions = []) {
    if (process.platform === "win32") {
        return showMshtaDialog(message, suggestions);
    }
    return showStdinDialog(message);
}
// ─── Windows: mshta.exe + JScript ───────────────────────────
async function showMshtaDialog(message, suggestions) {
    const tmpDir = os.tmpdir();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resultFile = path.join(tmpDir, `chathook_result_${id}.txt`);
    const htaFile = path.join(tmpDir, `chathook_dialog_${id}.hta`);
    // All Chinese text → Base64 (avoids any encoding issues in the file)
    const messageB64 = Buffer.from(message, "utf-8").toString("base64");
    // Suggestions removed per user request — dialog is just prompt + input + submit
    const htaContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<HTA:APPLICATION
  ID="chathook"
  BORDER="dialog"
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
  body { padding: 16px 20px; }
  .message {
    font-size: 16px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    margin-bottom: 14px;
    max-height: 180px;
    overflow-y: auto;
  }
  textarea {
    width: 100%;
    height: 120px;
    border: 1px solid #cccccc;
    border-radius: 3px;
    font-family: inherit;
    font-size: 16px;
    padding: 10px;
    resize: none;
    outline: none;
  }
  textarea:focus { border-color: #333333; }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
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
  <div class="message" id="message"></div>
  <textarea id="input" placeholder=""></textarea>
  <div class="actions">
    <button class="submit-btn" id="submitBtn">Submit</button>
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
function writeResult(text) {
  var b64 = b64encode(text);
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  var f = fso.CreateTextFile("${resultFile.replace(/\\/g, "\\\\")}", true, false);
  f.Write(b64);
  f.Close();
}

// ── Init ──
window.resizeTo(520, 320);
var sw = screen.availWidth, sh = screen.availHeight;
window.moveTo((sw - 520) / 2, (sh - 320) / 2);

document.getElementById('message').innerText = b64decode("${messageB64}");

document.getElementById('submitBtn').onclick = function() {
  writeResult(document.getElementById('input').value);
  window.close();
};

document.getElementById('input').onkeydown = function(e) {
  if (e.ctrlKey && e.keyCode == 13) {
    writeResult(document.getElementById('input').value);
    window.close();
  }
};

// Handle X button close — write empty
window.onbeforeunload = function() {
  try {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists("${resultFile.replace(/\\/g, "\\\\")}")) {
      writeResult("");
    }
  } catch(e) {}
};

document.getElementById('input').focus();
</script>
</body>
</html>`;
    try {
        // Write HTA with UTF-8 BOM
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const contentBuf = Buffer.from(htaContent, "utf-8");
        fs.writeFileSync(htaFile, Buffer.concat([bom, contentBuf]));
        await new Promise((resolve, reject) => {
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
    }
    finally {
        try {
            if (fs.existsSync(htaFile))
                fs.unlinkSync(htaFile);
            if (fs.existsSync(resultFile))
                fs.unlinkSync(resultFile);
        }
        catch {
            // ignore
        }
    }
}
// ─── Non-Windows fallback: stdin ────────────────────────────
async function showStdinDialog(message) {
    return new Promise((resolve) => {
        process.stderr.write(`\n[chathook] ${message}\n`);
        process.stderr.write(`[chathook] Enter your response:\n> `);
        process.stdin.resume();
        process.stdin.once("data", (data) => {
            process.stdin.pause();
            const text = data.toString().trim();
            if (text === "") {
                resolve({ action: "cancel", text: "" });
            }
            else {
                resolve({ action: "accept", text });
            }
        });
    });
}
//# sourceMappingURL=NativeDialog.js.map