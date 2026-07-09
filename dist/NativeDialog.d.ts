/**
 * Shows a native desktop dialog using Windows PowerShell + Windows.Forms.
 *
 * PowerShell natively supports UTF-8, so no encoding issues.
 * The result is written to a temp file as UTF-8, then read by Node.js.
 *
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export declare function showNativeDialog(message: string, suggestions?: string[]): Promise<{
    action: "accept" | "cancel";
    text: string;
}>;
