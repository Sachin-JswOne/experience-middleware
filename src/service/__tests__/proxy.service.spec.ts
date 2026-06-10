import Redis from 'ioredis';
import { ProxyService } from '../proxy.service';
import { RouteHandler } from 'src/enum/route-handler.enum';

describe('ProxyService - auth gate before cache', () => {
  let service: ProxyService;

  const redisMock = {
    get: jest.fn(),
    set: jest.fn(),
  } as unknown as Redis;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProxyService(redisMock);
  });

  // it('throws CustomError(400) if route needs auth and Authorization is missing and not guest', async () => {
  //   // Route that passes authorization downstream: needsAuth === true
  //   const routeNeedingAuth = {
  //     path: '/xp-mi/public/v1/protected',
  //     method: 'GET',
  //     routeHandler: RouteHandler.TRANSFORM,
  //     isCacheRequired: true,
  //     target: {
  //       name: 'protected-target',
  //       url: 'http://downstream',
  //       method: 'GET',
  //       headersToPass: [{ source: 'authorization', destination: 'authorization' }],
  //     },
  //   };

  //   (service as any).findRoute = jest.fn().mockReturnValue(routeNeedingAuth);

  //   const req: any = {
  //     method: 'GET',
  //     url: '/xp-mi/public/v1/protected',
  //     path: '/xp-mi/public/v1/protected',
  //     headers: {},
  //     query: {},
  //     params: {},
  //     body: {},
  //   };

  //   try {
  //     await service.handleRequest(req);
  //     fail('Expected CustomError to be thrown');
  //   } catch (err) {
  //     expect(err).toBeInstanceOf(CustomError);
  //     expect(err.message).toBe('Bad Request: Authorization required');
  //     expect((err as CustomError).httpStatusCode).toBe(400);
  //   }

  //   // Must fail BEFORE cache is touched
  //   expect(redisMock.get).not.toHaveBeenCalled();
  //   expect(redisMock.set).not.toHaveBeenCalled();
  // });

  it("allows guest request (x-user-state='G') and serves cached response", async () => {
    const routeNeedingAuth = {
      path: '/xp-mi/public/v1/protected',
      method: 'GET',
      routeHandler: RouteHandler.TRANSFORM,
      isCacheRequired: true,
      target: {
        name: 'protected-target',
        url: 'http://downstream',
        method: 'GET',
        headersToPass: [{ source: 'authorization', destination: 'authorization' }],
      },
    };

    (service as any).findRoute = jest.fn().mockReturnValue(routeNeedingAuth);

    const cachedPayload = { ok: true, from: 'cache' };
    (redisMock.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedPayload));

    const req: any = {
      method: 'GET',
      url: '/xp-mi/public/v1/protected',
      path: '/xp-mi/public/v1/protected',
      headers: {
        'x-user-state': 'G', // guest
      },
      query: {},
      params: {},
      body: {},
    };

    const result = await service.handleRequest(req);

    expect(redisMock.get).toHaveBeenCalledTimes(1);
    expect(result).toEqual(cachedPayload);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('allows request with Authorization header and proceeds to handler on cache MISS', async () => {
    const routeNeedingAuth = {
      path: '/xp-mi/public/v1/protected',
      method: 'GET',
      routeHandler: RouteHandler.TRANSFORM,
      isCacheRequired: true,
      target: {
        name: 'protected-target',
        url: 'http://downstream',
        method: 'GET',
        headersToPass: [{ source: 'authorization', destination: 'authorization' }],
      },
    };

    (service as any).findRoute = jest.fn().mockReturnValue(routeNeedingAuth);
    (redisMock.get as jest.Mock).mockResolvedValue(null);

    // Stub downstream call
    (service as any).handleTransformRequest = jest.fn().mockResolvedValue({ ok: true });

    const req: any = {
      method: 'GET',
      url: '/xp-mi/public/v1/protected',
      path: '/xp-mi/public/v1/protected',
      headers: {
        authorization: 'Bearer valid-token',
      },
      query: {},
      params: {},
      body: {},
    };

    const result = await service.handleRequest(req);

    expect(redisMock.get).toHaveBeenCalledTimes(1);
    expect((service as any).handleTransformRequest).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });
});
