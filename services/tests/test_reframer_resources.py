import subprocess

from services.clipper.reframer import Reframer


def test_libx264_encoding_uses_resource_cap(monkeypatch):
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    Reframer("/bin/true").apply_mirror("in.mp4", "out.mp4")

    command = calls[0]
    assert command[command.index("-preset") + 1] == "veryfast"
    assert command[command.index("-threads") + 1] == "2"
    assert command[-1] == "out.mp4"
