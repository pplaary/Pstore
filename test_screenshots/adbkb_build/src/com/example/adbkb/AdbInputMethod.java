package com.example.adbkb;

import android.app.Service;
import android.content.Intent;
import android.inputmethodservice.InputMethodService;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;

/**
 * Minimal ADB Input Helper IME
 * 
 * Usage:
 *   adb shell ime set com.example.adbkb/.AdbInputMethod
 *   adb shell am broadcast -a ADB_INPUT_TEXT --es msg "your text here"
 *   adb shell am broadcast -a ADB_INPUT_CODE --ei code 66  (for Enter)
 */
public class AdbInputMethod extends InputMethodService {
    static AdbInputMethod instance;
    Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public void onStartInputView(EditorInfo attribute, boolean restarting) {
        super.onStartInputView(attribute, restarting);
    }

    /**
     * Commit text to the current input connection (called from broadcast receiver).
     */
    public void commitText(String text) {
        handler.post(() -> {
            InputConnection ic = getCurrentInputConnection();
            if (ic != null && text != null) {
                ic.commitText(text, 1);
            }
        });
    }

    /**
     * Send a key event (e.g., Enter=66).
     */
    public void sendKeyCode(int keyCode) {
        handler.post(() -> {
            InputConnection ic = getCurrentInputConnection();
            if (ic != null) {
                ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
                ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
            }
        });
    }
}
