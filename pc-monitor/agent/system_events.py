"""ログオン/ログオフ・ロック/ロック解除・スリープ/復帰などのシステムイベントを記録する。

Windowsのセッション通知・電源通知はメッセージが飛んできたときだけ処理される
イベント駆動の仕組みなので、ポーリングは一切行わず、常時の負荷はほぼゼロ。
"""
import ctypes
import threading

import win32api
import win32con
import win32gui

WM_WTSSESSION_CHANGE = 0x02B1
WM_POWERBROADCAST = 0x0218

WTS_CONSOLE_CONNECT = 0x1
WTS_CONSOLE_DISCONNECT = 0x2
WTS_REMOTE_CONNECT = 0x3
WTS_REMOTE_DISCONNECT = 0x4
WTS_SESSION_LOGON = 0x5
WTS_SESSION_LOGOFF = 0x6
WTS_SESSION_LOCK = 0x7
WTS_SESSION_UNLOCK = 0x8

PBT_APMSUSPEND = 0x4
PBT_APMRESUMESUSPEND = 0x7
PBT_APMRESUMEAUTOMATIC = 0x12

NOTIFY_FOR_THIS_SESSION = 0

_WTS_EVENT_NAMES = {
    WTS_CONSOLE_CONNECT: "console_connect",
    WTS_CONSOLE_DISCONNECT: "console_disconnect",
    WTS_REMOTE_CONNECT: "remote_connect",
    WTS_REMOTE_DISCONNECT: "remote_disconnect",
    WTS_SESSION_LOGON: "logon",
    WTS_SESSION_LOGOFF: "logoff",
    WTS_SESSION_LOCK: "lock",
    WTS_SESSION_UNLOCK: "unlock",
}

_PBT_EVENT_NAMES = {
    PBT_APMSUSPEND: "sleep",
    PBT_APMRESUMESUSPEND: "resume",
    PBT_APMRESUMEAUTOMATIC: "resume_auto",
}


class SystemEventWatcher:
    def __init__(self, on_event):
        self._on_event = on_event
        self._hwnd = None
        self._thread = None

    def start(self):
        self._thread = threading.Thread(target=self._run, name="system-event-watcher", daemon=True)
        self._thread.start()

    def _run(self):
        wc = win32gui.WNDCLASS()
        wc.lpfnWndProc = self._wnd_proc
        wc.lpszClassName = "PCMonitorSystemEventWindow"
        wc.hInstance = win32api.GetModuleHandle(None)
        try:
            class_atom = win32gui.RegisterClass(wc)
        except win32gui.error:
            class_atom = wc.lpszClassName

        self._hwnd = win32gui.CreateWindow(
            class_atom, "PCMonitorSystemEventWindow", 0, 0, 0, 0, 0,
            0, 0, wc.hInstance, None,
        )

        ctypes.windll.wtsapi32.WTSRegisterSessionNotification(self._hwnd, NOTIFY_FOR_THIS_SESSION)

        self._on_event("startup", {})
        win32gui.PumpMessages()

    def _wnd_proc(self, hwnd, msg, wparam, lparam):
        if msg == WM_WTSSESSION_CHANGE:
            name = _WTS_EVENT_NAMES.get(wparam, f"wts_{wparam}")
            self._on_event(name, {})
        elif msg == WM_POWERBROADCAST:
            name = _PBT_EVENT_NAMES.get(wparam)
            if name:
                self._on_event(name, {})
        elif msg == win32con.WM_QUERYENDSESSION:
            self._on_event("shutdown_or_logoff", {})
        return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)

    def stop(self):
        if self._hwnd:
            win32gui.PostMessage(self._hwnd, win32con.WM_CLOSE, 0, 0)
