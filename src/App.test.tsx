import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Mock @react-three/fiber and @react-three/drei
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: vi.fn(),
  useThree: () => ({
    camera: { position: { y: 0 }, lookAt: vi.fn() },
  }),
}));

vi.mock('@react-three/drei', () => ({
  PerspectiveCamera: () => <div data-testid="perspective-camera" />,
  OrbitControls: () => <div data-testid="orbit-controls" />,
  Environment: () => <div data-testid="environment" />,
  Float: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContactShadows: () => <div data-testid="contact-shadows" />,
}));

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
        const { animate, initial, exit, transition, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    },
    button: ({ children, ...props }: any) => {
        const { whileHover, whileTap, ...domProps } = props;
        return <button {...domProps}>{children}</button>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the start screen initially', () => {
    render(<App />);
    expect(screen.getByText('開啟史詩工程')).toBeInTheDocument();
  });

  it('starts the game when the start button is clicked', () => {
    render(<App />);
    const startButton = screen.getByText('開啟史詩工程');
    fireEvent.click(startButton);
    expect(screen.queryByText('開啟史詩工程')).not.toBeInTheDocument();
  });

  it('displays initial resource values', () => {
    render(<App />);
    expect(screen.getByText('磚塊 (窯)')).toBeInTheDocument();
    expect(screen.getByText('瀝青 (坑)')).toBeInTheDocument();
    expect(screen.getByText('木材 (林)')).toBeInTheDocument();

    const brickValue = screen.getByText('磚塊 (窯)').closest('div')?.parentElement?.querySelector('.font-mono');
    expect(brickValue).toHaveTextContent('10');
  });

  it('updates worker counts correctly and respects total limit', () => {
    render(<App />);

    const idleWorkersLabel = screen.getByText('空閒工人');
    const idleWorkersValue = idleWorkersLabel.parentElement?.querySelector('.font-mono');
    expect(idleWorkersValue).toHaveTextContent('0'); // 4+3+2+3+3 = 15. Total is 15.

    const workerLabel = screen.getByText('燒磚工');
    const workerControl = workerLabel.closest('div')?.parentElement;
    const decreaseButton = workerControl?.querySelector('button[aria-label="Decrease"]');
    const increaseButton = workerControl?.querySelector('button[aria-label="Increase"]');

    if (!decreaseButton || !increaseButton) throw new Error('Buttons not found');

    // 1. Decrease brickmaking
    fireEvent.click(decreaseButton);
    const countValue = workerLabel.parentElement?.querySelector('.font-mono');
    expect(countValue).toHaveTextContent('3');
    expect(idleWorkersValue).toHaveTextContent('1');

    // 2. Increase brickmaking back to 4
    fireEvent.click(increaseButton);
    expect(countValue).toHaveTextContent('4');
    expect(idleWorkersValue).toHaveTextContent('0');

    // 3. Try to increase brickmaking beyond limit (idle is 0)
    fireEvent.click(increaseButton);
    expect(countValue).toHaveTextContent('4'); // Should stay 4
    expect(idleWorkersValue).toHaveTextContent('0');
  });

  it('displays the correct construction stage', () => {
    render(<App />);
    // Initial stage is '鋪設地基'
    expect(screen.getByText(/建造進度: 鋪設地基/)).toBeInTheDocument();
  });
});
