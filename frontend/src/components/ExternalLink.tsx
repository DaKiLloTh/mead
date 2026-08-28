import type { AnchorHTMLAttributes, ComponentChildren, TargetedMouseEvent } from 'preact'
import { BrowserOpenURL } from '../../wailsjs/runtime'

interface ExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel' | 'onClick'> {
  href: string
  children: ComponentChildren
}

/**
 * Renders a link that opens `href` in the user's system browser via Wails'
 * BrowserOpenURL runtime call, instead of `target="_blank"` — which silently
 * no-ops inside the embedded webview (there's no real "open new tab").
 *
 * Accepts the same className/title/etc. props as a plain <a>, so each call
 * site can keep its existing visual styling.
 */
export default function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  function handleClick(e: TargetedMouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    BrowserOpenURL(href)
  }

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
