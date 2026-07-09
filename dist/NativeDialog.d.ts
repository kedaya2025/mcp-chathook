/**
 * Shows a native desktop dialog using Windows PowerShell + Windows.Forms.
 *
 * Encoding strategy (triple-safe):
 * 1. PS1 file written with UTF-8 BOM so PowerShell 5.1 reads it as UTF-8
 * 2. All Chinese text passed as Base64 inside the script
 * 3. Result written as Base64 (pure ASCII) to temp file, decoded by Node.js
 *
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export declare function showNativeDialog(message: string, suggestions?: string[]): Promise<{
    action: "accept" | "cancel";
    text: string;
}>;
