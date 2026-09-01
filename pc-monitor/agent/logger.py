"""イベントログの書き込み。

負荷軽減のため、イベントが起きるたびにファイルをopen/closeするのではなく、
メモリ上にためておいて一定間隔・一定件数ごとにまとめて書き込む(バッファリング)。
古いHDD搭載機でも、ディスクへの細かいアクセスを減らせる。
"""
import datetime as dt
import json
import os
import threading


class JsonlLogger:
    def __init__(self, log_dir, flush_interval_sec=15, flush_batch_size=50):
        self._log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self._flush_interval = flush_interval_sec
        self._flush_batch_size = flush_batch_size
        self._buffer = []
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="logger-flush", daemon=True)
        self._thread.start()

    def write(self, event_type, data):
        record = {
            "ts": dt.datetime.now().isoformat(timespec="seconds"),
            "type": event_type,
            **data,
        }
        with self._lock:
            self._buffer.append(record)
            should_flush = len(self._buffer) >= self._flush_batch_size
        if should_flush:
            self.flush()

    def flush(self):
        with self._lock:
            if not self._buffer:
                return
            pending, self._buffer = self._buffer, []

        by_date = {}
        for record in pending:
            date = record["ts"][:10]
            by_date.setdefault(date, []).append(record)

        for date, records in by_date.items():
            path = os.path.join(self._log_dir, f"{date}.jsonl")
            lines = "\n".join(json.dumps(r, ensure_ascii=False) for r in records)
            with open(path, "a", encoding="utf-8") as f:
                f.write(lines + "\n")

    def _run(self):
        while not self._stop.wait(self._flush_interval):
            self.flush()
        self.flush()

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=5)
        self.flush()
