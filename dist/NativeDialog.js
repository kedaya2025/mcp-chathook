import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
/**
 * Shows a native desktop dialog using Windows PowerShell + Windows.Forms.
 *
 * Encoding: triple-safe (PS1 BOM + Base64 text + Base64 result)
 * DPI: SetProcessDPIAware for sharp rendering
 *
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export async function showNativeDialog(message, suggestions = []) {
    if (process.platform === "win32") {
        return showPowerShellDialog(message, suggestions);
    }
    return showStdinDialog(message);
}
// ─── Windows: PowerShell + Windows.Forms ────────────────────
async function showPowerShellDialog(message, suggestions) {
    const tmpDir = os.tmpdir();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resultFile = path.join(tmpDir, `chathook_result_${id}.txt`);
    // Encode all Chinese text as Base64
    const messageB64 = Buffer.from(message, "utf-8").toString("base64");
    const suggestionB64s = suggestions.map((s) => Buffer.from(s, "utf-8").toString("base64"));
    // Result path with escaped backslashes for PowerShell string
    const psResultPath = resultFile.replace(/\\/g, "\\");
    // Build suggestion button code (plain style)
    let suggestionCode = "";
    if (suggestions.length > 0) {
        suggestionCode = `
    $suggestionPanel = New-Object System.Windows.Forms.FlowLayoutPanel
    $suggestionPanel.AutoSize = $true
    $suggestionPanel.AutoSizeMode = 'GrowAndShrink'
    $suggestionPanel.FlowDirection = 'LeftToRight'
    $suggestionPanel.WrapContents = $true`;
        suggestionB64s.forEach((b64, i) => {
            suggestionCode += `
    $sugText${i} = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))
    $btn${i} = New-Object System.Windows.Forms.Button
    $btn${i}.Text = $sugText${i}
    $btn${i}.FlatStyle = 'Flat'
    $btn${i}.Font = $smallFont
    $btn${i}.Padding = New-Object System.Windows.Forms.Padding(8,2,8,2)
    $btn${i}.Cursor = 'Hand'
    $btnVar${i} = $sugText${i}
    $btn${i}.Add_Click({ $inputBox.Text = $btnVar${i} })
    $suggestionPanel.Controls.Add($btn${i})`;
        });
        suggestionCode += `
    $suggestionPanel.Location = New-Object System.Drawing.Point(20, $yOffset)
    $form.Controls.Add($suggestionPanel)
    $yOffset += 35`;
    }
    const psScript = `# chathook dialog
# DPI awareness must be set BEFORE loading WinForms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiAware {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
}
"@
[DpiAware]::SetProcessDPIAware() | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Decode message from Base64
$msgText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${messageB64}'))

$form = New-Object System.Windows.Forms.Form
$form.Text = 'chathook'
$form.Size = New-Object System.Drawing.Size(480, 320)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$form.ForeColor = [System.Drawing.Color]::Black
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$smallFont = New-Object System.Drawing.Font('Segoe UI', 8)

# Message label
$msgLabel = New-Object System.Windows.Forms.Label
$msgLabel.Text = $msgText
$msgLabel.AutoSize = $false
$msgLabel.Width = 430
$msgLabel.Height = 80
$msgLabel.Location = New-Object System.Drawing.Point(20, 15)
$msgLabel.BackColor = [System.Drawing.Color]::White
$msgLabel.ForeColor = [System.Drawing.Color]::Black
$form.Controls.Add($msgLabel)

$yOffset = 105
${suggestionCode}

# Input textbox
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.Multiline = $true
$inputBox.Size = New-Object System.Drawing.Size(430, 100)
$inputBox.Location = New-Object System.Drawing.Point(20, $yOffset)
$inputBox.BackColor = [System.Drawing.Color]::White
$inputBox.ForeColor = [System.Drawing.Color]::Black
$inputBox.BorderStyle = 'FixedSingle'
$inputBox.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.Controls.Add($inputBox)

$yOffset += 110

# Result file path
$resultPath = '${psResultPath}'

# Write result as Base64 (pure ASCII)
function WriteResult($text) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $b64 = [System.Convert]::ToBase64String($bytes)
    [System.IO.File]::WriteAllText($resultPath, $b64, [System.Text.Encoding]::ASCII)
}

# Submit button
$submitBtn = New-Object System.Windows.Forms.Button
$submitBtn.Text = 'Submit'
$submitBtn.Size = New-Object System.Drawing.Size(100, 30)
$submitBtn.Location = New-Object System.Drawing.Point(350, $yOffset)
$submitBtn.FlatStyle = 'Flat'
$submitBtn.BackColor = [System.Drawing.Color]::White
$submitBtn.ForeColor = [System.Drawing.Color]::Black
$submitBtn.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$submitBtn.Cursor = 'Hand'
$submitBtn.Add_Click({
    WriteResult $inputBox.Text
    $form.Close()
})
$form.Controls.Add($submitBtn)

# Ctrl+Enter to submit
$inputBox.Add_KeyDown({
    if ($_.Control -and $_.KeyCode -eq 'Enter') {
        WriteResult $inputBox.Text
        $form.Close()
    }
})

# Handle X button close - write empty result
$form.Add_FormClosing({
    if (-not (Test-Path $resultPath)) {
        WriteResult ''
    }
})

$form.Activate()
$inputBox.Focus()
$form.ShowDialog() | Out-Null
`;
    // Write PS1 with UTF-8 BOM
    const psFile = path.join(tmpDir, `chathook_dialog_${id}.ps1`);
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const scriptBuf = Buffer.from(psScript, "utf-8");
    fs.writeFileSync(psFile, Buffer.concat([bom, scriptBuf]));
    try {
        await new Promise((resolve, reject) => {
            const proc = spawn("powershell.exe", [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-File", psFile,
            ], {
                shell: false,
                stdio: "ignore",
            });
            proc.on("close", () => resolve());
            proc.on("error", (err) => reject(err));
        });
        // Read result (pure ASCII Base64)
        if (fs.existsSync(resultFile)) {
            const raw = fs.readFileSync(resultFile, "ascii").trim();
            const text = Buffer.from(raw, "base64").toString("utf-8");
            // Empty text (closed dialog or empty submit) → return default message
            if (text.trim() === "") {
                return { action: "cancel", text: "" };
            }
            return { action: "accept", text };
        }
        return { action: "cancel", text: "" };
    }
    finally {
        try {
            if (fs.existsSync(psFile))
                fs.unlinkSync(psFile);
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