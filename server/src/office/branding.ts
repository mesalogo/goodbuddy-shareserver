export function officeCustomization(base: string, whiteLabel = false, customUi = false) {
  const asset = (name: string) => `${base}/api/v1/office/branding/${name}`
  return {
    forcesave: true,
    feedback: false,
    help: false,
    suggestFeature: false,
    anonymous: { request: false },
    features: { featuresTips: false },
    // Only the built-in ONLYOFFICE AI is disabled; GoodBuddy's plugin remains enabled.
    ai: { disabled: true },
    logo: { image: asset('logo-light.svg'), imageLight: asset('logo-light.svg'), imageDark: asset('logo-dark.svg'), url: '', visible: true },
    customer: { name: 'GoodBuddy', info: '局域网文档协作', www: base },
    ...(whiteLabel ? {
      about: false,
      loaderName: 'GoodBuddy',
      loaderLogo: asset('icon-light.png'),
      layout: { toolbar: { plugins: false } }
    } : {}),
    ...(customUi ? {
      goodbuddyUi: true,
      // Keep the engine's original legal/about information accessible.
      about: true,
      loaderName: 'GoodBuddy · Powered by ONLYOFFICE',
      loaderLogo: asset('icon-light.png'),
      layout: { toolbar: { plugins: false } }
    } : {})
  }
}

export function officeLogo(icon: Uint8Array, dark: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24" viewBox="0 0 120 24"><image width="24" height="24" href="data:image/png;base64,${Buffer.from(icon).toString('base64')}"/><text x="29" y="17" font-family="Arial,sans-serif" font-size="15" font-weight="600" fill="${dark ? '#f8fafc' : '#1e293b'}">GoodBuddy</text></svg>`
}
