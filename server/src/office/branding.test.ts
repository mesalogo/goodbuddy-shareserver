// @vitest-environment node
import { expect, it } from 'vitest'
import { officeCustomization } from './branding.js'
import { createOfficeService, officeSettings } from './service.js'
import { createApp } from '../app.js'

it('uses local GoodBuddy branding and suppresses LAN-unneeded UI without disabling the GB plugin', () => {
  const config = officeCustomization('http://192.168.0.23:8088')
  expect(config).toMatchObject({ forcesave: true, feedback: false, help: false, suggestFeature: false, ai: { disabled: true }, logo: { url: '', visible: true } })
  expect(config.logo.image).toBe('http://192.168.0.23:8088/api/v1/office/branding/logo-light.svg')
  expect(config).not.toHaveProperty('plugins', false)
  expect(config).not.toHaveProperty('about')
  expect(config).not.toHaveProperty('loaderName')
  expect(officeCustomization('http://192.168.0.23:8088', true)).toMatchObject({ about: false, loaderName: 'GoodBuddy', layout: { toolbar: { plugins: false } } })
})

it('serves local logo assets across the Docs port and rejects unknown filenames', async () => {
  const service = createOfficeService(officeSettings())
  const svg = await service.routes.request('http://share/api/v1/office/branding/logo-light.svg')
  expect(svg.status).toBe(200)
  expect(svg.headers.get('content-type')).toContain('image/svg+xml')
  expect(svg.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
  expect(await svg.text()).toContain('GoodBuddy')
  expect((await service.routes.request('http://share/api/v1/office/branding/not-a-logo.png')).status).toBe(404)
  const throughApp = await createApp().request('/api/v1/office/branding/icon-light.png')
  expect(throughApp.status).toBe(200)
  expect(throughApp.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
})

it('opts into the custom Community UI with local loader assets and accessible About', () => {
  const base = 'http://192.168.0.23:18088'
  expect(officeCustomization(base, false, true)).toMatchObject({
    goodbuddyUi: true,
    about: true,
    loaderName: 'GoodBuddy · Powered by ONLYOFFICE',
    loaderLogo: `${base}/api/v1/office/branding/icon-light.png`,
    layout: { toolbar: { plugins: false } }
  })
  expect(officeCustomization(base)).not.toHaveProperty('goodbuddyUi')
})
