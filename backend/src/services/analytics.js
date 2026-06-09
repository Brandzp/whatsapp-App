import prisma from '../lib/prisma.js';

/**
 * Canonical analytics event names tracked across the system.
 */
export const EVENTS = {
  CONVERSATION_STARTED: 'conversation_started',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  INTENT_DETECTED: 'intent_detected',
  FLOW_STARTED: 'flow_started',
  QUESTION_ASKED: 'question_asked',
  QUESTION_ANSWERED: 'question_answered',
  FLOW_COMPLETED: 'flow_completed',
  FLOW_ABANDONED: 'flow_abandoned',
  LINK_SENT: 'link_sent',
  LINK_CLICKED: 'link_clicked',
  HUMAN_HANDOFF_REQUESTED: 'human_handoff_requested',
  CONVERSATION_CLOSED: 'conversation_closed',
};

/**
 * Persist an analytics event. Never throws into the request path.
 */
export async function trackEvent(eventName, data = {}) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventName,
        conversationId: data.conversationId || null,
        customerId: data.customerId || null,
        customerPhone: data.customerPhone || null,
        flowId: data.flowId || null,
        questionId: data.questionId || null,
        metadata: data.metadata || {},
      },
    });
  } catch (err) {
    console.error('[analytics] failed to track', eventName, err.message);
  }
}
