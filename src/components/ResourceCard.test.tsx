import { render, screen } from '@testing-library/react';
import { ResourceCard } from './ResourceCard';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { animate, initial, exit, transition, ...domProps } = props;
      return <div {...domProps}>{children}</div>;
    },
  },
}));

describe('ResourceCard', () => {
  const defaultProps = {
    icon: <span data-testid="mock-icon">🔥</span>,
    label: '磚塊',
    value: 100,
    progress: 50,
    color: 'orange' as const,
  };

  it('renders correctly with default props', () => {
    render(<ResourceCard {...defaultProps} />);

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
    expect(screen.getByText('磚塊')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('displays siteValue when provided', () => {
    render(<ResourceCard {...defaultProps} siteValue="50.5" />);

    expect(screen.getByText('工地: 50.5')).toBeInTheDocument();
  });

  it('displays percentage sign when isPercent is true', () => {
    render(<ResourceCard {...defaultProps} value={75} isPercent={true} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('applies correct color classes based on color prop', () => {
    const { container, rerender } = render(<ResourceCard {...defaultProps} color="blue" />);

    // Check main container classes
    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv.className).toContain('text-blue-400');
    expect(mainDiv.className).toContain('bg-blue-400/10');

    // Check progress bar color (it's the only div inside the motion.div's parent)
    rerender(<ResourceCard {...defaultProps} color="emerald" />);
    const updatedMainDiv = container.firstChild as HTMLElement;
    expect(updatedMainDiv.className).toContain('text-emerald-400');

    const progressBar = container.querySelector('.h-full');
    expect(progressBar?.className).toContain('bg-emerald-400');
  });

  it('applies all supported colors correctly', () => {
    const colors = ['amber', 'blue', 'emerald', 'orange', 'slate'] as const;

    colors.forEach(color => {
      const { container } = render(<ResourceCard {...defaultProps} color={color} />);
      const mainDiv = container.firstChild as HTMLElement;

      // We check for partial matches of the expected color strings
      if (color === 'orange') {
        expect(mainDiv.className).toContain('text-orange-400');
      } else if (color === 'slate') {
        expect(mainDiv.className).toContain('text-slate-400');
      } else {
        expect(mainDiv.className).toContain(`text-${color}-400`);
      }
    });
  });
});
