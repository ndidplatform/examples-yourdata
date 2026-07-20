import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatasetList } from './DatasetList'
import { mockDPs } from '@/services/dp/fixtures/dp.fixtures'

const datasets = mockDPs[0].datasets

describe('DatasetList', () => {
  it('renders mandatory datasets (M3)', () => {
    render(<DatasetList datasets={datasets} selectedDatasetIds={[]} onToggle={vi.fn()} />)
    expect(screen.getByText('รายการเดินบัญชีเงินฝาก')).toBeInTheDocument()
  })

  it('mandatory datasets are pre-checked and disabled (M4)', () => {
    render(<DatasetList datasets={datasets} selectedDatasetIds={[]} onToggle={vi.fn()} />)
    const mandatoryCheckbox = screen.getAllByRole('checkbox')[0]
    expect(mandatoryCheckbox).toBeChecked()
    expect(mandatoryCheckbox).toBeDisabled()
  })

  it('optional datasets are not pre-checked (M4)', () => {
    render(<DatasetList datasets={datasets} selectedDatasetIds={[]} onToggle={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    const optionalCheckbox = checkboxes[1]
    expect(optionalCheckbox).not.toBeChecked()
  })

  it('calls onToggle for optional dataset when clicked', async () => {
    const onToggle = vi.fn()
    render(<DatasetList datasets={datasets} selectedDatasetIds={[]} onToggle={onToggle} />)
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1])
    expect(onToggle).toHaveBeenCalledWith(datasets[1].datasetId)
  })
})
