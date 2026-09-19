#!/usr/bin/env python3
"""One WebGL page at a time on this machine, across every worktree and agent.

    from gpu_slot import gpu_slot
    with gpu_slot('shot.py GRAFT-combat'):
        ...launch Chromium, capture, close...

    python tools/gpu_slot.py            # who holds the GPU right now

WHY THIS EXISTS
---------------
The UI pass runs three builders at once, each photographing the game's WebGL
room, on a 16 GB laptop whose captures render on an Intel UHD iGPU. Measured on
2026-09-18: one capture holds ~1.5 GB of the iGPU's SHARED memory -- which on
an integrated GPU is system RAM -- on top of ~0.9 GB for the browser, and the
machine had 4.7 GB free with nothing capturing. Two captures at once use all of
it; three page. That is the likeliest reading of the "degradation" every round
since 8 has hit (warm-ups crawling past their timeout, then contexts that
cannot be created at all, then recovery after a rest), and it arrived with the
rounds that grew the backdrop shader.

And the perf budget asks for a QUIET window -- three `gpuprof.py` runs with
nothing else on the GPU -- which no builder has ever had while two others were
capturing beside it.

So every instrument that renders the room takes a slot first. With one slot,
captures queue instead of competing, and a gpuprof run is quiet by
construction. The wait is printed, so a slow capture says why it was slow.

MM_GPU_SLOTS=N allows N at once (default 1); MM_GPU_SLOTS=0 turns it off.

The lock is an OS byte-range lock on a file in the temp directory, so every
worktree and every agent on the machine shares it, and a process that dies
releases it -- there is never a stale lock to clean up.
"""
import contextlib
import os
import sys
import tempfile
import time

DIR = tempfile.gettempdir()


def _path(i):
    return os.path.join(DIR, f'mm-gpu-slot-{i}.lock')


def _try_lock(fh):
    fh.seek(0)
    if os.name == 'nt':
        import msvcrt
        try:
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False
    import fcntl
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def _unlock(fh):
    fh.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass


def slots():
    try:
        return max(0, int(os.environ.get('MM_GPU_SLOTS', '1')))
    except ValueError:
        return 1


@contextlib.contextmanager
def gpu_slot(label='', max_wait=5400):
    """Hold one of MM_GPU_SLOTS slots for the body. Yields seconds waited."""
    n = slots()
    if n == 0:
        yield 0.0
        return
    t0 = time.time()
    held, said = None, False
    while held is None:
        for i in range(n):
            fh = open(_path(i), 'a+b')
            if _try_lock(fh):
                held = (i, fh)
                break
            fh.close()
        if held is not None:
            break
        if not said:
            print(f'gpu_slot: waiting for the GPU ({label}; held by {holder()})', flush=True)
            said = True
        if time.time() - t0 > max_wait:
            print(f'gpu_slot: waited {max_wait}s, going ahead WITHOUT the slot', file=sys.stderr)
            break
        # 0.1 s, not 1.5: a builder chaining capture after capture starts its
        # next process ~0.5 s after the last one releases, and at 1.5 s a
        # waiter lost that race over and over (round 12's ORMOLU, whose toast
        # re-shoots kept losing to round 11's chained batches). A one-byte
        # lock attempt ten times a second costs nothing.
        time.sleep(0.1)
    waited = time.time() - t0
    if said:
        print(f'gpu_slot: got the GPU after {waited:.0f}s', flush=True)
    try:
        if held is not None:
            try:
                with open(_path(held[0]) + '.who', 'w', encoding='utf-8') as w:
                    w.write(f'pid {os.getpid()} since {time.strftime("%H:%M:%S")}: {label}\n')
            except OSError:
                pass
        yield waited
    finally:
        if held is not None:
            _unlock(held[1])
            held[1].close()


def holder():
    """Who holds the slots, as far as the .who notes say (informational only)."""
    out = []
    for i in range(max(slots(), 1)):
        try:
            with open(_path(i) + '.who', encoding='utf-8') as f:
                out.append(f.read().strip())
        except OSError:
            pass
    return '; '.join(out) or 'unknown'


if __name__ == '__main__':
    # `python tools/gpu_slot.py -- <command...>` runs a command while holding
    # the slot: a gate that launches its own browser, run while a round's
    # builders are capturing, would otherwise land in the middle of one of
    # their gpuprof runs.
    if '--' in sys.argv:
        import subprocess
        cmd = sys.argv[sys.argv.index('--') + 1:]
        with gpu_slot('run: ' + ' '.join(cmd)[:120]):
            sys.exit(subprocess.run(cmd).returncode)
    busy = []
    for i in range(max(slots(), 1)):
        fh = open(_path(i), 'a+b')
        if _try_lock(fh):
            _unlock(fh)
        else:
            busy.append(i)
        fh.close()
    print(f'{slots()} slot(s); busy: {busy or "none"}; last holders: {holder()}')
