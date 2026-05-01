import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export interface AccuracyTrendPoint {
  week: string;
  accuracy: number;
  totalPredictions: number;
}

export interface EntityF1Data {
  [entityType: string]: {
    precision: number;
    recall: number;
    f1: number;
  };
}

export interface OverrideRateData {
  overrideCount: number;
  totalPredictions: number;
  rate: number;
}

export interface LowConfidenceWeekly {
  week: string;
  count: number;
}

const classificationMetricsKeys = {
  all: ['classification-metrics'] as const,
  accuracyTrend: () => [...classificationMetricsKeys.all, 'accuracy-trend'] as const,
  entityF1: () => [...classificationMetricsKeys.all, 'entity-f1'] as const,
  overrideRate: () => [...classificationMetricsKeys.all, 'override-rate'] as const,
  lowConfidence: () => [...classificationMetricsKeys.all, 'low-confidence'] as const,
};

export function useAccuracyTrend() {
  return useQuery({
    queryKey: classificationMetricsKeys.accuracyTrend(),
    queryFn: () => apiGet<{ data: AccuracyTrendPoint[] }>('/classification/accuracy-trend'),
    refetchInterval: 60000,
  });
}

export function useEntityF1() {
  return useQuery({
    queryKey: classificationMetricsKeys.entityF1(),
    queryFn: () => apiGet<{ data: EntityF1Data }>('/classification/entity-f1'),
    refetchInterval: 60000,
  });
}

export function useOverrideRate() {
  return useQuery({
    queryKey: classificationMetricsKeys.overrideRate(),
    queryFn: () => apiGet<{ data: OverrideRateData }>('/classification/override-rate'),
    refetchInterval: 60000,
  });
}

export function useLowConfidence() {
  return useQuery({
    queryKey: classificationMetricsKeys.lowConfidence(),
    queryFn: () => apiGet<{ data: LowConfidenceWeekly[] }>('/classification/low-confidence'),
    refetchInterval: 60000,
  });
}
