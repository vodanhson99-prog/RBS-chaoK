export type TemplateKind = 'single' | 'strip6'

export type Template = {
  id: string
  name: string
  src: string
  kind: TemplateKind
  keepBottom?: number
}

export const TEMPLATES: Template[] = [
  {
    id: 'blue',
    name: 'Navy 16:9',
    src: '/frames/blueframe.png',
    kind: 'single',
  },
  {
    id: 'red',
    name: 'Maroon 16:9',
    src: '/frames/redframe.png',
    kind: 'single',
  },
  {
    id: 'woozi',
    name: 'Woozi strip ×6',
    src: '/frames/woozi-strip.png',
    kind: 'strip6',
  },
]

export function templateById(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

export function nextTemplate(id: string): Template {
  const i = TEMPLATES.findIndex((t) => t.id === id)
  return TEMPLATES[(i + 1) % TEMPLATES.length]
}
