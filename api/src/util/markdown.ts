import { marked } from 'marked'
import prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-sass'
import 'prismjs/components/prism-scss'

marked.setOptions({
  highlight: (code, lang) =>
    prism.languages[lang]
      ? prism.highlight(code, prism.languages[lang], lang)
      : code,
})

export const convert = (input: string) => marked.parse(input)
