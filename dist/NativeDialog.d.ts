/**
 * Shows a native desktop dialog (not a browser) using Windows mshta.exe.
 * The dialog displays a message, optional quick-reply buttons, a text area,
 * and Submit / Cancel buttons.
 *
 * Data is exchanged via Base64 to avoid all encoding issues.
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export declare function showNativeDialog(message: string, suggestions?: string[]): Promise<{
    action: "accept" | "cancel";
    text: string;
}>;
