// Fixed viewport presets for reproducible browser layout checks.
// Device dimensions represent CSS pixels; emulation is not a real LINE-app device.
const DEVICE_PRESETS = Object.freeze({
  desktop: { label: '桌面 1440 × 900', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  mobileSmall: { label: '小手機 360 × 800', viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  mobileStandard: { label: '手機 390 × 844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  mobileLarge: { label: '大手機 430 × 932', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
});

export function listDevices() {
  return Object.entries(DEVICE_PRESETS).map(([id, preset]) => ({ id, label: preset.label, ...preset }));
}

export function validateDevice(id = 'desktop') {
  if (typeof id !== 'string' || !Object.hasOwn(DEVICE_PRESETS,id)) {
    throw new Error('未知裝置設定；請使用 desktop、mobileSmall、mobileStandard、mobileLarge');
  }
  const x = DEVICE_PRESETS[id];
  return { id, label: x.label, viewport: { ...x.viewport }, isMobile: x.isMobile, hasTouch: x.hasTouch, deviceScaleFactor: x.deviceScaleFactor };
}

export function contextOptions(device) {
  const {viewport, isMobile, hasTouch, deviceScaleFactor} = validateDevice(device?.id || 'desktop');
  return { viewport, isMobile, hasTouch, deviceScaleFactor };
}
