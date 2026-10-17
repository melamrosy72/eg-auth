import 'sonner' // injects its CSS as a <style> element on import
import { expect, test } from 'vitest'
import nginxConf from '../nginx.conf?raw'

// Nginx's CSP allows exactly this <style> by hash; a sonner upgrade changes it.
test('nginx CSP allows the <style> that sonner injects', async () => {
  const css = document.querySelector('style')?.textContent ?? ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(css))
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
  expect(css).toContain('[data-sonner-toaster]')
  expect(nginxConf).toContain(`style-src 'self' 'sha256-${hash}'`)
})
