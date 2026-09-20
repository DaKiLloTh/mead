// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import ResultCard from './ResultCard'

afterEach(cleanup)

describe('ResultCard', () => {
  it('renders the title, description, body and both footer slots', () => {
    render(
      <ResultCard
        title="wget"
        description="Internet file retriever"
        footerLeft={<span>1.25.0</span>}
        footerRight={<button>Install</button>}
      >
        <p>body content</p>
      </ResultCard>
    )
    expect(screen.getByText('wget')).toBeTruthy()
    expect(screen.getByText('Internet file retriever')).toBeTruthy()
    expect(screen.getByText('body content')).toBeTruthy()
    expect(screen.getByText('1.25.0')).toBeTruthy()
    expect(screen.getByText('Install')).toBeTruthy()
  })

  it('omits the description line when there is none', () => {
    const { container } = render(<ResultCard title="wget" />)
    expect(container.querySelector('.text-xs')).toBeNull()
  })

  it('calls onClick when the card is clicked, and marks it clickable', () => {
    const onClick = vi.fn()
    const { container } = render(<ResultCard title="wget" onClick={onClick} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('cursor-pointer')
    fireEvent.click(screen.getByText('wget'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is not styled as clickable without onClick', () => {
    const { container } = render(<ResultCard title="wget" />)
    expect((container.firstElementChild as HTMLElement).className).not.toContain('cursor-pointer')
  })

  it('keeps clicks in the header slot from reaching onClick', () => {
    const onClick = vi.fn()
    const onBadge = vi.fn()
    render(<ResultCard title="wget" onClick={onClick} headerRight={<button onClick={onBadge}>homepage</button>} />)
    fireEvent.click(screen.getByText('homepage'))
    expect(onBadge).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('lets clicks in the footer reach onClick unless the caller stops them', () => {
    const onClick = vi.fn()
    render(<ResultCard title="wget" onClick={onClick} footerLeft={<span>1.25.0</span>} />)
    fireEvent.click(screen.getByText('1.25.0'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
