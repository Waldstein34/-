"""ログフォルダをNAS等の同期先へ定期的にコピーする。

Windowsのタスクスケジューラから、config.yaml の upload.interval_min ごとに
python uploader.py として実行される想定。robocopyの/MIRは変更分だけを
転送するため、ネットワーク負荷も最小限に抑えられる。
"""
import datetime as dt
import os
import subprocess
import sys

import yaml

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_config():
    with open(os.path.join(ROOT_DIR, "config.yaml"), encoding="utf-8") as f:
        return yaml.safe_load(f)


def robocopy(src, dst, bandwidth_throttle_kb=0):
    args = ["robocopy", src, dst, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/R:2", "/W:5"]
    if bandwidth_throttle_kb:
        # /IPG はパケット間の待機時間(ミリ秒)。大まかな帯域制御として使う。
        args += ["/IPG:" + str(max(1, int(10000 / bandwidth_throttle_kb)))]
    result = subprocess.run(args, capture_output=True, text=True)
    # robocopyは0-7が正常終了(何かしらコピー/変更なしを含む)
    return result.returncode < 8, result.stdout + result.stderr


def custom_command(template, src, dst):
    command = template.format(src=src, dst=dst)
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    return result.returncode == 0, result.stdout + result.stderr


def main():
    config = load_config()
    upload_cfg = config["upload"]
    src = os.path.join(ROOT_DIR, config["logging"]["log_dir"])
    dst = os.path.expandvars(upload_cfg["destination"])

    if upload_cfg.get("method", "robocopy") == "robocopy":
        ok, output = robocopy(src, dst, upload_cfg.get("bandwidth_throttle_kb", 0))
    else:
        ok, output = custom_command(upload_cfg["command"], src, dst)

    log_line = f"[{dt.datetime.now().isoformat(timespec='seconds')}] ok={ok}\n{output}\n"
    with open(os.path.join(ROOT_DIR, "uploader.log"), "a", encoding="utf-8") as f:
        f.write(log_line)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
