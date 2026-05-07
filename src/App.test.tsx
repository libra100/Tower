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
    expect(screen.getByText('開始建築工程')).toBeInTheDocument();
  });

  it('starts the game when the start button is clicked', () => {
    render(<App />);
    const startButton = screen.getByText('開始建築工程');
    fireEvent.click(startButton);
    expect(screen.queryByText('開始建築工程')).not.toBeInTheDocument();
  });

  it('displays initial resource values', () => {
    render(<App />);
    expect(screen.getByText('原料儲備')).toBeInTheDocument();
    expect(screen.getByText('運輸中')).toBeInTheDocument();
    expect(screen.getByText('工地物資')).toBeInTheDocument();

    const materialValue = screen.getByText('原料儲備').closest('div')?.parentElement?.querySelector('.font-mono');
    expect(materialValue).toHaveTextContent('0');

    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('updates worker counts correctly and respects total limit', () => {
    render(<App />);

    const idleWorkersLabel = screen.getByText('空閒工人');
    const idleWorkersValue = idleWorkersLabel.parentElement?.querySelector('.font-mono');
    expect(idleWorkersValue).toHaveTextContent('0');

    const gatheringLabel = screen.getByText('採集');
    const gatheringControl = gatheringLabel.closest('div')?.parentElement;
    const decreaseButton = gatheringControl?.querySelector('button[aria-label="Decrease"]');
    const increaseButton = gatheringControl?.querySelector('button[aria-label="Increase"]');

    if (!decreaseButton || !increaseButton) throw new Error('Buttons not found');

    // 1. Decrease gathering
    fireEvent.click(decreaseButton);
    const gatheringCount = gatheringLabel.parentElement?.querySelector('.font-mono');
    expect(gatheringCount).toHaveTextContent('3');
    expect(idleWorkersValue).toHaveTextContent('1');

    // 2. Increase gathering back to 4
    fireEvent.click(increaseButton);
    expect(gatheringCount).toHaveTextContent('4');
    expect(idleWorkersValue).toHaveTextContent('0');

    // 3. Try to increase gathering beyond limit (idle is 0)
    fireEvent.click(increaseButton);
    expect(gatheringCount).toHaveTextContent('4'); // Should stay 4
    expect(idleWorkersValue).toHaveTextContent('0');
  });

  it('displays the correct construction stage', () => {
    render(<App />);
    // Initial stage is '地基' (Foundation)
    expect(screen.getByText(/正在建造: 地基/)).toBeInTheDocument();
  });
});
