"""指定フォルダのファイル作成・変更・削除・移動を記録する。

OSのファイル変更通知(ReadDirectoryChangesW)をwatchdog経由で使うため、
定期的にフォルダをスキャンするようなポーリング負荷はかからない。
"""
import fnmatch
import os

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


class _Handler(FileSystemEventHandler):
    def __init__(self, on_event, ignore_patterns):
        self._on_event = on_event
        self._ignore_patterns = ignore_patterns

    def _ignored(self, path):
        name = os.path.basename(path)
        return any(fnmatch.fnmatch(name, pattern) for pattern in self._ignore_patterns)

    def on_created(self, event):
        if not event.is_directory and not self._ignored(event.src_path):
            self._on_event("file", {"action": "created", "path": event.src_path})

    def on_modified(self, event):
        if not event.is_directory and not self._ignored(event.src_path):
            self._on_event("file", {"action": "modified", "path": event.src_path})

    def on_deleted(self, event):
        if not self._ignored(event.src_path):
            self._on_event("file", {
                "action": "deleted",
                "path": event.src_path,
                "is_directory": event.is_directory,
            })

    def on_moved(self, event):
        if not self._ignored(event.src_path):
            self._on_event("file", {
                "action": "moved",
                "path": event.src_path,
                "dest_path": event.dest_path,
            })


class FileWatcher:
    def __init__(self, on_event, folders, recursive=True, ignore_patterns=None):
        self._observer = Observer()
        handler = _Handler(on_event, ignore_patterns or [])
        for folder in folders:
            expanded = os.path.expandvars(folder)
            if os.path.isdir(expanded):
                self._observer.schedule(handler, expanded, recursive=recursive)

    def start(self):
        self._observer.start()

    def stop(self):
        self._observer.stop()
        self._observer.join(timeout=5)
