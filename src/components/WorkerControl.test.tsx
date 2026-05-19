import { render, screen, fireEvent } from '@testing-library/react';
import { WorkerControl } from './WorkerControl';
import { Pickaxe } from 'lucide-react';
import { describe, it, expect, vi } from 'vitest';

describe('WorkerControl', () => {
  const defaultProps = {
    icon: <Pickaxe data-testid="test-icon" />,
    label: 'Test Worker',
    count: 5,
    onAdjust: vi.fn(),
    color: 'amber' as const,
  };

  it('renders correctly with given props', () => {
    render(<WorkerControl {...defaultProps} />);

    expect(screen.getByText('Test Worker')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('applies the correct color classes for amber', () => {
    const { container } = render(<WorkerControl {...defaultProps} color="amber" />);
    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('text-amber-400');
    expect(mainDiv).toHaveClass('border-amber-400/20');
  });

  it('applies the correct color classes for blue', () => {
    const { container } = render(<WorkerControl {...defaultProps} color="blue" />);
    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('text-blue-400');
    expect(mainDiv).toHaveClass('border-blue-400/20');
  });

  it('applies the correct color classes for emerald', () => {
    const { container } = render(<WorkerControl {...defaultProps} color="emerald" />);
    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('text-emerald-400');
    expect(mainDiv).toHaveClass('border-emerald-400/20');
  });

  it('calls onAdjust with 1 when increase button is clicked', () => {
    const onAdjust = vi.fn();
    render(<WorkerControl {...defaultProps} onAdjust={onAdjust} />);

    const increaseButton = screen.getByLabelText('Increase');
    fireEvent.click(increaseButton);

    expect(onAdjust).toHaveBeenCalledWith(1);
  });

  it('calls onAdjust with -1 when decrease button is clicked', () => {
    const onAdjust = vi.fn();
    render(<WorkerControl {...defaultProps} onAdjust={onAdjust} />);

    const decreaseButton = screen.getByLabelText('Decrease');
    fireEvent.click(decreaseButton);

    expect(onAdjust).toHaveBeenCalledWith(-1);
  });

  it('clones the icon and adds the w-4 h-4 class', () => {
    render(<WorkerControl {...defaultProps} />);
    const icon = screen.getByTestId('test-icon');
    expect(icon).toHaveClass('w-4 h-4');
  });
});
