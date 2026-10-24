"""Cancellable, bounded subprocess execution for the isolated worker."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
from typing import Callable


class StitchError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class LeaseLost(RuntimeError):
    """The job was cancelled, reclaimed, or the process is shutting down."""


REQUIRED_TOOLS = ("pto_gen", "cpfind", "cpclean", "autooptimiser", "pano_modify", "pano_trafo", "nona", "enblend")


def require_tools() -> None:
    missing = [name for name in REQUIRED_TOOLS if shutil.which(name) is None]
    if missing:
        raise StitchError("TOOL_FAILED", "Required stitching tools are unavailable: " + ", ".join(missing))


def stop_process(process: subprocess.Popen) -> None:
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            process.kill()
        process.wait(timeout=5)


class Runner:
    def __init__(self, check: Callable[[], None] = lambda: None, timeout_seconds: float = 900):
        self.check = check
        self.deadline = time.monotonic() + timeout_seconds

    def run(self, args: list[str], cwd: Path, *, stdin: str = "", timeout: float = 300) -> str:
        self.check()
        binary = shutil.which(args[0])
        if binary is None:
            raise StitchError("TOOL_FAILED", f"Required stitching tool is unavailable: {args[0]}")
        deadline = min(self.deadline, time.monotonic() + timeout)
        if deadline <= time.monotonic():
            raise StitchError("TIMEOUT", "Stitch attempt exceeded its time limit")
        # Files avoid pipe backpressure when native tools write large logs.
        with tempfile.TemporaryFile() as input_file, tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            input_file.write(stdin.encode())
            input_file.seek(0)
            options = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW}
                       if os.name == "nt" else {"start_new_session": True})
            env = {**os.environ, "OMP_NUM_THREADS": "2", "LC_ALL": "C"}
            try:
                process = subprocess.Popen([binary, *args[1:]], cwd=cwd, stdin=input_file,
                                           stdout=output, stderr=errors, env=env, **options)
            except OSError as exc:
                raise StitchError("TOOL_FAILED", f"Cannot start {args[0]}") from exc
            try:
                while process.poll() is None:
                    self.check()
                    if time.monotonic() >= deadline:
                        raise StitchError("TIMEOUT", f"{args[0]} exceeded its time limit")
                    if output.tell() + errors.tell() > 16 * 1024 * 1024:
                        raise StitchError("TOOL_FAILED", f"{args[0]} exceeded its log limit")
                    time.sleep(0.1)
                self.check()
                if process.returncode:
                    raise StitchError("TOOL_FAILED", f"{args[0]} exited with code {process.returncode}")
                output.seek(0)
                result = output.read(2 * 1024 * 1024 + 1)
                if len(result) > 2 * 1024 * 1024:
                    raise StitchError("TOOL_FAILED", f"{args[0]} output exceeded its limit")
                return result.decode("utf-8", errors="replace")
            finally:
                # Kill the process group even when the leader has exited, so
                # orphaned children cannot outlive cancellation or completion.
                stop_process(process)
