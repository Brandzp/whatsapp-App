import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const links = await prisma.link.findMany({
      include: { relatedFlow: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(links);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, url, description, relatedFlowId, isActive, trackClicks } = req.body || {};
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    const link = await prisma.link.create({
      data: {
        name,
        url,
        description: description || null,
        relatedFlowId: relatedFlowId || null,
        isActive: isActive ?? true,
        trackClicks: trackClicks ?? true,
      },
    });
    res.status(201).json(link);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, url, description, relatedFlowId, isActive, trackClicks } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name;
    if (url !== undefined) data.url = url;
    if (description !== undefined) data.description = description;
    if (relatedFlowId !== undefined) data.relatedFlowId = relatedFlowId || null;
    if (isActive !== undefined) data.isActive = isActive;
    if (trackClicks !== undefined) data.trackClicks = trackClicks;
    const link = await prisma.link.update({ where: { id: req.params.id }, data });
    res.json(link);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.link.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default router;
