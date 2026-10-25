export const officeFormats = {
  docx: { documentType: 'word', part: 'word/document.xml', root: 'document', namespace: 'wordprocessingml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { documentType: 'cell', part: 'xl/workbook.xml', root: 'workbook', namespace: 'spreadsheetml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { documentType: 'slide', part: 'ppt/presentation.xml', root: 'presentation', namespace: 'presentationml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
} as const
export type OfficeFormat = keyof typeof officeFormats
export const conversionFormats = { doc: 'docx', xls: 'xlsx', ppt: 'pptx' } as const
export const inputFormats = [...Object.keys(officeFormats), ...Object.keys(conversionFormats)]
export function fileExtension(name: string): string { return name.split('.').pop()!.toLowerCase() }
export function outputFormat(name: string): OfficeFormat {
  const extension = fileExtension(name)
  return (conversionFormats[extension as keyof typeof conversionFormats] ?? extension) as OfficeFormat
}
