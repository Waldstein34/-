"""CPU/メモリ/ディスク使用率を定期的に記録する。

psutil.cpu_percent はブロッキング呼び出し(interval指定)だと計測のためにその場で
待機してしまうため、起動時に一度だけ基準値をセットし、以降はノンブロッキングで
取得する(非力なCPUでの測定オーバーヘッドを避けるため)。
"""
import threading

import psutil


class ResourceMonitor:
    def __init__(self, on_event, interval_sec=120, disks=None):
        self._on_event = on_event
        self._interval = interval_sec
        self._disks = disks or ["C:\\"]
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        psutil.cpu_percent(interval=None)
        self._thread = threading.Thread(target=self._run, name="resource-monitor", daemon=True)
        self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            self._poll()
            self._stop.wait(self._interval)

    def _poll(self):
        disk_usage = {}
        for path in self._disks:
            try:
                disk_usage[path] = psutil.disk_usage(path).percent
            except OSError:
                continue

        self._on_event("resource", {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_percent": disk_usage,
        })

    def stop(self):
        self._stop.set()
