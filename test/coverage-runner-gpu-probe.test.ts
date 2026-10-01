/**
 * GPU probe: what `detectGpu` returns for each torch / nvidia-smi output shape.
 *
 * `node:child_process.spawn` is replaced with a scripted fake: each call to
 * `spawn` consumes the next script from a queue and plays it against a fake
 * ChildProcess (stdout emitter + close / error events). The tests assert on the
 * arguments the probe passes to the process and on the GpuInfo it derives from
 * each output shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

interface Script {
  /** stdout text emitted before close */
  stdout?: string;
  /** exit code (default 0) */
  code?: number;
  /** emit an 'error' event instead of closing (e.g. ENOENT) */
  error?: Error;
  /** never close; the probe's own timer has to give up */
  hang?: boolean;
}

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

const { spawnMock, queue } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  queue: [] as unknown[],
}));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import {
  detectGpu,
  selectDevice,
  formatBytes,
  getCpuFallbackMessage,
  VRAM_THRESHOLDS,
  type GpuInfo,
} from '../src/runner/gpu-probe.js';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

function installScripts(): void {
  spawnMock.mockImplementation(() => {
    const script = queue.shift() as Script | undefined;
    if (!script) throw new Error('unexpected spawn: no script queued');
    const proc = new EventEmitter() as FakeProc;
    proc.stdout = new EventEmitter();
    proc.kill = vi.fn();
    if (!script.hang) {
      queueMicrotask(() => {
        if (script.error) {
          proc.emit('error', script.error);
          return;
        }
        if (script.stdout !== undefined) proc.stdout.emit('data', Buffer.from(script.stdout));
        proc.emit('close', script.code ?? 0);
      });
    }
    return proc;
  });
}

function torchJson(obj: Record<string, unknown>): Script {
  return { stdout: JSON.stringify(obj) + '\n' };
}


beforeEach(() => {
  queue.length = 0;
  spawnMock.mockReset();
  installScripts();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('detectGpu: torch probe', () => {
  it('returns torch-reported VRAM and spawns python with -c, no shell, utf-8 env', async () => {
    queue.push(
      torchJson({
        cuda_available: true,
        total_vram: 24 * GiB,
        free_vram: 20 * GiB,
        detection_method: 'torch',
        status: 'CUDA available: 20GB free / 24GB total',
      })
    );

    const info = await detectGpu('python-under-test');

    expect(info).toEqual({
      cuda_available: true,
      total_vram: 24 * GiB,
      free_vram: 20 * GiB,
      detection_method: 'torch',
      status: 'CUDA available: 20GB free / 24GB total',
    });
    // torch answered, so nvidia-smi must never be consulted
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('python-under-test');
    expect(args[0]).toBe('-c');
    expect(args[1]).toContain('torch.cuda.mem_get_info');
    expect(opts.shell).toBe(false);
    // stderr is dropped at the OS level so import warnings cannot corrupt the JSON
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'ignore']);
    expect(opts.env.PYTHONIOENCODING).toBe('utf-8');
    expect(opts.env.PYTHONUNBUFFERED).toBe('1');
  });

  it('accepts torch output split across several stdout chunks', async () => {
    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as FakeProc;
      proc.stdout = new EventEmitter();
      proc.kill = vi.fn();
      queueMicrotask(() => {
        const json = JSON.stringify({
          cuda_available: true,
          total_vram: 8 * GiB,
          free_vram: 7 * GiB,
          detection_method: 'torch',
          status: 'ok',
        });
        proc.stdout.emit('data', Buffer.from(json.slice(0, 20)));
        proc.stdout.emit('data', Buffer.from(json.slice(20) + '\n'));
        proc.emit('close', 0);
      });
      return proc;
    });

    const info = await detectGpu('python');

    expect(info.detection_method).toBe('torch');
    expect(info.free_vram).toBe(7 * GiB);
  });

  it('trusts a torch "no GPU" answer and does not fall through to nvidia-smi', async () => {
    queue.push(
      torchJson({
        cuda_available: false,
        total_vram: 0,
        free_vram: 0,
        detection_method: 'torch',
        status: 'CUDA not available (torch installed but no GPU)',
      })
    );

    const info = await detectGpu('python');

    expect(info.cuda_available).toBe(false);
    expect(info.detection_method).toBe('torch');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['torch not installed (error key)', torchJson({ error: 'torch_not_installed' })],
    ['an exception message (error key)', torchJson({ error: 'CUDA driver version is insufficient' })],
    ['malformed JSON', { stdout: 'Traceback (most recent call last):\n' }],
    ['empty stdout', { stdout: '' }],
    ['a non-zero exit code', { stdout: '{"cuda_available": true}', code: 1 }],
    ['a spawn error (python missing)', { error: new Error('spawn python ENOENT') }],
  ] as Array<[string, Script]>)('falls back to nvidia-smi on %s', async (_label, torchScript) => {
    queue.push(torchScript, { stdout: '10240, 12288\n' });

    const info = await detectGpu('python');

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[1][0]).toBe('nvidia-smi');
    expect(info.detection_method).toBe('nvidia-smi');
    expect(info.cuda_available).toBe(true);
  });

  it('kills a hung torch probe after 3s and falls back to nvidia-smi', async () => {
    vi.useFakeTimers();
    queue.push({ hang: true }, { stdout: '4096, 8192\n' });

    const pending = detectGpu('python');
    // Let the torch spawn happen, then run the 3s timer.
    await vi.advanceTimersByTimeAsync(2999);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const info = await pending;

    const torchProc = spawnMock.mock.results[0].value as FakeProc;
    expect(torchProc.kill).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][2].timeout).toBe(3000);
    expect(info.detection_method).toBe('nvidia-smi');
    expect(info.free_vram).toBe(4096 * MiB);
  });
});

describe('detectGpu: nvidia-smi probe', () => {
  const smiAfterTorchFailure = (smi: Script) => queue.push({ error: new Error('no python') }, smi);

  it('asks nvidia-smi for free,total memory in MiB with csv,noheader,nounits', async () => {
    smiAfterTorchFailure({ stdout: '10240, 12288\n' });

    await detectGpu('python');

    const [cmd, args, opts] = spawnMock.mock.calls[1];
    expect(cmd).toBe('nvidia-smi');
    expect(args).toEqual(['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits']);
    expect(opts.shell).toBe(false);
    expect(opts.timeout).toBe(3000);
  });

  it('converts MiB to bytes and reports whole-GiB status for a single GPU', async () => {
    smiAfterTorchFailure({ stdout: '10240, 12288\n' });

    const info = await detectGpu('python');

    expect(info).toEqual({
      cuda_available: true,
      total_vram: 12288 * MiB,
      free_vram: 10240 * MiB,
      detection_method: 'nvidia-smi',
      status: 'CUDA available (nvidia-smi): 10GB free / 12GB total',
    });
  });

  it('uses only the first line when several GPUs are listed', async () => {
    smiAfterTorchFailure({ stdout: '2048, 24576\n20480, 24576\n1024, 8192\n' });

    const info = await detectGpu('python');

    expect(info.free_vram).toBe(2048 * MiB);
    expect(info.total_vram).toBe(24576 * MiB);
  });

  it('copes with Windows CRLF line endings', async () => {
    smiAfterTorchFailure({ stdout: '6000, 8192\r\n7000, 8192\r\n' });

    const info = await detectGpu('python');

    expect(info.free_vram).toBe(6000 * MiB);
    expect(info.total_vram).toBe(8192 * MiB);
  });

  it('floors fractional GiB in the status text', async () => {
    smiAfterTorchFailure({ stdout: '1500, 2500\n' });

    const info = await detectGpu('python');

    expect(info.status).toBe('CUDA available (nvidia-smi): 1GB free / 2GB total');
  });

  it.each([
    ['non-numeric columns', { stdout: 'N/A, N/A\n' }],
    ['a single column', { stdout: '10240\n' }],
    ['one numeric and one garbage column', { stdout: '10240, [Not Supported]\n' }],
    ['empty output (driver present, no GPU rows)', { stdout: '' }],
    ['an error banner printed to stdout', { stdout: 'NVIDIA-SMI has failed because it could not communicate with the NVIDIA driver.\n' }],
    ['a non-zero exit code', { stdout: '10240, 12288\n', code: 9 }],
    ['nvidia-smi missing from PATH', { error: new Error('spawn nvidia-smi ENOENT') }],
  ] as Array<[string, Script]>)('reports GPU not detected for %s', async (_label, smi) => {
    smiAfterTorchFailure(smi);

    const info = await detectGpu('python');

    expect(info).toEqual({
      cuda_available: false,
      total_vram: 0,
      free_vram: 0,
      detection_method: 'none',
      status: 'GPU could not be detected',
    });
  });

  it('kills a hung nvidia-smi after 3s and reports GPU not detected', async () => {
    vi.useFakeTimers();
    queue.push({ error: new Error('no python') }, { hang: true });

    const pending = detectGpu('python');
    await vi.advanceTimersByTimeAsync(3000);
    const info = await pending;

    const smiProc = spawnMock.mock.results[1].value as FakeProc;
    expect(smiProc.kill).toHaveBeenCalledTimes(1);
    expect(info.detection_method).toBe('none');
    expect(info.cuda_available).toBe(false);
  });

  it('worst case (both probes hang) resolves in about 6s without throwing', async () => {
    vi.useFakeTimers();
    queue.push({ hang: true }, { hang: true });

    const pending = detectGpu('python');
    await vi.advanceTimersByTimeAsync(3000);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    const info = await pending;

    expect(info.status).toBe('GPU could not be detected');
  });
});

describe('selectDevice for each detection outcome', () => {
  const none: GpuInfo = {
    cuda_available: false,
    total_vram: 0,
    free_vram: 0,
    detection_method: 'none',
    status: 'GPU could not be detected',
  };

  it('maps an undetectable GPU to cpu / gpu_unknown', () => {
    const sel = selectDevice(none, 'std-train');
    expect(sel.device).toBe('cpu');
    expect(sel.reason).toBe('gpu_unknown');
    expect(sel.gpu_info).toBe(none);
  });

  it('maps a probed-but-no-CUDA machine to cpu / no_cuda for both detection methods', () => {
    for (const detection_method of ['torch', 'nvidia-smi'] as const) {
      const sel = selectDevice({ ...none, detection_method }, 'hq-train');
      expect(sel.device).toBe('cpu');
      expect(sel.reason).toBe('no_cuda');
    }
  });

  it('end to end: nvidia-smi free VRAM straddling the std-train threshold picks the right device', async () => {
    // 8192 MiB free == exactly the 8 GiB threshold -> cuda; one MiB less -> cpu
    queue.push({ error: new Error('x') }, { stdout: '8192, 12288\n' });
    const enough = selectDevice(await detectGpu('python'), 'std-train');
    expect(enough.device).toBe('cuda');
    expect(enough.reason).toBe('sufficient_vram');

    queue.push({ error: new Error('x') }, { stdout: '8191, 12288\n' });
    const short = selectDevice(await detectGpu('python'), 'std-train');
    expect(short.device).toBe('cpu');
    expect(short.reason).toBe('insufficient_vram');
  });

  it('end to end: 10 GiB free passes std-train but not hq-train', async () => {
    queue.push(torchJson({
      cuda_available: true, total_vram: 16 * GiB, free_vram: 10 * GiB,
      detection_method: 'torch', status: 'ok',
    }));
    const info = await detectGpu('python');
    expect(selectDevice(info, 'std-train').device).toBe('cuda');
    expect(selectDevice(info, 'hq-train').device).toBe('cpu');
    expect(VRAM_THRESHOLDS['hq-train']).toBe(12 * GiB);
  });
});

describe('CPU fallback messages', () => {
  const gpu = (over: Partial<GpuInfo>): GpuInfo => ({
    cuda_available: true,
    total_vram: 8 * GiB,
    free_vram: 6 * GiB,
    detection_method: 'nvidia-smi',
    status: '',
    ...over,
  });

  it('insufficient_vram names the preset, the free amount and the requirement', () => {
    const sel = selectDevice(gpu({ free_vram: 6 * GiB }), 'hq-train');
    expect(getCpuFallbackMessage(sel, 'hq-train')).toBe(
      'GPU VRAM insufficient for hq-train (6.0 GB free, 12.0 GB required). Training will run on CPU.'
    );
  });

  it('gpu_unknown says detection failed and why CPU is used', () => {
    const sel = selectDevice(gpu({ cuda_available: false, detection_method: 'none' }), 'std-train');
    expect(getCpuFallbackMessage(sel, 'std-train')).toBe(
      'GPU could not be detected. Training will run on CPU to prevent system instability.'
    );
  });

  it('no_cuda says CUDA is unavailable', () => {
    const sel = selectDevice(gpu({ cuda_available: false, detection_method: 'torch' }), 'std-train');
    expect(getCpuFallbackMessage(sel, 'std-train')).toBe('CUDA not available. Training will run on CPU.');
  });

  it('a reason with no specific copy (sufficient_vram) gets the generic line', () => {
    const sel = selectDevice(gpu({ free_vram: 16 * GiB }), 'std-train');
    expect(sel.reason).toBe('sufficient_vram');
    expect(getCpuFallbackMessage(sel, 'std-train')).toBe('Training will run on CPU.');
  });
});

describe('formatBytes', () => {
  it('formats zero, sub-KB, and each unit to one decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512.0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * MiB)).toBe('5.0 MB');
    expect(formatBytes(12 * GiB)).toBe('12.0 GB');
    expect(formatBytes(2 * 1024 * GiB)).toBe('2.0 TB');
  });
});
