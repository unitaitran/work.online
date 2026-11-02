// REST công ty (Phase 6). Mọi endpoint ghi có giới hạn tần suất; dữ liệu qua zod.
import {
  applySchema,
  assignTaskSchema,
  decideApplicationSchema,
  eventChoiceSchema,
  foundCompanyRequestSchema,
  inviteCodeSchema,
  ipoSchema,
  memberCodeSchema,
  offerDecisionSchema,
  projectAcceptSchema,
  staffIdSchema,
} from '@dilam/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { AppContext } from '../app';
import { sendError } from '../http/routes';
import type { UserRecord } from '../db/repositories';
import type { CompanyService, Result } from './companyService';

export function registerCompanyRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  service: CompanyService,
): void {
  const { helpers } = ctx;

  const send = <T>(reply: FastifyReply, result: Result<T>): FastifyReply => {
    if (result.ok) return reply.send(result.value ?? { ok: true });
    const status = result.error === 'not_found' ? 404 : result.error === 'not_owner' ? 403 : 422;
    return sendError(
      reply,
      status,
      status === 422 ? 'rejected' : status === 404 ? 'not_found' : 'forbidden',
      result.reason ?? result.error,
    );
  };

  /** Endpoint ghi: xác thực, giới hạn tần suất, kiểm tra body, ghi IP băm (chống tài khoản phụ). */
  const write = <S>(
    path: string,
    schema: z.ZodType<S> | null,
    handler: (user: UserRecord, body: S) => Result<unknown>,
  ): void => {
    app.post(path, (request: FastifyRequest, reply: FastifyReply) => {
      const user = helpers.requireUser(request, reply);
      if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
      const body = schema ? helpers.parse(schema, request.body, reply) : (undefined as S);
      if (schema && body === null) return reply;
      ctx.repos.users.setIpHash(user.id, service.hashIp(request.ip));
      return send(reply, handler(user, body as S));
    });
  };

  app.get('/api/company/me', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    ctx.repos.users.setIpHash(user.id, service.hashIp(request.ip));
    return reply.send(service.my(user.id));
  });

  app.get('/api/company/directory', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    return reply.send({ companies: service.directory() });
  });

  app.get<{ Params: { id: string } }>('/api/company/info/:id', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    const company = service.get(request.params.id);
    return company ? reply.send(company) : sendError(reply, 404, 'not_found');
  });

  write('/api/company/found', foundCompanyRequestSchema, (u, b) => service.found(u.id, b));
  write('/api/company/project', projectAcceptSchema, (u, b) =>
    service.acceptProject(u.id, b.offerId),
  );
  write('/api/company/hire', null, (u) => service.hire(u.id));
  write('/api/company/staff/promote', staffIdSchema, (u, b) =>
    service.promoteStaff(u.id, b.staffId),
  );
  write('/api/company/event', eventChoiceSchema, (u, b) => service.resolveEvent(u.id, b.choice));
  write('/api/company/upgrade', null, (u) => service.upgrade(u.id));
  write('/api/company/ipo', ipoSchema, (u, b) => service.ipo(u.id, b.industry));
  write('/api/company/apply', applySchema, (u, b) => {
    const r = service.apply(u.id, b.companyId);
    return r.ok ? { ok: true, value: { applicationId: r.value } } : r;
  });
  write('/api/company/applications', decideApplicationSchema, (u, b) =>
    service.decide(u.id, b.applicationId, b.approve),
  );
  write('/api/company/invite', null, (u) => {
    const r = service.createInvite(u.id);
    return r.ok ? { ok: true, value: { code: r.value } } : r;
  });
  write('/api/company/join', inviteCodeSchema, (u, b) => service.joinByCode(u.id, b.code));
  write('/api/company/leave', null, (u) => service.leave(u.id));
  write('/api/company/rejoin-default', null, (u) => service.rejoinDefault(u.id));
  write('/api/company/kick', memberCodeSchema, (u, b) =>
    service.kick(u.id, b.code, b.ban ?? false),
  );
  write('/api/company/promote', memberCodeSchema, (u, b) => service.promoteMember(u.id, b.code));
  write('/api/company/assign', assignTaskSchema, (u, b) =>
    service.assignTask(u.id, b.code, b.templateId),
  );
  write('/api/company/offer', offerDecisionSchema, (u, b) =>
    service.decideOffer(u.id, b.offerId, b.accept),
  );
}
