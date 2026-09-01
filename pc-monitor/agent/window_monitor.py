"""アクティブウィンドウ(利用中のアプリ)の履歴を記録する。

ウィンドウが変わったタイミングでのみイベントを書き込み、変わっていない間は
何もしない(ポーリングはするが、記録は変化時だけなので書き込み量は増えない)。
"""
import threading
import time

import psutil
import win32gui
import win32process


class WindowMonitor:
    def __init__(self, on_event, interval_sec=10):
        self._on_event = on_event
        self._interval = interval_sec
        self._stop = threading.Event()
        self._thread = None
        self._last_title = None
        self._last_process = None
        self._last_start = None

    def start(self):
        self._thread = threading.Thread(target=self._run, name="window-monitor", daemon=True)
        self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            self._poll()
            self._stop.wait(self._interval)
        self._flush()

    def _poll(self):
        try:
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            process_name = psutil.Process(pid).name() if pid else None
        except Exception:
            title, process_name = None, None

        if title != self._last_title or process_name != self._last_process:
            self._flush()
            self._last_title = title
            self._last_process = process_name
            self._last_start = time.time()

    def _flush(self):
        if self._last_process is None and self._last_title is None:
            return
        if self._last_start is None:
            return
        duration = round(time.time() - self._last_start, 1)
        self._on_event("window", {
            "title": self._last_title,
            "process": self._last_process,
            "duration_sec": duration,
        })

    def stop(self):
        self._stop.set()
