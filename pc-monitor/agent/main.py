"""PC操作ログ監視エージェント本体。

Windowsのタスクスケジューラから pythonw.exe agent\\main.py として
ログオン時に起動される想定(コンソール画面は出ない=静かに動くが、
プロセスは通常通りタスクマネージャーに表示され、隠蔽・偽装は行わない)。
"""
import os
import sys
import time

import psutil
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from file_watcher import FileWatcher
from log_cleanup import cleanup_old_logs
from logger import JsonlLogger
from resource_monitor import ResourceMonitor
from system_events import SystemEventWatcher
from window_monitor import WindowMonitor

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config():
    with open(os.path.join(ROOT_DIR, "config.yaml"), encoding="utf-8") as f:
        return yaml.safe_load(f)


def lower_own_priority():
    """他のアプリの操作を邪魔しないよう、監視エージェント自体のCPU/IO優先度を下げる。
    (プロセスを隠すためではなく、対象PCの操作感を優先するための一般的な手法)"""
    try:
        proc = psutil.Process()
        proc.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    except Exception:
        pass
    try:
        proc = psutil.Process()
        if hasattr(psutil, "IOPRIO_LOW"):
            proc.ionice(psutil.IOPRIO_LOW)
    except Exception:
        pass


def main():
    config = load_config()
    watch_cfg = config["watch"]
    log_cfg = config["logging"]

    lower_own_priority()

    log_dir = os.path.join(ROOT_DIR, log_cfg["log_dir"])
    max_days = log_cfg.get("max_days_local", 14)
    cleanup_old_logs(log_dir, max_days)

    logger = JsonlLogger(
        log_dir,
        flush_interval_sec=log_cfg.get("flush_interval_sec", 15),
        flush_batch_size=log_cfg.get("flush_batch_size", 50),
    )

    def on_event(event_type, data):
        logger.write(event_type, data)

    resource_monitor = ResourceMonitor(
        on_event,
        interval_sec=watch_cfg.get("interval_resource_sec", 120),
        disks=watch_cfg.get("disks", ["C:\\"]),
    )
    window_monitor = WindowMonitor(
        on_event,
        interval_sec=watch_cfg.get("interval_window_sec", 10),
    )
    file_watcher = FileWatcher(
        on_event,
        folders=watch_cfg["folders"],
        recursive=watch_cfg.get("recursive", True),
        ignore_patterns=watch_cfg.get("ignore_patterns", []),
    )
    system_events = SystemEventWatcher(on_event)

    resource_monitor.start()
    window_monitor.start()
    file_watcher.start()
    system_events.start()

    last_cleanup_day = time.strftime("%Y-%m-%d")
    try:
        while True:
            time.sleep(3600)
            today = time.strftime("%Y-%m-%d")
            if today != last_cleanup_day:
                cleanup_old_logs(log_dir, max_days)
                last_cleanup_day = today
    except KeyboardInterrupt:
        pass
    finally:
        resource_monitor.stop()
        window_monitor.stop()
        file_watcher.stop()
        logger.stop()


if __name__ == "__main__":
    main()
