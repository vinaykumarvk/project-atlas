import { Injectable } from '@nestjs/common';

/**
 * Sentiment analysis result.
 */
export interface SentimentResult {
  sentiment: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';
  urgency_signal: string | null;
  priority_upgrade: boolean;
}

/**
 * Lexicon-based sentiment and urgency analysis service.
 * Detects emotional tone and urgency signals in email text.
 */
@Injectable()
export class SentimentService {
  private readonly urgencyWords = [
    'urgent',
    'urgently',
    'asap',
    'immediately',
    'immediate',
    'court hearing',
    'before eod',
    'end of day',
    'deadline',
    'time-sensitive',
    'critical',
    'emergency',
    'escalate',
    'escalation',
    'overdue',
    'delayed',
    'breach',
    'penalty',
    'legal notice',
    'show cause',
    'contempt',
    'last date',
    'final notice',
    'reminder',
    'follow up',
    'follow-up',
    'pending since',
    'awaiting since',
  ];

  private readonly negativeWords = [
    'complaint',
    'complain',
    'dissatisfied',
    'unhappy',
    'frustrated',
    'frustration',
    'unacceptable',
    'poor',
    'terrible',
    'worst',
    'harassment',
    'harassed',
    'cheat',
    'fraud',
    'mislead',
    'misleading',
    'disappointed',
    'anger',
    'angry',
    'threat',
    'threaten',
    'sue',
    'lawsuit',
    'ombudsman',
    'rbi complaint',
    'consumer forum',
    'grievance',
    'negligence',
    'negligent',
    'incompetent',
    'delay',
    'failed',
    'failure',
    'unresolved',
    'ignored',
  ];

  private readonly positiveWords = [
    'thank',
    'thanks',
    'appreciate',
    'appreciation',
    'grateful',
    'satisfied',
    'excellent',
    'good',
    'great',
    'wonderful',
    'pleased',
    'happy',
    'helpful',
    'prompt',
    'efficient',
    'resolved',
    'well done',
    'kudos',
    'commend',
    'smooth',
  ];

  /**
   * Analyse sentiment and urgency of the given text.
   */
  analyse(text: string): SentimentResult {
    const lowerText = text.toLowerCase();

    const sentiment = this.detectSentiment(lowerText);
    const urgencySignal = this.detectUrgency(lowerText);
    const priorityUpgrade = this.shouldUpgradePriority(sentiment, urgencySignal);

    return {
      sentiment,
      urgency_signal: urgencySignal,
      priority_upgrade: priorityUpgrade,
    };
  }

  /**
   * Detect overall sentiment using word list matching.
   */
  private detectSentiment(text: string): 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' {
    let positiveScore = 0;
    let negativeScore = 0;

    for (const word of this.positiveWords) {
      if (text.includes(word)) {
        positiveScore++;
      }
    }

    for (const word of this.negativeWords) {
      if (text.includes(word)) {
        negativeScore++;
      }
    }

    // Weighted scoring: negative words have stronger signal
    const netScore = positiveScore - negativeScore * 1.5;

    if (netScore < -1) return 'NEGATIVE';
    if (netScore > 1) return 'POSITIVE';
    return 'NEUTRAL';
  }

  /**
   * Detect urgency signal from text.
   * Returns the most significant urgency phrase found, or null.
   */
  private detectUrgency(text: string): string | null {
    const detectedSignals: string[] = [];

    for (const signal of this.urgencyWords) {
      if (text.includes(signal)) {
        detectedSignals.push(signal.toUpperCase());
      }
    }

    if (detectedSignals.length === 0) return null;

    // Return highest-priority signal (first match in our priority-ordered list)
    return detectedSignals[0];
  }

  /**
   * Determine if priority should be upgraded based on sentiment and urgency.
   * Priority upgrade occurs when:
   * - Urgency signal is detected with negative sentiment
   * - Multiple urgency signals are detected
   * - Strong negative sentiment is present
   */
  private shouldUpgradePriority(
    sentiment: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE',
    urgencySignal: string | null,
  ): boolean {
    if (urgencySignal && sentiment === 'NEGATIVE') {
      return true;
    }
    if (urgencySignal && ['COURT HEARING', 'LEGAL NOTICE', 'CONTEMPT', 'SHOW CAUSE'].includes(urgencySignal)) {
      return true;
    }
    return false;
  }
}
