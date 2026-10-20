"""Windows cleanup compatibility for gltest's temporary contract files."""

import atexit
import os
import tempfile

import pytest


_original_unlink = os.unlink
_deferred = set()


def _windows_safe_unlink(path, *args, **kwargs):
    try:
        return _original_unlink(path, *args, **kwargs)
    except PermissionError:
        name = os.path.basename(os.fspath(path))
        is_gltest_temp = (
            os.name == "nt"
            and name.startswith("tmp")
            and os.path.dirname(os.path.abspath(path)) == tempfile.gettempdir()
        )
        if not is_gltest_temp:
            raise
        _deferred.add(path)


@atexit.register
def _cleanup_deferred():
    for path in _deferred:
        try:
            _original_unlink(path)
        except (PermissionError, FileNotFoundError):
            pass


@pytest.fixture(autouse=True)
def windows_gltest_unlink(monkeypatch):
    if os.name == "nt":
        monkeypatch.setattr(os, "unlink", _windows_safe_unlink)
