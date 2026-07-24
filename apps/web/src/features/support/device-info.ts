export type DeviceInfo = {
  browser: string;
  operatingSystem: string;
  viewport: string;
  userAgent: string;
};

export function getDeviceInfo(): DeviceInfo {
  const userAgent = navigator.userAgent;
  return {
    browser: browserName(userAgent),
    operatingSystem: operatingSystem(userAgent),
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    userAgent,
  };
}

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return version(userAgent, /Edg\/([\d.]+)/, 'Microsoft Edge');
  if (/CriOS\//.test(userAgent)) return version(userAgent, /CriOS\/([\d.]+)/, 'Google Chrome');
  if (/Chrome\//.test(userAgent)) return version(userAgent, /Chrome\/([\d.]+)/, 'Google Chrome');
  if (/FxiOS\//.test(userAgent)) return version(userAgent, /FxiOS\/([\d.]+)/, 'Firefox');
  if (/Firefox\//.test(userAgent)) return version(userAgent, /Firefox\/([\d.]+)/, 'Firefox');
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return version(userAgent, /Version\/([\d.]+)/, 'Safari');
  return '不明なブラウザ';
}

function operatingSystem(userAgent: string) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return version(userAgent.replace(/_/g, '.'), /OS ([\d.]+)/, 'iOS / iPadOS');
  if (/Android/.test(userAgent)) return version(userAgent, /Android ([\d.]+)/, 'Android');
  if (/Windows NT/.test(userAgent)) return 'Windows';
  if (/Mac OS X/.test(userAgent)) return version(userAgent.replace(/_/g, '.'), /Mac OS X ([\d.]+)/, 'macOS');
  if (/Linux/.test(userAgent)) return 'Linux';
  return '不明なOS';
}

function version(value: string, pattern: RegExp, label: string) {
  const matched = value.match(pattern)?.[1];
  return matched ? `${label} ${matched}` : label;
}
