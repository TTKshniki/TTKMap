from pathlib import Path
import sys
import time

import pytest

from backend.worker.processes import LeaseLost, Runner, StitchError, require_tools


def test_missing_native_tools_fail_explicitly(monkeypatch):
    monkeypatch.setattr("backend.worker.processes.shutil.which", lambda name: None)
    with pytest.raises(StitchError) as error:
        require_tools()
    assert error.value.code == "TOOL_FAILED"


def test_real_subprocess_timeout_terminates_child(tmp_path):
    before = time.monotonic()
    with pytest.raises(StitchError) as error:
        Runner(timeout_seconds=0.3).run([sys.executable, "-c", "import time;time.sleep(30)"], tmp_path)
    assert error.value.code == "TIMEOUT"
    assert time.monotonic() - before < 5


def test_real_subprocess_cancel_and_no_late_write(tmp_path):
    deadline = time.monotonic() + 0.3

    def check():
        if time.monotonic() >= deadline:
            raise LeaseLost()

    marker = tmp_path / "late.txt"
    with pytest.raises(LeaseLost):
        Runner(check).run([sys.executable, "-c", "import time,pathlib;time.sleep(1);pathlib.Path('late.txt').write_text('wrong')"], tmp_path)
    time.sleep(1)
    assert not marker.exists()


def test_nonzero_exit_is_failure_and_stdin_is_supported(tmp_path):
    runner = Runner()
    assert runner.run([sys.executable, "-c", "import sys; print(sys.stdin.read())"], tmp_path, stdin="hello").strip() == "hello"
    with pytest.raises(StitchError) as error:
        runner.run([sys.executable, "-c", "raise SystemExit(2)"], tmp_path)
    assert error.value.code == "TOOL_FAILED"
