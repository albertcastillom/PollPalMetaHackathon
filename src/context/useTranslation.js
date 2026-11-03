import { useContext, useEffect } from 'react'
import { TranslationContext } from './translation-context'

export function useTranslation(values = []) {
  const context = useContext(TranslationContext)
  if (!context) throw new Error('useTranslation must be used inside TranslationProvider.')
  const signature = values.filter((value) => typeof value === 'string').join('\u0000')

  useEffect(() => {
    context.requestTranslations(values)
    // The signature intentionally tracks string content instead of array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.language, context.requestTranslations, signature])

  return context
}
