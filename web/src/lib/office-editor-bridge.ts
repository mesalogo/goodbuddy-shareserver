type Selection = { text: string; epoch: number }
declare global {
  interface Window {
    goodbuddyOffice?: {
      selection(): Promise<Selection>
      replace(selection: Selection, text: string): Promise<boolean>
    }
  }
}

export function installOfficeEditorBridge(): () => void {
  let plugin: Window | null = null
  let sequence = 0
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  const receive = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source === window || !event.source) return
    if (event.data?.type === 'gb-office-ready') { plugin = event.source as Window; return }
    if (event.source !== plugin || event.data?.type !== 'gb-office-result') return
    const item = pending.get(event.data.id)
    if (!item) return
    pending.delete(event.data.id); clearTimeout(item.timer)
    if (event.data.error) item.reject(new Error(event.data.error))
    else item.resolve(event.data.result)
  }
  window.addEventListener('message', receive)
  const send = (action: string, fields = {}): Promise<unknown> => new Promise((resolve, reject) => {
    if (!plugin) { reject(new Error('选区插件尚未就绪，请等待编辑器加载')); return }
    const id = String(++sequence)
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('选区操作超时')) }, 10000)
    pending.set(id, { resolve, reject, timer })
    plugin.postMessage({type: 'gb-office-command', id, action, ...fields}, location.origin)
  })
  window.goodbuddyOffice = {
    selection: () => send('selection') as Promise<Selection>,
    replace: (selection, text) => send('replace', { selection, text }) as Promise<boolean>
  }
  return () => {
    window.removeEventListener('message', receive)
    delete window.goodbuddyOffice
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('编辑器已关闭')) }
    pending.clear()
  }
}
