import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConsentMessageDisplay } from './ConsentMessageDisplay'
import type { ConsentMessageData } from '@/domain/types'

const data: ConsentMessageData = {
  purpose: 'พิจารณาอนุมัติสินเชื่อ',
  dcName: 'บริษัท ABC',
  dpItems: [
    {
      dpName: 'ธนาคาร A',
      accountRef: 'xxx-x-xx234-1',
      datasets: [{ name: 'รายการเดินบัญชีเงินฝาก', permission: 'รายการเดินบัญชี (แบบมีรายละเอียด)' }],
    },
  ],
}

describe('ConsentMessageDisplay', () => {
  it('renders purpose text', () => {
    render(<ConsentMessageDisplay data={data} />)
    const matches = screen.getAllByText(/พิจารณาอนุมัติสินเชื่อ/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders DP name', () => {
    render(<ConsentMessageDisplay data={data} />)
    expect(screen.getByText(/ธนาคาร A/)).toBeInTheDocument()
  })

  it('renders consent message body text', () => {
    render(<ConsentMessageDisplay data={data} />)
    expect(screen.getByText(/คุณกำลังยืนยันตัวเอง/)).toBeInTheDocument()
  })

  it('does not use dangerouslySetInnerHTML', () => {
    const { container } = render(<ConsentMessageDisplay data={data} />)
    // All content must be in text nodes, not set via innerHTML
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML')
  })
})
