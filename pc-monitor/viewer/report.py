"""同期されたログ(.jsonl)から、閲覧用のHTMLレポートを生成する。

監視対象PCではなく、確認する側のPC(NAS/クラウドから取得したログの手元コピー)で
実行することを想定している。
使い方: python viewer/report.py --logs <ログフォルダ> --out report.html --days 7
"""
import argparse
import collections
import datetime as dt
import glob
import json
import os


def load_events(log_dir, days=7):
    events = []
    cutoff = dt.date.today() - dt.timedelta(days=days)
    for path in sorted(glob.glob(os.path.join(log_dir, "*.jsonl"))):
        filename = os.path.basename(path)
        try:
            file_date = dt.date.fromisoformat(filename.replace(".jsonl", ""))
        except ValueError:
            continue
        if file_date < cutoff:
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return events


_SYSTEM_EVENT_TYPES = {
    "logon", "logoff", "lock", "unlock", "sleep", "resume", "resume_auto",
    "startup", "shutdown_or_logoff", "console_connect", "console_disconnect",
    "remote_connect", "remote_disconnect",
}


def summarize(events):
    app_duration = collections.Counter()
    system_events = []
    file_events = []
    resource_samples = []

    for event in events:
        etype = event.get("type")
        if etype == "window":
            key = event.get("process") or event.get("title") or "unknown"
            app_duration[key] += event.get("duration_sec", 0)
        elif etype in _SYSTEM_EVENT_TYPES:
            system_events.append(event)
        elif etype == "file":
            file_events.append(event)
        elif etype == "resource":
            resource_samples.append(event)

    return app_duration, system_events, file_events, resource_samples


def _esc(value):
    return (str(value)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def render_html(app_duration, system_events, file_events, resource_samples, days):
    app_rows = "".join(
        f"<tr><td>{_esc(name)}</td><td>{duration / 60:.1f} 分</td></tr>"
        for name, duration in app_duration.most_common(30)
    )

    system_rows = "".join(
        f"<tr><td>{_esc(e.get('ts'))}</td><td>{_esc(e.get('type'))}</td></tr>"
        for e in sorted(system_events, key=lambda e: e.get("ts", ""), reverse=True)[:200]
    )

    file_rows = "".join(
        f"<tr><td>{_esc(e.get('ts'))}</td><td>{_esc(e.get('action'))}</td><td>{_esc(e.get('path'))}</td></tr>"
        for e in sorted(file_events, key=lambda e: e.get("ts", ""), reverse=True)[:500]
    )

    if resource_samples:
        avg_cpu = sum(e.get("cpu_percent", 0) for e in resource_samples) / len(resource_samples)
        avg_mem = sum(e.get("memory_percent", 0) for e in resource_samples) / len(resource_samples)
        max_cpu = max(e.get("cpu_percent", 0) for e in resource_samples)
        max_mem = max(e.get("memory_percent", 0) for e in resource_samples)
    else:
        avg_cpu = avg_mem = max_cpu = max_mem = 0

    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>PC操作ログレポート</title>
<style>
  body {{ font-family: sans-serif; margin: 2rem; background: #f7f7f8; color: #222; }}
  h1 {{ font-size: 1.4rem; }}
  h2 {{ font-size: 1.1rem; margin-top: 2rem; border-bottom: 2px solid #ddd; padding-bottom: .25rem; }}
  table {{ border-collapse: collapse; width: 100%; margin-top: .5rem; background: #fff; }}
  th, td {{ border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; font-size: .85rem; }}
  th {{ background: #eee; }}
  .stats {{ display: flex; gap: 1rem; flex-wrap: wrap; }}
  .stat-box {{ background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1rem; min-width: 140px; }}
  .stat-box .value {{ font-size: 1.4rem; font-weight: bold; }}
</style>
</head>
<body>
<h1>PC操作ログレポート(直近{days}日)</h1>
<p>生成日時: {dt.datetime.now().isoformat(timespec='seconds')}</p>

<h2>リソース状況</h2>
<div class="stats">
  <div class="stat-box"><div>平均CPU</div><div class="value">{avg_cpu:.1f}%</div></div>
  <div class="stat-box"><div>最大CPU</div><div class="value">{max_cpu:.1f}%</div></div>
  <div class="stat-box"><div>平均メモリ</div><div class="value">{avg_mem:.1f}%</div></div>
  <div class="stat-box"><div>最大メモリ</div><div class="value">{max_mem:.1f}%</div></div>
</div>

<h2>アプリ利用時間(上位30)</h2>
<table><tr><th>アプリ/プロセス</th><th>合計利用時間</th></tr>{app_rows}</table>

<h2>システムイベント(直近200件)</h2>
<table><tr><th>日時</th><th>種別</th></tr>{system_rows}</table>

<h2>ファイル操作履歴(直近500件)</h2>
<table><tr><th>日時</th><th>操作</th><th>パス</th></tr>{file_rows}</table>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser(description="PC監視ログからHTMLレポートを生成します")
    parser.add_argument("--logs", required=True, help="ログファイル(.jsonl)が入ったフォルダ")
    parser.add_argument("--out", default="report.html", help="出力するHTMLファイルのパス")
    parser.add_argument("--days", type=int, default=7, help="集計対象の日数")
    args = parser.parse_args()

    events = load_events(args.logs, days=args.days)
    app_duration, system_events, file_events, resource_samples = summarize(events)
    html = render_html(app_duration, system_events, file_events, resource_samples, args.days)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"レポートを生成しました: {args.out}")


if __name__ == "__main__":
    main()
