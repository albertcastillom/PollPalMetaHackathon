import { useTranslation } from './useTranslation'

export default function T({ children }) {
  const text = typeof children === 'string' ? children : ''
  const { translate } = useTranslation(text ? [text] : [])
  return <>{translate(text)}</>
}
