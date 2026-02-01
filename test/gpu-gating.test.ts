/**
 * GPU Gating Contract Tests
 */

import { describe, it, expect } from 'vitest';
import {
  selectDevice,
  VRAM_THRESHOLDS,
  formatBytes,
  getCpuFallbackMessage,
  type GpuInfo,
} from '../src/runner/gpu-probe.js';

describe('VRAM Thresholds', () => {
  it('should define threshold for std-train as 8 GiB', () => {
    expect(VRAM_THRESHOLDS['std-train']).toBe(8 * 1024 * 1024 * 1024);
  });

  it('should define threshold for hq-train as 12 GiB', () => {
    expect(VRAM_THRESHOLDS['hq-train']).toBe(12 * 1024 * 1024 * 1024);
  });
});

describe('Device Selection', () => {
  const GiB = 1024 * 1024 * 1024;

  describe('std-train preset', () => {
    it('should select cuda when VRAM sufficient (>= 8 GiB)', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: true,
        total_vram: 16 * GiB,
        free_vram: 10 * GiB, // 10 GiB free >= 8 GiB threshold
        detection_method: 'torch',
        status: 'CUDA available',
      };

      const selection = selectDevice(gpuInfo, 'std-train');
      expect(selection.device).toBe('cuda');
      expect(selection.reason).toBe('sufficient_vram');
    });

    it('should select cpu when VRAM insufficient (< 8 GiB)', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: true,
        total_vram: 16 * GiB,
        free_vram: 6 * GiB, // 6 GiB free < 8 GiB threshold
        detection_method: 'torch',
        status: 'CUDA available',
      };

      const selection = selectDevice(gpuInfo, 'std-train');
      expect(selection.device).toBe('cpu');
      expect(selection.reason).toBe('insufficient_vram');
    });
  });

  describe('hq-train preset', () => {
    it('should select cuda when VRAM sufficient (>= 12 GiB)', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: true,
        total_vram: 16 * GiB,
        free_vram: 14 * GiB, // 14 GiB free >= 12 GiB threshold
        detection_method: 'torch',
        status: 'CUDA available',
      };

      const selection = selectDevice(gpuInfo, 'hq-train');
      expect(selection.device).toBe('cuda');
      expect(selection.reason).toBe('sufficient_vram');
    });

    it('should select cpu when VRAM insufficient (< 12 GiB)', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: true,
        total_vram: 16 * GiB,
        free_vram: 10 * GiB, // 10 GiB free < 12 GiB threshold
        detection_method: 'torch',
        status: 'CUDA available',
      };

      const selection = selectDevice(gpuInfo, 'hq-train');
      expect(selection.device).toBe('cpu');
      expect(selection.reason).toBe('insufficient_vram');
    });
  });

  describe('GPU not available', () => {
    it('should select cpu when CUDA not available', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: false,
        total_vram: 0,
        free_vram: 0,
        detection_method: 'torch',
        status: 'CUDA not available',
      };

      const selection = selectDevice(gpuInfo, 'std-train');
      expect(selection.device).toBe('cpu');
      expect(selection.reason).toBe('no_cuda');
    });

    it('should select cpu when GPU unknown', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: false,
        total_vram: 0,
        free_vram: 0,
        detection_method: 'none',
        status: 'GPU could not be detected',
      };

      const selection = selectDevice(gpuInfo, 'std-train');
      expect(selection.device).toBe('cpu');
      expect(selection.reason).toBe('gpu_unknown');
    });
  });

  describe('Edge cases', () => {
    it('should select cuda when VRAM exactly at threshold', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: true,
        total_vram: 16 * GiB,
        free_vram: 8 * GiB, // Exactly 8 GiB = threshold
        detection_method: 'torch',
        status: 'CUDA available',
      };

      const selection = selectDevice(gpuInfo, 'std-train');
      expect(selection.device).toBe('cuda');
      expect(selection.reason).toBe('sufficient_vram');
    });

    it('should select cpu when VRAM just below threshold', () => {
      const gpuInfo: GpuInfo = {
        cuda_available: true,
        total_vram: 16 * GiB,
        free_vram: 8 * GiB - 1, // 1 byte below threshold
        detection_method: 'torch',
        status: 'CUDA available',
      };

      const selection = selectDevice(gpuInfo, 'std-train');
      expect(selection.device).toBe('cpu');
      expect(selection.reason).toBe('insufficient_vram');
    });
  });
});

describe('CPU Fallback Messages', () => {
  const GiB = 1024 * 1024 * 1024;

  it('should explain insufficient VRAM', () => {
    const selection = selectDevice({
      cuda_available: true,
      total_vram: 8 * GiB,
      free_vram: 4 * GiB,
      detection_method: 'torch',
      status: '',
    }, 'std-train');

    const msg = getCpuFallbackMessage(selection, 'std-train');
    expect(msg).toContain('insufficient');
    expect(msg).toContain('CPU');
  });

  it('should explain GPU unknown', () => {
    const selection = selectDevice({
      cuda_available: false,
      total_vram: 0,
      free_vram: 0,
      detection_method: 'none',
      status: '',
    }, 'std-train');

    const msg = getCpuFallbackMessage(selection, 'std-train');
    expect(msg).toContain('could not be detected');
    expect(msg).toContain('CPU');
  });

  it('should explain no CUDA', () => {
    const selection = selectDevice({
      cuda_available: false,
      total_vram: 0,
      free_vram: 0,
      detection_method: 'torch',
      status: '',
    }, 'std-train');

    const msg = getCpuFallbackMessage(selection, 'std-train');
    expect(msg).toContain('CUDA not available');
    expect(msg).toContain('CPU');
  });
});

describe('Byte Formatting', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatBytes(8 * 1024 * 1024 * 1024)).toBe('8.0 GB');
    expect(formatBytes(16 * 1024 * 1024 * 1024)).toBe('16.0 GB');
  });
});
