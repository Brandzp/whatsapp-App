import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

const FIELDS = [
  'businessDescription',
  'productInfo',
  'serviceInfo',
  'prices',
  'shippingInfo',
  'returnPolicy',
  'faq',
  'openingHours',
  'contactDetails',
  'limitations',
  'customInstructions',
];

async function getOrCreate() {
  let kb = await prisma.knowledgeBase.findFirst();
  if (!kb) kb = await prisma.knowledgeBase.create({ data: {} });
  return kb;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getOrCreate());
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const kb = await getOrCreate();
    const data = {};
    for (const f of FIELDS) if (req.body?.[f] !== undefined) data[f] = req.body[f];
    const updated = await prisma.knowledgeBase.update({ where: { id: kb.id }, data });
    res.json(updated);
  })
);

export default router;
