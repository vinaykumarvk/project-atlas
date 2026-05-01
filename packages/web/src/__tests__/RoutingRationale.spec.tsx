import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoutingRationale } from '../components/RoutingRationale';

describe('RoutingRationale (FR-133.A3)', () => {
  const defaultProps = {
    rationale: 'Matched by case_type=VALUATION, zone=Mumbai',
    tier: 'CITY',
    fprName: 'John Smith',
    workloadRatio: 0.6,
    resolvedKeys: { caseType: 'VALUATION', propertyCity: 'Mumbai' },
    fallbackChain: [],
  };

  it('should render collapsed by default', () => {
    render(<RoutingRationale {...defaultProps} />);
    expect(screen.getByTestId('routing-rationale')).toBeTruthy();
    expect(screen.getByText('Why this routing?')).toBeTruthy();
  });

  it('should expand on click to show details', () => {
    render(<RoutingRationale {...defaultProps} />);
    fireEvent.click(screen.getByText('Why this routing?'));
    expect(screen.getByText(/Matched by case_type=VALUATION/)).toBeTruthy();
  });

  it('should display FPR name when provided', () => {
    render(<RoutingRationale {...defaultProps} />);
    fireEvent.click(screen.getByText('Why this routing?'));
    expect(screen.getByText(/John Smith/)).toBeTruthy();
  });

  it('should display matched tier', () => {
    render(<RoutingRationale {...defaultProps} />);
    fireEvent.click(screen.getByText('Why this routing?'));
    expect(screen.getByText('CITY')).toBeTruthy();
  });
});
