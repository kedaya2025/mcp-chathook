import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
/**
 * Shows a native desktop dialog (not a browser) using Windows mshta.exe.
 * The dialog displays a message, optional quick-reply buttons, a text area,
 * and Submit / Cancel buttons.
 *
 * Data is exchanged via Base64 to avoid all encoding issues.
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export async function showNativeDialog(message, suggestions = []) {
    if (process.platform === "win32") {
        return showMshtaDialog(message, suggestions);
    }
    return showStdinDialog(message);
}
// ─── Windows: mshta.exe ─────────────────────────────────────
async function showMshtaDialog(message, suggestions) {
    const tmpDir = os.tmpdir();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resultFile = path.join(tmpDir, `chathook_result_${id}.txt`);
    const htaFile = path.join(tmpDir, `chathook_dialog_${id}.hta`);
    // Escape message for embedding in HTML
    const escapedMessage = escapeHtml(message);
    // Build suggestion buttons
    const suggestionButtons = suggestions
        .map((s) => `<button class="suggestion-btn" onclick="fillInput('${escapeJsString(s)}')">${escapeHtml(s)}</button>`)
        .join("\n");
    // Path with double backslashes for VBScript string
    const vbsPath = resultFile.replace(/\\/g, "\\\\");
    const htaContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
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
<title>chathook - AI 对话钩子</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", "Noto Sans SC", sans-serif;
    background: #1e1e2e;
    color: #cdd6f4;
    padding: 20px;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    font-size: 15px;
    font-weight: 700;
    color: #89b4fa;
  }
  .header-icon {
    width: 28px; height: 28px;
    border-radius: 7px;
    background: linear-gradient(135deg, #89b4fa, #b4befe);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; color: #1e1e2e;
  }
  .message {
    background: #313244;
    border-left: 3px solid #89b4fa;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 14px;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .suggestion-btn {
    padding: 5px 14px;
    background: #45475a;
    border: 1px solid #585b70;
    border-radius: 16px;
    color: #cdd6f4;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .suggestion-btn:hover {
    background: #585b70;
    border-color: #89b4fa;
    color: #89b4fa;
  }
  textarea {
    width: 100%;
    min-height: 100px;
    background: #313244;
    border: 1px solid #585b70;
    border-radius: 8px;
    color: #cdd6f4;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    padding: 12px;
    resize: vertical;
    outline: none;
  }
  textarea:focus { border-color: #89b4fa; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 14px;
  }
  button.action-btn {
    padding: 8px 22px;
    border-radius: 8px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .btn-cancel {
    background: transparent;
    border: 1px solid #f38ba8;
    color: #f38ba8;
  }
  .btn-cancel:hover { background: rgba(243,139,168,0.1); }
  .btn-submit {
    background: #89b4fa;
    color: #1e1e2e;
  }
  .btn-submit:hover { background: #b4befe; }
  .footer {
    text-align: center;
    font-size: 11px;
    color: #6c7086;
    margin-top: 10px;
  }
</style>
<script language="VBScript">
  ' Write result as Base64-encoded UTF-8 to avoid all encoding issues
  Sub WriteResult(text, isCancel)
    Dim encoded
    If isCancel Then
      encoded = "CANCEL"
    Else
      ' Convert text to UTF-8 bytes, then to Base64
      Set stream = CreateObject("ADODB.Stream")
      stream.Type = 2  ' adTypeText
      stream.Charset = "utf-8"
      stream.Open
      stream.WriteText text
      stream.Position = 0
      stream.Type = 1  ' adTypeBinary
      ' Skip the 3-byte UTF-8 BOM that ADODB.Stream adds
      stream.Position = 3
      Dim bytes
      bytes = stream.Read
      stream.Close

      Set xml = CreateObject("MSXML2.DOMDocument")
      Set node = xml.createElement("b64")
      node.dataType = "bin.base64"
      node.nodeTypedValue = bytes
      encoded = node.text
    End If

    ' Write encoded string as ASCII (pure ASCII, no encoding issues)
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.CreateTextFile("${vbsPath}", True, False)
    f.Write encoded
    f.Close
    window.close
  End Sub

  Sub OnSubmit()
    WriteResult document.getElementById("userInput").Value, False
  End Sub

  Sub OnCancel()
    WriteResult "", True
  End Sub

  Sub FillInput(val)
    document.getElementById("userInput").Value = val
  End Sub

  Sub Window_OnLoad()
    window.resizeTo 520, 480
    Dim sw, sh
    sw = document.parentWindow.screen.availWidth
    sh = document.parentWindow.screen.availHeight
    window.moveTo (sw - 520) \\ 2, (sh - 480) \\ 2
    document.getElementById("userInput").Focus
  End Sub
</script>
</head>
<body>
  <div class="header">
    <div class="header-icon">&#128279;</div>
    <span>chathook</span>
  </div>
  <div class="message">${escapedMessage}</div>
  ${suggestions.length > 0 ? `<div class="suggestions">${suggestionButtons}</div>` : ""}
  <textarea id="userInput" placeholder="输入你的回复..."></textarea>
  <div class="actions">
    <button class="action-btn btn-cancel" onclick="OnCancel()">取消</button>
    <button class="action-btn btn-submit" onclick="OnSubmit()">提交 &#9656;</button>
  </div>
  <div class="footer">chathook v1.0 &#8226; Ctrl+Enter to submit</div>
  <script language="VBScript">
    Sub userInput_OnKeyDown
      If window.event.ctrlKey And window.event.keyCode = 13 Then
        OnSubmit
      End If
    End Sub
  </script>
</body>
</html>`;
    try {
        // Write HTA file with UTF-8 BOM so mshta.exe renders Chinese correctly
        const bom = "\uFEFF";
        fs.writeFileSync(htaFile, bom + htaContent, "utf-8");
        await new Promise((resolve, reject) => {
            const proc = spawn("mshta.exe", [`"${htaFile}"`], {
                shell: true,
                stdio: "ignore",
            });
            proc.on("close", () => resolve());
            proc.on("error", (err) => reject(err));
        });
        // Read result (pure ASCII Base64 or "CANCEL")
        if (fs.existsSync(resultFile)) {
            const raw = fs.readFileSync(resultFile, "latin1").trim();
            if (raw === "CANCEL") {
                return { action: "cancel", text: "" };
            }
            // Decode Base64 → UTF-8
            const text = Buffer.from(raw, "base64").toString("utf-8");
            return { action: "accept", text };
        }
        // File doesn't exist — dialog was closed via X button
        return { action: "cancel", text: "" };
    }
    finally {
        // Cleanup temp files
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
        process.stderr.write(`[chathook] Enter your response (or type __cancel__ to cancel):\n> `);
        process.stdin.resume();
        process.stdin.once("data", (data) => {
            process.stdin.pause();
            const text = data.toString().trim();
            if (text === "__cancel__" || text === "") {
                resolve({ action: "cancel", text: "" });
            }
            else {
                resolve({ action: "accept", text });
            }
        });
    });
}
// ─── Helpers ────────────────────────────────────────────────
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function escapeJsString(text) {
    return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
//# sourceMappingURL=NativeDialog.js.map