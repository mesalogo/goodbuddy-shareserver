import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeAiDialog } from './office-ai-dialog'

afterEach(() => { cleanup(); delete window.goodbuddyOfficeAi })
it('generates and applies spreadsheet output through the bound request, with formulas protected by default', async () => {
  const request = vi.fn(async (input: Record<string, unknown>) => {
    if (input.action === 'context') return { conversationTitle: '原对话' }
    if (input.action === 'ask') return { requestId: 'request-1', selectedText: '[["old","=1+2"]]', conversationTitle: '原对话' }
    if (input.action === 'result') return { state: 'complete' as const, text: '[["new","=1+2"]]' }
    return { applied: true }
  })
  window.goodbuddyOfficeAi = { request }
  render(<OfficeAiDialog />)
  fireEvent(window, new CustomEvent('gb-office-ai-open', { detail: { selection: { text: '[["old","=1+2"]]', epoch: 1, kind: 'cell' } } }))
  await screen.findByText(/原对话/)
  expect(screen.getByRole('checkbox', { name: '允许修改公式' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '开始润色' }))
  expect(await screen.findByLabelText('第 1 行第 1 列')).toHaveValue('new')
  expect(screen.getByLabelText('第 1 行第 2 列')).toHaveValue('=1+2')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'ask', allowFormulas: false }))
  fireEvent.click(screen.getByRole('button', { name: '应用到原选区' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(request).toHaveBeenCalledWith({ action: 'apply', requestId: 'request-1', text: '[["new","=1+2"]]', allowFormulas: false })
})

it('retains a generated reply and shows a stale-selection error without reporting success', async () => {
  window.goodbuddyOfficeAi = { request: vi.fn(async (input: Record<string, unknown>) => {
    if (input.action === 'apply') throw new Error('原选区已改变')
    if (input.action === 'ask') return { requestId: 'r' }
    if (input.action === 'result') return { state: 'complete' as const, text: 'new text' }
    return { conversationTitle: 'chat' }
  }) }
  render(<OfficeAiDialog />)
  fireEvent(window, new CustomEvent('gb-office-ai-open', { detail: { selection: { text: 'old', epoch: 1, kind: 'slide' } } }))
  fireEvent.click(screen.getByRole('button', { name: '开始润色' }))
  await screen.findByLabelText('修改结果')
  fireEvent.click(screen.getByRole('button', { name: '应用到原选区' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('原选区已改变')
  expect(screen.getByLabelText('修改结果')).toHaveValue('new text')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
