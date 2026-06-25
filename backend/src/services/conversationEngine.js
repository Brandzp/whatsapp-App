import prisma from '../lib/prisma.js';
import config from '../config/index.js';
import { generateAgentResponse, ruleBasedResponse } from './aiAgent.js';
import { sendWhatsAppMessage, sendWhatsAppAudio, sendWhatsAppImage } from './whatsapp.js';
import { trackEvent, EVENTS } from './analytics.js';
import { computeLeadScore } from './leadScore.js';

/**
 * Main entry point: process one inbound customer message end-to-end.
 * Returns { conversation, agentResponse, replySent }.
 */
export async function handleIncomingMessage({ phone, text, name, rawPayload }) {
  // 1) Customer
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name: name || null },
  });

  // 2) Conversation (reuse an open one, else start fresh)
  let conversation = await prisma.conversation.findFirst({
    where: { customerId: customer.id, status: { in: ['active', 'needs_human'] } },
    orderBy: { createdAt: 'desc' },
  });

  // 2a) "One & done": if there's no open conversation but this customer already
  // COMPLETED A FLOW, stay silent — record the inbound message (so it's visible in
  // the dashboard) and bump activity, but don't reply or restart a flow. Scoped to
  // conversations that actually ran a flow (currentFlowId set), so plain chit-chat
  // the AI happens to mark "completed" doesn't permanently silence the customer.
  if (!conversation) {
    const completed = await prisma.conversation.findFirst({
      where: { customerId: customer.id, status: 'completed', currentFlowId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (completed) {
      await prisma.message.create({
        data: {
          conversationId: completed.id,
          senderType: 'customer',
          messageText: text,
          rawPayload: rawPayload || undefined,
        },
      });
      await prisma.conversation.update({
        where: { id: completed.id },
        data: { lastMessage: text, lastActivityAt: new Date() },
      });
      await trackEvent(EVENTS.MESSAGE_RECEIVED, {
        conversationId: completed.id,
        customerId: customer.id,
        customerPhone: phone,
        metadata: { text, suppressed: true },
      });
      return { conversation: completed, agentResponse: null, replySent: false, isNew: false, suppressed: true };
    }
  }

  let isNew = false;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { customerId: customer.id, whatsappPhone: phone, status: 'active' },
    });
    isNew = true;
    await trackEvent(EVENTS.CONVERSATION_STARTED, {
      conversationId: conversation.id,
      customerId: customer.id,
      customerPhone: phone,
    });
  }

  // 3) Save incoming message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: 'customer',
      messageText: text,
      rawPayload: rawPayload || undefined,
    },
  });
  await trackEvent(EVENTS.MESSAGE_RECEIVED, {
    conversationId: conversation.id,
    customerId: customer.id,
    customerPhone: phone,
    metadata: { text },
  });

  // 4) Build context for the agent
  const [kb, flows, existingAnswers, history] = await Promise.all([
    prisma.knowledgeBase.findFirst(),
    loadActiveFlows(),
    prisma.customerAnswer.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' } }),
    prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
  ]);

  // Deterministic flow selection when not already inside a flow:
  //  1) a flow whose trigger words appear in the message, else
  //  2) a "default" flow (isDefault) that starts on ANY message (e.g. "hey").
  let suggestedFlow = null;
  if (!conversation.currentFlowId) {
    const lc = text.toLowerCase();
    const matched = flows.find((fl) => fl.triggerWords?.some((w) => w && lc.includes(String(w).toLowerCase())));
    const fallback = matched || flows.find((fl) => fl.isDefault);
    if (fallback) suggestedFlow = { id: fallback.id, name: fallback.name };
  }

  const ctx = {
    incomingText: text,
    knowledgeBase: kb,
    flows,
    state: {
      currentFlowId: conversation.currentFlowId,
      currentQuestionId: conversation.currentQuestionId,
      status: conversation.status,
      needsHuman: conversation.needsHuman,
      customerPhone: phone,
      suggestedFlow,
      collectedAnswers: existingAnswers.map((a) => ({
        question_id: a.questionId,
        question: a.questionText,
        answer: a.answer,
      })),
    },
    history: history.map((m) => ({ senderType: m.senderType, text: m.messageText })),
  };

  // 5) Run the agent.
  // Flow EXECUTION is always deterministic (ordered questions, phone auto-fill,
  // correct answer recording). The LLM is used only to (a) answer free-form
  // knowledge-base questions and (b) DETECT intent to start a flow conversationally
  // (e.g. "כן" after being offered). It never executes flow steps itself.
  let agentResponse;
  if (conversation.currentFlowId) {
    // Mid-flow → record answer + advance, deterministically.
    agentResponse = ruleBasedResponse(ctx);
  } else if (suggestedFlow) {
    // Trigger word matched → start that flow fresh from question 1.
    ctx.state.startFlowId = suggestedFlow.id;
    agentResponse = ruleBasedResponse(ctx);
  } else {
    // No flow context → ask the LLM (KB answer or conversational start).
    const llm = await generateAgentResponse(ctx);
    const wantsToStart =
      llm.flow_id &&
      flows.some((f) => f.id === llm.flow_id) &&
      (llm.next_action === 'ask_next_question' || llm.intent === 'predefined_flow_start');
    if (wantsToStart) {
      // LLM detected the customer wants a flow → start it deterministically.
      ctx.state.startFlowId = llm.flow_id;
      agentResponse = ruleBasedResponse(ctx);
    } else {
      agentResponse = llm; // pure knowledge-base answer / chit-chat
    }
  }

  // 6) Persist newly collected answers (diff vs existing)
  // If the customer asked to restart, wipe previously stored answers first.
  if (agentResponse.reset_answers) {
    await prisma.customerAnswer.deleteMany({ where: { conversationId: conversation.id } });
    existingAnswers.length = 0;
  }
  const existingQids = new Set(existingAnswers.map((a) => a.questionId).filter(Boolean));
  const newAnswers = (agentResponse.collected_answers || []).filter(
    (a) => a.question_id && !existingQids.has(a.question_id)
  );
  for (const a of newAnswers) {
    await prisma.customerAnswer.create({
      data: {
        conversationId: conversation.id,
        customerId: customer.id,
        flowId: agentResponse.flow_id || conversation.currentFlowId || null,
        questionId: a.question_id,
        questionText: a.question || null,
        answer: a.answer,
      },
    });
    await trackEvent(EVENTS.QUESTION_ANSWERED, {
      conversationId: conversation.id,
      customerId: customer.id,
      customerPhone: phone,
      flowId: agentResponse.flow_id,
      questionId: a.question_id,
      metadata: { answer: a.answer },
    });
    await captureContactFromAnswer(customer.id, a);
  }

  // 7) Resolve link + build trackable URL, append to reply
  let replyText = agentResponse.reply;
  let linkSent = conversation.linkSent;
  if (agentResponse.next_action === 'send_link') {
    const trackable = await resolveTrackableLink(agentResponse, conversation.id);
    if (trackable) {
      replyText = `${replyText}\n${trackable.url}`;
      linkSent = true;
      await trackEvent(EVENTS.LINK_SENT, {
        conversationId: conversation.id,
        customerId: customer.id,
        customerPhone: phone,
        flowId: agentResponse.flow_id,
        metadata: { linkId: trackable.linkId, url: trackable.target },
      });
    }
  }

  // 8) Lifecycle analytics
  await emitLifecycleEvents({ conversation, agentResponse, customer, phone });

  // 9) Compute lead score + persist conversation state
  const flow = flows.find((f) => f.id === (agentResponse.flow_id || conversation.currentFlowId));
  const requiredCount = flow ? flow.questions.filter((q) => q.isRequired).length : 0;
  const totalAnswers = existingAnswers.length + newAnswers.length;
  const leadScore = computeLeadScore({
    intent: agentResponse.intent,
    answersCount: totalAnswers,
    requiredCount,
    linkSent,
    status: agentResponse.conversation_status,
  });
  agentResponse.lead_score = leadScore;

  conversation = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: agentResponse.conversation_status,
      intent: agentResponse.intent,
      currentFlowId: agentResponse.flow_id,
      currentQuestionId: agentResponse.current_question_id,
      needsHuman: agentResponse.needs_human,
      lastMessage: text,
      leadScore,
      linkSent,
      lastActivityAt: new Date(),
    },
  });

  // 10) Save agent reply + send via WhatsApp. Skip entirely when there's nothing
  // to send — e.g. a flow that completes with no closing message and no link.
  const hasReply = !!(replyText && replyText.trim());

  // If the question now being asked has a pre-recorded image and/or voice note,
  // send them first (image, then voice); the text reply (which also carries any
  // option list) follows.
  let voiceUrl = null;
  let imageUrl = null;
  if (agentResponse.next_action === 'ask_next_question' && agentResponse.current_question_id && flow) {
    const askedQuestion = flow.questions.find((q) => q.id === agentResponse.current_question_id);
    voiceUrl = askedQuestion?.voiceUrl || null;
    imageUrl = askedQuestion?.imageUrl || null;
  }

  let replySent = false;
  if (hasReply) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'agent',
        messageText: replyText,
        intent: agentResponse.intent,
      },
    });
    await trackEvent(EVENTS.MESSAGE_SENT, {
      conversationId: conversation.id,
      customerId: customer.id,
      customerPhone: phone,
      metadata: { reply: replyText, intent: agentResponse.intent },
    });
    replySent = true;
    try {
      if (imageUrl) await sendWhatsAppImage(phone, imageUrl);
      if (voiceUrl) await sendWhatsAppAudio(phone, voiceUrl);
      await sendWhatsAppMessage(phone, replyText);
    } catch (err) {
      replySent = false;
      console.error('[engine] failed to send WhatsApp reply:', err.message);
    }
  }

  return { conversation, agentResponse: { ...agentResponse, reply: replyText }, replySent, isNew };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function loadActiveFlows() {
  const flows = await prisma.flow.findMany({
    where: { isActive: true },
    include: { questions: { orderBy: { orderIndex: 'asc' } }, link: true },
  });
  return flows.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    triggerWords: f.triggerWords,
    isDefault: f.isDefault,
    finalMessage: f.finalMessage,
    sendFinalMessage: f.sendFinalMessage,
    linkId: f.linkId,
    linkUrl: f.link?.url || null,
    questions: f.questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      voiceUrl: q.voiceUrl,
      imageUrl: q.imageUrl,
      isRequired: q.isRequired,
      orderIndex: q.orderIndex,
    })),
  }));
}

/**
 * Build a trackable redirect link (/r/:linkId?c=:conversationId) when the link
 * exists as a Link record with click tracking; otherwise return the raw URL.
 */
async function resolveTrackableLink(agentResponse, conversationId) {
  // Prefer the flow's configured link record.
  let link = null;
  if (agentResponse.flow_id) {
    const flow = await prisma.flow.findUnique({ where: { id: agentResponse.flow_id }, include: { link: true } });
    link = flow?.link || null;
  }
  // Fall back to matching by URL.
  if (!link && agentResponse.link_to_send) {
    link = await prisma.link.findFirst({ where: { url: agentResponse.link_to_send } });
  }

  if (link) {
    const target = link.url;
    const url = link.trackClicks
      ? `${config.publicBaseUrl}/r/${link.id}?c=${conversationId}`
      : target;
    return { linkId: link.id, url, target };
  }
  if (agentResponse.link_to_send) {
    return { linkId: null, url: agentResponse.link_to_send, target: agentResponse.link_to_send };
  }
  return null;
}

async function emitLifecycleEvents({ conversation, agentResponse, customer, phone }) {
  const base = { conversationId: conversation.id, customerId: customer.id, customerPhone: phone, flowId: agentResponse.flow_id };

  await trackEvent(EVENTS.INTENT_DETECTED, { ...base, metadata: { intent: agentResponse.intent } });

  // Flow just started (no prior flow, now in one)
  if (!conversation.currentFlowId && agentResponse.flow_id) {
    await trackEvent(EVENTS.FLOW_STARTED, base);
  }
  // A question is being asked
  if (agentResponse.next_action === 'ask_next_question' && agentResponse.current_question_id) {
    await trackEvent(EVENTS.QUESTION_ASKED, { ...base, questionId: agentResponse.current_question_id });
  }
  if (agentResponse.next_action === 'transfer_to_human' || agentResponse.needs_human) {
    await trackEvent(EVENTS.HUMAN_HANDOFF_REQUESTED, base);
  }
  if (agentResponse.conversation_status === 'completed' && conversation.status !== 'completed') {
    await trackEvent(EVENTS.FLOW_COMPLETED, base);
    await trackEvent(EVENTS.CONVERSATION_CLOSED, base);
  }
  if (agentResponse.conversation_status === 'abandoned' && conversation.status !== 'abandoned') {
    await trackEvent(EVENTS.FLOW_ABANDONED, base);
  }
}

/**
 * Opportunistically capture email/phone from typed answers onto the customer record.
 */
async function captureContactFromAnswer(customerId, answer) {
  const val = (answer.answer || '').trim();
  const emailMatch = val.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const data = {};
  if (emailMatch) data.email = emailMatch[0];
  const qid = (answer.question_id || '').toLowerCase();
  if (qid.includes('name') || /שם/.test(answer.question || '')) data.name = val;
  if (Object.keys(data).length) {
    try {
      await prisma.customer.update({ where: { id: customerId }, data });
    } catch {
      /* non-fatal */
    }
  }
}
