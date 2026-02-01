/**
 * GPU Probe
 * Detects GPU availability and VRAM without allocating memory.
 * Uses 3 second timeout per probe method. Total detection time < 6 seconds worst case.
 * Never crashes - all errors handled gracefully.
 */

import { spawn } from 'node:child_process';

/** GPU detection result */
export interface GpuInfo {
  /** Whether CUDA is available */
  cuda_available: boolean;
  /** Total VRAM in bytes (0 if unknown) */
  total_vram: number;
  /** Free VRAM in bytes (0 if unknown) */
  free_vram: number;
  /** Detection method used */
  detection_method: 'torch' | 'nvidia-smi' | 'none';
  /** Human-readable status */
  status: string;
}

/** VRAM thresholds in bytes (locked for Phase 1) */
export const VRAM_THRESHOLDS = {
  'std-train': 8 * 1024 * 1024 * 1024,   // 8 GiB
  'hq-train': 12 * 1024 * 1024 * 1024,   // 12 GiB
} as const;

/** Device selection result */
export interface DeviceSelection {
  /** Selected device */
  device: 'cuda' | 'cpu';
  /** Reason for selection */
  reason: 'sufficient_vram' | 'insufficient_vram' | 'gpu_unknown' | 'no_cuda';
  /** GPU info used for decision */
  gpu_info: GpuInfo;
}

/**
 * Probe GPU using Python torch (fast, preferred)
 */
async function probeTorch(pythonPath: string, timeout: number = 3000): Promise<GpuInfo | null> {
  const script = `
import json
try:
    import torch
    if torch.cuda.is_available():
        free, total = torch.cuda.mem_get_info(0)
        print(json.dumps({
            "cuda_available": True,
            "total_vram": total,
            "free_vram": free,
            "detection_method": "torch",
            "status": f"CUDA available: {free // (1024**3)}GB free / {total // (1024**3)}GB total"
        }))
    else:
        print(json.dumps({
            "cuda_available": False,
            "total_vram": 0,
            "free_vram": 0,
            "detection_method": "torch",
            "status": "CUDA not available (torch installed but no GPU)"
        }))
except ImportError:
    print(json.dumps({"error": "torch_not_installed"}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['-c', script], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    proc.stdout?.on('data', (data) => { stdout += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(null);
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          resolve(null);
          return;
        }
        resolve(result as GpuInfo);
      } catch {
        resolve(null);
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Probe GPU using nvidia-smi (fallback)
 */
async function probeNvidiaSmi(timeout: number = 3000): Promise<GpuInfo | null> {
  return new Promise((resolve) => {
    // Query: free memory, total memory in MiB
    const proc = spawn('nvidia-smi', [
      '--query-gpu=memory.free,memory.total',
      '--format=csv,noheader,nounits'
    ], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    proc.stdout?.on('data', (data) => { stdout += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(null);
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        // Parse "free, total" in MiB
        const line = stdout.trim().split('\n')[0];
        const [freeStr, totalStr] = line.split(',').map(s => s.trim());
        const freeMiB = parseInt(freeStr, 10);
        const totalMiB = parseInt(totalStr, 10);

        if (isNaN(freeMiB) || isNaN(totalMiB)) {
          resolve(null);
          return;
        }

        const freeBytes = freeMiB * 1024 * 1024;
        const totalBytes = totalMiB * 1024 * 1024;

        resolve({
          cuda_available: true,
          total_vram: totalBytes,
          free_vram: freeBytes,
          detection_method: 'nvidia-smi',
          status: `CUDA available (nvidia-smi): ${Math.floor(freeMiB / 1024)}GB free / ${Math.floor(totalMiB / 1024)}GB total`,
        });
      } catch {
        resolve(null);
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Detect GPU capabilities (tries torch first, then nvidia-smi)
 * Uses 3s timeout per method. Total time < 6s worst case. Never crashes.
 */
export async function detectGpu(pythonPath: string): Promise<GpuInfo> {
  // Try torch first (preferred, most accurate)
  const torchResult = await probeTorch(pythonPath, 3000);
  if (torchResult) {
    return torchResult;
  }

  // Fallback to nvidia-smi
  const smiResult = await probeNvidiaSmi(3000);
  if (smiResult) {
    return smiResult;
  }

  // GPU unknown
  return {
    cuda_available: false,
    total_vram: 0,
    free_vram: 0,
    detection_method: 'none',
    status: 'GPU could not be detected',
  };
}

/**
 * Select device based on GPU info and preset requirements
 */
export function selectDevice(
  gpuInfo: GpuInfo,
  presetId: 'std-train' | 'hq-train'
): DeviceSelection {
  const threshold = VRAM_THRESHOLDS[presetId];

  // No CUDA available
  if (!gpuInfo.cuda_available) {
    return {
      device: 'cpu',
      reason: gpuInfo.detection_method === 'none' ? 'gpu_unknown' : 'no_cuda',
      gpu_info: gpuInfo,
    };
  }

  // Check free VRAM against threshold
  if (gpuInfo.free_vram >= threshold) {
    return {
      device: 'cuda',
      reason: 'sufficient_vram',
      gpu_info: gpuInfo,
    };
  }

  // Insufficient VRAM - fallback to CPU
  return {
    device: 'cpu',
    reason: 'insufficient_vram',
    gpu_info: gpuInfo,
  };
}

/**
 * Format bytes as human-readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get user-friendly message for CPU fallback
 */
export function getCpuFallbackMessage(selection: DeviceSelection, presetId: string): string {
  const threshold = VRAM_THRESHOLDS[presetId as keyof typeof VRAM_THRESHOLDS];
  const thresholdStr = formatBytes(threshold);

  switch (selection.reason) {
    case 'insufficient_vram':
      const freeStr = formatBytes(selection.gpu_info.free_vram);
      return `GPU VRAM insufficient for ${presetId} (${freeStr} free, ${thresholdStr} required). Training will run on CPU.`;
    case 'gpu_unknown':
      return `GPU could not be detected. Training will run on CPU to prevent system instability.`;
    case 'no_cuda':
      return `CUDA not available. Training will run on CPU.`;
    default:
      return `Training will run on CPU.`;
  }
}
