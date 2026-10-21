/** Isolated experiment inputs. Never consulted by production capture. */
export const CAMERA_QA_CASES = {
  minimum: ['--qa-mode=minimum'],
  baseline: ['--qa-mode=vga15'],
  low5: ['--qa-mode=low5'],
  low15: ['--qa-mode=low15'],
  vga5: ['--qa-mode=vga5'],
  mjpeg720: ['--qa-mode=mjpeg720'],
  mjpeg720_size: ['--qa-mode=mjpeg720', '--qa-output-size'],
  mjpeg720_hd: ['--qa-mode=mjpeg720', '--qa-output-size', '--qa-hd-preset'],
  mjpeg720_post: ['--qa-mode=mjpeg720', '--qa-output-size', '--qa-hd-preset', '--qa-configure-after-start'],
  mjpeg7205: ['--qa-mode=mjpeg7205', '--qa-output-size'],
  nv12720: ['--qa-mode=nv12720'],
  mjpeg1080: ['--qa-mode=mjpeg1080'],
  mjpeg10805: ['--qa-mode=mjpeg10805'],
  yuy210805: ['--qa-mode=yuy210805'],
  yuy2720: ['--qa-mode=yuy2720'],
  low5_default: ['--qa-mode=low5', '--qa-default-preset'],
  mjpeg720_default: ['--qa-mode=mjpeg720', '--qa-default-preset'],
  low5_native: ['--qa-mode=low5', '--qa-native-output'],
  low_api1: ['--qa-mode=low5', '--qa-rate=1'],
  low_api2: ['--qa-mode=low5', '--qa-rate=2'],
  low_api5: ['--qa-mode=low5', '--qa-rate=5'],
  vga_api1: ['--qa-mode=vga5', '--qa-rate=1'],
  vga_api2: ['--qa-mode=vga5', '--qa-rate=2'],
  vga_api5: ['--qa-mode=vga5', '--qa-rate=5'],
  mjpeg1080_api1: ['--qa-mode=mjpeg10805', '--qa-rate=1'],
  mjpeg1080_api2: ['--qa-mode=mjpeg10805', '--qa-rate=2'],
  mjpeg1080_api5: ['--qa-mode=mjpeg10805', '--qa-rate=5'],
} as const
export type CameraQaCase = keyof typeof CAMERA_QA_CASES
export function isCameraQaCase(value: unknown): value is CameraQaCase {
  return typeof value === 'string' && Object.hasOwn(CAMERA_QA_CASES, value)
}
