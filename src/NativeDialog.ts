import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Shows a native desktop dialog using Windows PowerShell + Windows.Forms.
 *
 * PowerShell natively supports UTF-8, so no encoding issues.
 * The result is written to a temp file as UTF-8, then read by Node.js.
 *
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export async function showNativeDialog(
  message: string,
  suggestions: string[] = [],
): Promise<{ action: "accept" | "cancel"; text: string }> {
  if (process.platform === "win32") {
    return showPowerShellDialog(message, suggestions);
  }
  return showStdinDialog(message);
}

// ─── Windows: PowerShell + Windows.Forms ────────────────────

async function showPowerShellDialog(
  message: string,
  suggestions: string[],
): Promise<{ action: "accept" | "cancel"; text: string }> {
  const tmpDir = os.tmpdir();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const resultFile = path.join(tmpDir, `chathook_result_${id}.txt`);

  // Build suggestion buttons script
  let suggestionButtonCode = "";
  let suggestionClickHandlers = "";
  if (suggestions.length > 0) {
    suggestionButtonCode = `
      $suggestionPanel = New-Object System.Windows.Forms.FlowLayoutPanel
      $suggestionPanel.AutoSize = $true
      $suggestionPanel.AutoSizeMode = 'GrowAndShrink'
      $suggestionPanel.FlowDirection = 'LeftToRight'
      $suggestionPanel.WrapContents = $true
      $suggestionPanel.Padding = New-Object System.Windows.Forms.Padding(0,0,0,8)`;

    suggestions.forEach((s, i) => {
      const escaped = s.replace(/'/g, "''");
      suggestionButtonCode += `
      $btn${i} = New-Object System.Windows.Forms.Button
      $btn${i}.Text = '${escaped}'
      $btn${i}.FlatStyle = 'Flat'
      $btn${i}.BackColor = [System.Drawing.Color]::FromArgb(69,71,90)
      $btn${i}.ForeColor = [System.Drawing.Color]::FromArgb(205,214,244)
      $btn${i}.Font = $smallFont
      $btn${i}.Padding = New-Object System.Windows.Forms.Padding(10,3,10,3)
      $btn${i}.Cursor = 'Hand'
      $btn${i}.Add_Click({ $inputBox.Text = '${escaped}' })`;
      suggestionClickHandlers += `
      $suggestionPanel.Controls.Add($btn${i})`;
    });
  }

  const escapedMessage = message.replace(/'/g, "''");
  const escapedResultPath = resultFile.replace(/\\/g, "\\");

  const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'chathook - AI 对话钩子'
$form.Size = New-Object System.Drawing.Size(540, 500)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(30,30,46)
$form.ForeColor = [System.Drawing.Color]::FromArgb(205,214,244)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$smallFont = New-Object System.Drawing.Font('Segoe UI', 8)

# Header
$headerLabel = New-Object System.Windows.Forms.Label
$headerLabel.Text = 'chathook'
$headerLabel.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$headerLabel.ForeColor = [System.Drawing.Color]::FromArgb(137,180,250)
$headerLabel.AutoSize = $true
$headerLabel.Location = New-Object System.Drawing.Point(20, 15)
$form.Controls.Add($headerLabel)

# Message
$msgLabel = New-Object System.Windows.Forms.Label
$msgLabel.Text = '${escapedMessage}'
$msgLabel.AutoSize = $false
$msgLabel.Width = 490
$msgLabel.Height = 120
$msgLabel.Location = New-Object System.Drawing.Point(20, 50)
$msgLabel.BackColor = [System.Drawing.Color]::FromArgb(49,50,68)
$msgLabel.ForeColor = [System.Drawing.Color]::FromArgb(205,214,244)
$msgLabel.Padding = New-Object System.Windows.Forms.Padding(12,10,12,10)
$form.Controls.Add($msgLabel)

$yOffset = 180
${suggestionButtonCode}
${suggestionClickHandlers ? `
$suggestionPanel.Location = New-Object System.Drawing.Point(20, $yOffset)
$form.Controls.Add($suggestionPanel)
$yOffset += 40` : ''}

# Input textbox
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.Multiline = $true
$inputBox.Size = New-Object System.Drawing.Size(490, 120)
$inputBox.Location = New-Object System.Drawing.Point(20, $yOffset)
$inputBox.BackColor = [System.Drawing.Color]::FromArgb(49,50,68)
$inputBox.ForeColor = [System.Drawing.Color]::FromArgb(205,214,244)
$inputBox.BorderStyle = 'FixedSingle'
$inputBox.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.Controls.Add($inputBox)

$yOffset += 130

# Buttons
$btnPanel = New-Object System.Windows.Forms.Panel
$btnPanel.Size = New-Object System.Drawing.Size(490, 35)
$btnPanel.Location = New-Object System.Drawing.Point(20, $yOffset)
$btnPanel.BackColor = [System.Drawing.Color]::FromArgb(30,30,46)

$cancelBtn = New-Object System.Windows.Forms.Button
$cancelBtn.Text = '取消'
$cancelBtn.Size = New-Object System.Drawing.Size(80, 32)
$cancelBtn.Location = New-Object System.Drawing.Point(305, 0)
$cancelBtn.FlatStyle = 'Flat'
$cancelBtn.BackColor = [System.Drawing.Color]::FromArgb(30,30,46)
$cancelBtn.ForeColor = [System.Drawing.Color]::FromArgb(243,139,168)
$cancelBtn.Cursor = 'Hand'
$cancelBtn.Add_Click({
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText('${escapedResultPath}', 'CANCEL', $utf8NoBom)
    $form.Close()
})

$submitBtn = New-Object System.Windows.Forms.Button
$submitBtn.Text = '提交 ▸'
$submitBtn.Size = New-Object System.Drawing.Size(90, 32)
$submitBtn.Location = New-Object System.Drawing.Point(395, 0)
$submitBtn.FlatStyle = 'Flat'
$submitBtn.BackColor = [System.Drawing.Color]::FromArgb(137,180,250)
$submitBtn.ForeColor = [System.Drawing.Color]::FromArgb(30,30,46)
$submitBtn.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$submitBtn.Cursor = 'Hand'
$submitBtn.Add_Click({
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText('${escapedResultPath}', $inputBox.Text, $utf8NoBom)
    $form.Close()
})

$btnPanel.Controls.Add($cancelBtn)
$btnPanel.Controls.Add($submitBtn)
$form.Controls.Add($btnPanel)

# Ctrl+Enter to submit
$inputBox.Add_KeyDown({
    if ($_.Control -and $_.KeyCode -eq 'Enter') {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText('${escapedResultPath}', $inputBox.Text, $utf8NoBom)
        $form.Close()
    }
})

# Handle X button close
$form.Add_FormClosing({
    if (-not (Test-Path '${escapedResultPath}')) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText('${escapedResultPath}', 'CANCEL', $utf8NoBom)
    }
})

$form.Activate()
$inputBox.Focus()
$form.ShowDialog() | Out-Null
`;

  // Write PowerShell script to temp file
  const psFile = path.join(tmpDir, `chathook_dialog_${id}.ps1`);
  fs.writeFileSync(psFile, psScript, "utf-8");

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy", "Bypass",
          "-File", psFile,
        ],
        {
          shell: false,
          stdio: "ignore",
        },
      );
      proc.on("close", () => resolve());
      proc.on("error", (err) => reject(err));
    });

    // Read result — detect encoding to handle UTF-8, UTF-16LE, and BOM
    if (fs.existsSync(resultFile)) {
      const buf = fs.readFileSync(resultFile);
      let content = decodeTextBuffer(buf);
      content = content.trim();

      if (content === "CANCEL") {
        return { action: "cancel", text: "" };
      }
      return { action: "accept", text: content };
    }

    return { action: "cancel", text: "" };
  } finally {
    try {
      if (fs.existsSync(psFile)) fs.unlinkSync(psFile);
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
    process.stderr.write(
      `[chathook] Enter your response (or type __cancel__ to cancel):\n> `,
    );
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      const text = data.toString().trim();
      if (text === "__cancel__" || text === "") {
        resolve({ action: "cancel", text: "" });
      } else {
        resolve({ action: "accept", text });
      }
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Robustly decode a Buffer to string, handling UTF-8 BOM, UTF-16LE BOM,
 * and raw UTF-16LE (Windows PowerShell default in some cases).
 */
function decodeTextBuffer(buf: Buffer): string {
  if (buf.length === 0) return "";

  // UTF-8 BOM (EF BB BF)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString("utf-8");
  }

  // UTF-16LE BOM (FF FE)
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString("utf-16le");
  }

  // UTF-16BE BOM (FE FF) — rare but handle it
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    return buf.slice(2).swap16().toString("utf-16le");
  }

  // No BOM — detect UTF-16LE by checking for zero-byte pattern
  // (common when PowerShell writes with default encoding)
  if (buf.length >= 2 && buf[1] === 0x00 && buf[0] !== 0x00) {
    // Check if every odd byte is 0x00 (typical of ASCII/Chinese in UTF-16LE)
    let isUtf16 = true;
    for (let i = 1; i < Math.min(buf.length, 100); i += 2) {
      if (buf[i] !== 0x00) {
        // Allow non-zero for Chinese chars, but if the first few bytes show
        // the pattern, it's likely UTF-16LE
        if (i < 10) {
          isUtf16 = false;
          break;
        }
      }
    }
    if (isUtf16 && buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00) {
      return buf.toString("utf-16le");
    }
  }

  // Default: UTF-8
  return buf.toString("utf-8");
}
