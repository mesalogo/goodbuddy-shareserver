// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('checks actual range identity and content, not layout notifications or equal text alone', async () => {
  const html = await readFile(new URL('./plugin/index.html', import.meta.url), 'utf8')
  const script = { src: '', onload: () => {} }
  let receive!: (event: unknown) => Promise<void>
  let text = 'original text', start = 4, paragraph = 'paragraph-1'
  const replies: { result?: { text: string; epoch: number } | boolean; error?: string }[] = []
  const top = { postMessage: (message: typeof replies[number]) => replies.push(message) }
  const plugin = {
    init: () => {},
    info: { editorType: 'word' }, attachEvent: () => {}, attachContextMenuClickEvent: () => {},
    callCommand: (command: () => unknown, _close: boolean, _calc: boolean, callback: (value: unknown) => void) => callback(command()),
    executeMethod: (_name: string, args: string[], callback: () => void) => { text = args[0]; callback() }
  }
  const origin = 'http://192.168.0.23:8088'
  const Asc = { plugin, scope: {} }
  runInNewContext(html.split('<script>')[1].split('</script>')[0].replace('__DOCS_ORIGIN__', JSON.stringify('http://192.168.0.23:8080')), {
    Asc, window: { top, Asc, addEventListener: (_name: string, handler: typeof receive) => { receive = handler } },
    location: { origin }, document: { createElement: () => script, head: { appendChild: () => {} } },
    Api: { GetDocument: () => ({ GetRangeBySelect: () => ({ GetText: () => text, GetStartPos: () => start,
      GetEndPos: () => start + text.length, GetAllParagraphs: () => [{ GetInternalId: () => paragraph }] }) }) }
  })
  script.onload(); plugin.init()
  const send = async (action: string, fields = {}) => {
    await receive({ source: top, origin, data: { type: 'gb-office-command', id: '1', action, ...fields } })
    return replies.at(-1)!
  }
  const first = (await send('selection')).result
  expect((await send('replace', { selection: first, text: 'changed' })).result).toBe(true)
  text = 'same text'
  const second = (await send('selection')).result
  start++
  expect((await send('replace', { selection: second, text: 'wrong' })).error).toContain('原选区')
  start--; paragraph = 'paragraph-2'
  expect((await send('replace', { selection: second, text: 'wrong' })).error).toContain('原选区')
  paragraph = 'paragraph-1'; text = 'modified text'
  expect((await send('replace', { selection: second, text: 'wrong' })).error).toContain('原选区')
  expect(text).toBe('modified text')
})

it('protects spreadsheet formulas and range shape, allowing formula changes only when explicit', async () => {
  const html = await readFile(new URL('./plugin/index.html', import.meta.url), 'utf8')
  const script = { src: '', onload: () => {} }
  let receive!: (event: unknown) => Promise<void>
  let cells: (string | number)[][] = [['old', '=1+2']]
  let address = '$A$1:$B$1'
  let result: { result?: unknown; error?: string } = {}
  const top = { postMessage: (value: typeof result) => { result = value } }
  const plugin = { init: () => {}, info: { editorType: 'cell' }, attachEvent: () => {}, attachContextMenuClickEvent: () => {}, executeMethod: () => {},
    callCommand: (command: () => unknown, _close: boolean, _calc: boolean, callback: (value: unknown) => void) => callback(command()) }
  const Asc = { plugin, scope: {} }
  runInNewContext(html.split('<script>')[1].split('</script>')[0].replace('__DOCS_ORIGIN__', '"http://docs"'), {
    Asc, window: { top, Asc, addEventListener: (_name: string, handler: typeof receive) => { receive = handler } },
    location: { origin: 'http://share' }, document: { createElement: () => script, head: { appendChild: () => {} } },
    Api: { GetActiveSheet: () => ({ GetName: () => 'Sheet1', GetSelection: () => ({ GetRowsCount: () => 1, GetColsCount: () => 2,
      GetFormula: () => cells, GetAddress: () => address, SetValue: (value: typeof cells) => { cells = value; return true } }) }) }
  })
  script.onload(); plugin.init()
  const send = async (action: string, fields = {}) => { await receive({ source: top, origin: 'http://share', data: { type: 'gb-office-command', id: '1', action, ...fields } }); return result }
  const selection = (await send('selection')).result
  expect((await send('replace', { selection, text: '[["new",9]]' })).error).toContain('公式已受保护')
  expect(cells).toEqual([['old', '=1+2']])
  expect((await send('replace', { selection, text: '[["new"]]' })).error).toContain('行列数')
  address = '$A$2:$B$2'
  expect((await send('replace', { selection, text: '[["new","=1+2"]]' })).error).toContain('原选区')
  address = '$A$1:$B$1'
  expect((await send('replace', { selection, text: '[["new","=2+3"]]', allowFormulas: true })).result).toBe(true)
  expect(cells).toEqual([['new', '=2+3']])
})
