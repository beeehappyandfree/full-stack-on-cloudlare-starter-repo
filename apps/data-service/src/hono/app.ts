import { getDestinationForCountry, getRoutingDestinations } from '@/helpers/route.ops';
import { cloudflareInfoSchema } from '@repo/data-ops/zod-schema/links';
import { LinkClickMessageType } from '@repo/data-ops/zod-schema/queue';
import { EvaluationScheduler } from '@/durable-objects/valuation-scheduler';
import { Hono } from 'hono';

export const App = new Hono<{ Bindings: Env }>();

App.get('/do/:name', async (c) => {
  const name = c.req.param("name")
  const doId = c.env.EVALUATION_SCHEDULAR.idFromName(name);
  const stub = c.env.EVALUATION_SCHEDULAR.get(doId);
  await stub.increment()
  const count = await stub.getCount()
  return c.json({
    count
  })
})



App.get('/:id', async (c) => {
  const id = c.req.param('id');
  const linkInfo = await getRoutingDestinations(c.env, id)
  if (!linkInfo) {
    return c.json({ error: 'Destination not found' }, 404)
  }
  const cfHeader = cloudflareInfoSchema.safeParse(c.req.raw.cf)

  if (!cfHeader.success) {
    return c.json({ error: 'Invalid Cloudflare header' }, 400)
  }

  const headers = cfHeader.data
  console.log(headers)

  const destination = getDestinationForCountry(linkInfo, headers.country)
  const queueMessage: LinkClickMessageType = {
    "type": "LINK_CLICK",
    data: {
      id: id,
      country: headers.country,
      destination: destination,
      accountId: linkInfo.accountId,
      latitude: headers.latitude,
      longitude: headers.longitude,
      timestamp: new Date().toISOString()
    }
  }
  c.executionCtx.waitUntil(
    c.env.QUEUE.send(queueMessage)
  )

  return c.redirect(destination)
})
