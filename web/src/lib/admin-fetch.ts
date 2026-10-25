export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  if (response.status === 401) window.dispatchEvent(new Event('shareserver-login-required'))
  return response
}
