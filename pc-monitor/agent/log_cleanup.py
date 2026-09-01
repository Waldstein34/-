"""古いログファイルを自動削除し、ディスク圧迫を防ぐ。"""
import datetime as dt
import glob
import os


def cleanup_old_logs(log_dir, max_days):
    cutoff = dt.date.today() - dt.timedelta(days=max_days)
    for path in glob.glob(os.path.join(log_dir, "*.jsonl")):
        filename = os.path.basename(path)
        try:
            file_date = dt.date.fromisoformat(filename.replace(".jsonl", ""))
        except ValueError:
            continue
        if file_date < cutoff:
            try:
                os.remove(path)
            except OSError:
                pass
