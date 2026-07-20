import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MaskedAccountNumber } from './MaskedAccountNumber'

describe('MaskedAccountNumber', () => {
  it('renders the masked number as-is', () => {
    render(<MaskedAccountNumber masked="xxx-x-xx234-1" />)
    expect(screen.getByText('xxx-x-xx234-1')).toBeInTheDocument()
  })

  it('uses monospace font class', () => {
    const { container } = render(<MaskedAccountNumber masked="xxx-x-xx234-1" />)
    expect(container.firstChild).toHaveClass('font-mono')
  })
})
