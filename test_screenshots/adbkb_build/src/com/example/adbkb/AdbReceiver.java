package com.example.adbkb;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

/**
 * Receives ADB_INPUT_TEXT / ADB_INPUT_CODE broadcasts and forwards to the IME.
 */
public class AdbReceiver extends BroadcastReceiver {
    private static final String TAG = "AdbKbReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "Received: " + action);

        if ("ADB_INPUT_TEXT".equals(action)) {
            String msg = intent.getStringExtra("msg");
            if (msg != null && !msg.isEmpty()) {
                Log.d(TAG, "Committing text: " + msg);
                if (AdbInputMethod.instance != null) {
                    AdbInputMethod.instance.commitText(msg);
                } else {
                    Log.w(TAG, "IME instance is null - make sure AdbInputMethod is selected as input method");
                    // Fallback: try setting clipboard
                    fallbackClipboard(context, msg);
                }
            }
        } else if ("ADB_INPUT_CODE".equals(action)) {
            int code = intent.getIntExtra("code", 0);
            Log.d(TAG, "Sending keycode: " + code);
            if (AdbInputMethod.instance != null) {
                AdbInputMethod.instance.sendKeyCode(code);
            }
        }

        setResultCode(-1); // RESULT_OK equivalent for ordered broadcasts
        setResultData("OK");
    }

    private void fallbackClipboard(Context context, String text) {
        try {
            android.content.ClipboardManager cm =
                (android.content.ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            android.content.ClipData clip = android.content.ClipData.newPlainText("adb_input", text);
            cm.setPrimaryClip(clip);
            Log.d(TAG, "Fallback: set clipboard");
        } catch (Exception e) {
            Log.e(TAG, "Fallback failed", e);
        }
    }
}
